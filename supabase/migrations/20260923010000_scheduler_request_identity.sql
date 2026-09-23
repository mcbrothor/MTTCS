-- pg_net's unlogged sequence resets after an unclean restart, but our durable
-- audit rows retain request IDs. Keep the uniqueness constraint and every audit
-- row; repair the transport sequence before dispatch instead of reusing IDs.
-- Supabase owns the extension sequence, so postgres cannot SET LOGGED. pg_net
-- grants UPDATE on it and table privileges on its queue to the calling role.
create or replace function mtn_internal.ensure_cron_request_identity()
returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  sequence_value bigint;
  sequence_called boolean;
  retained_id bigint;
begin
  -- Supported pg_net APIs acquire their queue INSERT lock before nextval.
  -- Serialize that boundary, including other HTTP callers, before reading or
  -- advancing the sequence. The background worker resumes at transaction end.
  lock table net.http_request_queue in share row exclusive mode;
  select last_value, is_called into sequence_value, sequence_called
  from net.http_request_queue_id_seq;
  select greatest(
    coalesce((select max(request_id) from public.cron_http_runs), 0),
    coalesce((select max(id) from net.http_request_queue), 0),
    coalesce((select max(id) from net._http_response), 0)
  ) into retained_id;
  if retained_id > sequence_value or (retained_id = sequence_value and not sequence_called) then
    -- setval is nontransactional; only advance, so rollback cannot reuse an ID.
    perform pg_catalog.setval('net.http_request_queue_id_seq'::regclass, retained_id, true);
  end if;
end;
$$;

revoke all on function mtn_internal.ensure_cron_request_identity() from public, anon, authenticated;

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

    perform mtn_internal.ensure_cron_request_identity();

    select net.http_get(
      url := rtrim(app_base_url, '/') || p_path,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || cron_secret,
        'User-Agent', 'mtn-supabase-cron/2.0'
      ),
      timeout_milliseconds := case when p_path like '/api/cron/closing-bet?%' then 240000 else 280000 end
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

-- A response must belong to the run's lifetime. In particular, a new response
-- using a reset ID must not repair a TIMED_OUT run from before this server boot.
create or replace function mtn_internal.collect_cron_http_responses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_count integer := 0;
  timed_out_count integer := 0;
begin
  update public.cron_http_runs as run
  set status = case
        when response.timed_out then 'TIMED_OUT'
        when response.error_msg is not null then 'FAILED'
        when response.status_code between 200 and 299 then 'SUCCESS'
        else 'FAILED'
      end,
      business_status = case
        when response.timed_out or response.error_msg is not null then 'FAILED'
        when response.status_code between 200 and 299 then mtn_internal.cron_business_status(run.path, response.content)
        else 'FAILED'
      end,
      business_reason = case when response.status_code between 200 and 299 then
        left(mtn_internal.cron_business_payload(response.content)->>'reason', 2000)
        else left(response.error_msg, 2000) end,
      http_status = response.status_code,
      error_message = case
        when response.timed_out then coalesce(response.error_msg, 'pg_net request timed out')
        when response.error_msg is not null then left(response.error_msg, 2000)
        when response.status_code between 200 and 299 then null
        else 'HTTP ' || coalesce(response.status_code::text, 'unknown')
      end,
      response_excerpt = left(coalesce(response.content, ''), 2000),
      completed_at = response.created
  from net._http_response as response
  where run.request_id = response.id
    and response.created >= run.requested_at
    and (run.requested_at >= pg_postmaster_start_time() or response.created < pg_postmaster_start_time())
    and run.status in ('QUEUED', 'TIMED_OUT');
  get diagnostics completed_count = row_count;

  update public.cron_http_runs as run
  set status = 'TIMED_OUT',
      business_status = 'FAILED',
      error_message = 'No pg_net response was received within the configured request window.',
      completed_at = clock_timestamp()
  where run.status in ('CLAIMED', 'QUEUED')
    and run.requested_at < clock_timestamp() - case when run.path like '/api/cron/closing-bet?%' then interval '300 seconds' else interval '290 seconds' end
    and not exists (
      select 1 from net._http_response as response
      where response.id = run.request_id
        and response.created >= run.requested_at
        and (run.requested_at >= pg_postmaster_start_time() or response.created < pg_postmaster_start_time())
    );
  get diagnostics timed_out_count = row_count;
  return completed_count + timed_out_count;
end;
$$;

revoke all on function mtn_internal.collect_cron_http_responses() from public, anon, authenticated;

