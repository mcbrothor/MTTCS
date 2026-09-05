-- 종가베팅만 240초 HTTP 실행 및 300초 응답 수집 창을 사용한다. 기존 작업은 55초/120초를 유지한다.
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
      timeout_milliseconds := case when p_path like '/api/cron/closing-bet?%' then 240000 else 55000 end
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
    and run.status in ('QUEUED', 'TIMED_OUT');
  get diagnostics completed_count = row_count;

  update public.cron_http_runs as run
  set status = 'TIMED_OUT',
      error_message = 'No pg_net response was received within the configured request window.',
      completed_at = clock_timestamp()
  where run.status in ('CLAIMED', 'QUEUED')
    and run.requested_at < clock_timestamp() - case when run.path like '/api/cron/closing-bet?%' then interval '300 seconds' else interval '120 seconds' end
    and not exists (
      select 1
      from net._http_response as response
      where response.id = run.request_id
    );
  get diagnostics timed_out_count = row_count;

  return completed_count + timed_out_count;
end;
$$;


-- UTC 트리거. 핸들러에서 한국 거래일과 실제 세션 시각을 재검증한다.
insert into public.cron_job_definitions (
  job_name, path, schedule, slot_minutes, expected_delay_seconds, enabled, updated_at
)
values
  (
    'mtn-closing-kospi-prepare',
    '/api/cron/closing-bet?market=KOSPI200&phase=prepare&dryRun=false',
    '*/4 0-7 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kospi-watch',
    '/api/cron/closing-bet?market=KOSPI200&phase=watch&dryRun=false',
    '*/15 4-7 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kospi-final',
    '/api/cron/closing-bet?market=KOSPI200&phase=final&dryRun=false',
    '* 6-7 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kospi-monitor',
    '/api/cron/closing-bet?market=KOSPI200&phase=monitor&dryRun=false',
    '*/2 6-8 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kospi-review',
    '/api/cron/closing-bet?market=KOSPI200&phase=review&dryRun=false',
    '*/15 0-2 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kosdaq-prepare',
    '/api/cron/closing-bet?market=KOSDAQ150&phase=prepare&dryRun=false',
    '*/4 0-7 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kosdaq-watch',
    '/api/cron/closing-bet?market=KOSDAQ150&phase=watch&dryRun=false',
    '*/15 4-7 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kosdaq-final',
    '/api/cron/closing-bet?market=KOSDAQ150&phase=final&dryRun=false',
    '* 6-7 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kosdaq-monitor',
    '/api/cron/closing-bet?market=KOSDAQ150&phase=monitor&dryRun=false',
    '*/2 6-8 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-closing-kosdaq-review',
    '/api/cron/closing-bet?market=KOSDAQ150&phase=review&dryRun=false',
    '*/15 0-2 * * 1-5',
    1,
    352800,
    true,
    now()
  )
on conflict (job_name) do update
set path = excluded.path, schedule = excluded.schedule, slot_minutes = excluded.slot_minutes,
    expected_delay_seconds = excluded.expected_delay_seconds, enabled = excluded.enabled, updated_at = excluded.updated_at;

select cron.schedule(
  'mtn-closing-kospi-prepare',
  '*/4 0-7 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kospi-prepare', '/api/cron/closing-bet?market=KOSPI200&phase=prepare&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kospi-watch',
  '*/15 4-7 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kospi-watch', '/api/cron/closing-bet?market=KOSPI200&phase=watch&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kospi-final',
  '* 6-7 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kospi-final', '/api/cron/closing-bet?market=KOSPI200&phase=final&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kospi-monitor',
  '*/2 6-8 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kospi-monitor', '/api/cron/closing-bet?market=KOSPI200&phase=monitor&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kospi-review',
  '*/15 0-2 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kospi-review', '/api/cron/closing-bet?market=KOSPI200&phase=review&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kosdaq-prepare',
  '*/4 0-7 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kosdaq-prepare', '/api/cron/closing-bet?market=KOSDAQ150&phase=prepare&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kosdaq-watch',
  '*/15 4-7 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kosdaq-watch', '/api/cron/closing-bet?market=KOSDAQ150&phase=watch&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kosdaq-final',
  '* 6-7 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kosdaq-final', '/api/cron/closing-bet?market=KOSDAQ150&phase=final&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kosdaq-monitor',
  '*/2 6-8 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kosdaq-monitor', '/api/cron/closing-bet?market=KOSDAQ150&phase=monitor&dryRun=false', 1);$$
);

select cron.schedule(
  'mtn-closing-kosdaq-review',
  '*/15 0-2 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-closing-kosdaq-review', '/api/cron/closing-bet?market=KOSDAQ150&phase=review&dryRun=false', 1);$$
);

-- 재생 가능한 캐시만 만료시킨다. 공식 추천·발송·성과 이력은 보존한다.
select cron.schedule('mtn-closing-cache-retention', '50 0 * * *',
  $$delete from public.closing_bet_cache where expires_at < now();$$);
