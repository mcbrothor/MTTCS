-- Remove the PL/pgSQL variable/column ambiguity in the scheduler's idempotent
-- execution-slot claim. The named constraint preserves the same semantics.

create or replace function mtn_internal.invoke_cron(
  p_job_name text,
  p_path text,
  p_slot_minutes integer default 1
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_base_url text;
  cron_secret text;
  queued_request_id bigint;
  run_id bigint;
  slot_started_at timestamptz;
begin
  if p_job_name is null or p_job_name !~ '^mtn-[a-z0-9-]+$' then
    raise exception 'A valid MTN cron job name is required.';
  end if;
  if p_path is null
    or p_path not like '/api/cron/%'
    or p_path like '%://%'
    or p_path like '%' || chr(10) || '%'
    or p_path like '%' || chr(13) || '%'
  then
    raise exception 'Only relative /api/cron/* paths are allowed.';
  end if;
  if p_slot_minutes is null or p_slot_minutes < 1 or p_slot_minutes > 1440 then
    raise exception 'slot_minutes must be between 1 and 1440.';
  end if;

  slot_started_at := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / (p_slot_minutes * 60))
      * (p_slot_minutes * 60)
  );

  insert into public.cron_http_runs (
    job_name,
    slot_started_at,
    path,
    status,
    requested_at
  )
  values (
    p_job_name,
    slot_started_at,
    p_path,
    'CLAIMED',
    clock_timestamp()
  )
  on conflict on constraint cron_http_runs_job_name_slot_started_at_key do nothing
  returning id into run_id;

  if run_id is null then
    return null;
  end if;

  begin
    select decrypted_secret
    into app_base_url
    from vault.decrypted_secrets
    where name = 'mtn_app_base_url'
    limit 1;

    select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
    where name = 'mtn_cron_secret'
    limit 1;

    if app_base_url is null or cron_secret is null then
      raise exception 'Vault secrets mtn_app_base_url and mtn_cron_secret are required.';
    end if;
    if app_base_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?$' then
      raise exception 'mtn_app_base_url must be an HTTPS origin without a path.';
    end if;

    select net.http_get(
      url := rtrim(app_base_url, '/') || p_path,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || cron_secret,
        'User-Agent', 'mtn-supabase-cron/2.0'
      ),
      timeout_milliseconds := 55000
    )
    into queued_request_id;

    update public.cron_http_runs
    set request_id = queued_request_id,
        status = 'QUEUED'
    where id = run_id;

    return queued_request_id;
  exception
    when others then
      update public.cron_http_runs
      set status = 'FAILED',
          error_message = left(sqlstate || ': ' || sqlerrm, 2000),
          completed_at = clock_timestamp()
      where id = run_id;
      return null;
  end;
end;
$$;

revoke all on function mtn_internal.invoke_cron(text, text, integer)
  from public, anon, authenticated;
