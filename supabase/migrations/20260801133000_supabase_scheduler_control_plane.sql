-- Forward-only control plane upgrade for every MTN background job.
-- Vercel only hosts the protected HTTP endpoints; it no longer owns schedules.
-- Required Vault secrets (created by an operator, never committed):
--   mtn_app_base_url = https://<production-host>
--   mtn_cron_secret = the same value as the Vercel CRON_SECRET

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

create schema if not exists mtn_internal;
revoke all on schema mtn_internal from public, anon, authenticated;

create table if not exists public.cron_job_definitions (
  job_name text primary key
    check (job_name ~ '^mtn-[a-z0-9-]+$'),
  path text not null
    check (
      path like '/api/cron/%'
      and path not like '%://%'
      and path not like '%' || chr(10) || '%'
      and path not like '%' || chr(13) || '%'
    ),
  schedule text not null check (char_length(schedule) between 5 and 100),
  slot_minutes smallint not null default 1 check (slot_minutes between 1 and 1440),
  expected_delay_seconds integer not null check (expected_delay_seconds between 60 and 691200),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cron_http_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  slot_started_at timestamptz not null,
  path text not null,
  request_id bigint unique,
  status text not null default 'CLAIMED'
    check (status in ('CLAIMED', 'QUEUED', 'SUCCESS', 'FAILED', 'TIMED_OUT')),
  http_status integer check (http_status between 100 and 599),
  error_message text,
  response_excerpt text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_name, slot_started_at)
);

create index if not exists cron_http_runs_job_requested_idx
  on public.cron_http_runs (job_name, requested_at desc);
create index if not exists cron_http_runs_pending_idx
  on public.cron_http_runs (requested_at)
  where status in ('CLAIMED', 'QUEUED', 'TIMED_OUT');

alter table public.cron_job_definitions enable row level security;
alter table public.cron_http_runs enable row level security;
revoke all on table public.cron_job_definitions from public, anon, authenticated;
revoke all on table public.cron_http_runs from public, anon, authenticated;
revoke all on sequence public.cron_http_runs_id_seq from public, anon, authenticated;
grant select on table public.cron_job_definitions to service_role;
grant select on table public.cron_http_runs to service_role;

drop policy if exists "Service role reads cron job definitions" on public.cron_job_definitions;
create policy "Service role reads cron job definitions"
  on public.cron_job_definitions
  for select
  to service_role
  using (true);

drop policy if exists "Service role reads cron HTTP runs" on public.cron_http_runs;
create policy "Service role reads cron HTTP runs"
  on public.cron_http_runs
  for select
  to service_role
  using (true);

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

  -- A duplicated delivery in the same execution slot is deliberately ignored.
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
      error_message = 'No pg_net response was received within 120 seconds.',
      completed_at = clock_timestamp()
  where run.status in ('CLAIMED', 'QUEUED')
    and run.requested_at < clock_timestamp() - interval '120 seconds'
    and not exists (
      select 1
      from net._http_response as response
      where response.id = run.request_id
    );
  get diagnostics timed_out_count = row_count;

  return completed_count + timed_out_count;
end;
$$;

revoke all on function mtn_internal.invoke_cron(text, text, integer)
  from public, anon, authenticated;
revoke all on function mtn_internal.collect_cron_http_responses()
  from public, anon, authenticated;

drop view if exists public.cron_scheduler_alerts;
drop view if exists public.cron_scheduler_health;

create view public.cron_scheduler_health
with (security_invoker = true)
as
select
  definition.job_name,
  definition.path,
  definition.schedule,
  definition.expected_delay_seconds,
  definition.enabled,
  latest.status as latest_status,
  latest.http_status as latest_http_status,
  latest.requested_at as last_attempt_at,
  latest.completed_at as last_completed_at,
  success.last_success_at,
  case
    when not definition.enabled then 'DISABLED'
    when latest.status in ('FAILED', 'TIMED_OUT') then 'FAILED'
    when success.last_success_at is null
      and clock_timestamp() > definition.updated_at
        + make_interval(secs => definition.expected_delay_seconds)
      then 'STALE'
    when success.last_success_at is null then 'PENDING'
    when clock_timestamp() > success.last_success_at
      + make_interval(secs => definition.expected_delay_seconds)
      then 'STALE'
    when latest.status in ('CLAIMED', 'QUEUED') then 'RUNNING'
    else 'HEALTHY'
  end as health_status,
  latest.error_message
from public.cron_job_definitions as definition
left join lateral (
  select
    run.status,
    run.http_status,
    run.requested_at,
    run.completed_at,
    run.error_message
  from public.cron_http_runs as run
  where run.job_name = definition.job_name
  order by run.requested_at desc
  limit 1
) as latest on true
left join lateral (
  select max(run.completed_at) as last_success_at
  from public.cron_http_runs as run
  where run.job_name = definition.job_name
    and run.status = 'SUCCESS'
) as success on true;

create view public.cron_scheduler_alerts
with (security_invoker = true)
as
select *
from public.cron_scheduler_health
where health_status in ('FAILED', 'STALE');

revoke all on table public.cron_scheduler_health from public, anon, authenticated;
revoke all on table public.cron_scheduler_alerts from public, anon, authenticated;
grant select on table public.cron_scheduler_health to service_role;
grant select on table public.cron_scheduler_alerts to service_role;

comment on table public.cron_job_definitions is
  'Server-only registry of Supabase-owned MTN HTTP schedules and freshness SLAs.';
comment on table public.cron_http_runs is
  'Durable request/response ledger and execution-slot idempotency boundary for MTN cron calls.';
comment on view public.cron_scheduler_health is
  'Latest HTTP result and freshness state for every Supabase-owned MTN schedule.';
comment on view public.cron_scheduler_alerts is
  'Failed or stale Supabase-owned MTN schedules requiring operator attention.';
comment on function mtn_internal.invoke_cron(text, text, integer) is
  'Claims an execution slot and invokes a protected MTN cron route using encrypted Vault secrets.';
comment on function mtn_internal.collect_cron_http_responses() is
  'Copies transient pg_net responses into the durable MTN scheduler ledger.';

-- Replace the complete scheduler registry as one reviewed unit.
delete from public.cron_job_definitions;

insert into public.cron_job_definitions (
  job_name,
  path,
  schedule,
  slot_minutes,
  expected_delay_seconds,
  enabled,
  updated_at
)
values
  ('mtn-snapshot-macro', '/api/cron/snapshot-market-state?type=macro', '0 21 * * *', 1, 93600, true, now()),
  ('mtn-snapshot-master-us', '/api/cron/snapshot-market-state?market=US&type=master-filter', '5 21 * * *', 1, 93600, true, now()),
  ('mtn-snapshot-master-kr', '/api/cron/snapshot-market-state?market=KR&type=master-filter', '10 07 * * *', 1, 93600, true, now()),
  ('mtn-contest-review-us', '/api/cron/contest-review-us', '0 04 * * *', 1, 93600, true, now()),
  ('mtn-contest-review-kr', '/api/cron/contest-review-kr', '0 08 * * *', 1, 93600, true, now()),
  ('mtn-daily-screeners', '/api/cron/daily-screeners', '0 09 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-performance-us-0', '/api/cron/recommendation-performance?market=US&shard=0&shards=4', '30 06 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-performance-us-1', '/api/cron/recommendation-performance?market=US&shard=1&shards=4', '35 06 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-performance-us-2', '/api/cron/recommendation-performance?market=US&shard=2&shards=4', '40 06 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-performance-us-3', '/api/cron/recommendation-performance?market=US&shard=3&shards=4', '45 06 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-performance-kr-0', '/api/cron/recommendation-performance?market=KR&shard=0&shards=4', '10 08 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-performance-kr-1', '/api/cron/recommendation-performance?market=KR&shard=1&shards=4', '15 08 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-performance-kr-2', '/api/cron/recommendation-performance?market=KR&shard=2&shards=4', '20 08 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-performance-kr-3', '/api/cron/recommendation-performance?market=KR&shard=3&shards=4', '25 08 * * *', 1, 93600, true, now()),
  ('mtn-recommendation-weekly', '/api/cron/recommendation-weekly', '0 07 * * 6', 1, 691200, true, now()),
  ('mtn-rs-metrics-us', '/api/cron/rs-metrics?market=US', '15 21 * * 1-5', 1, 352800, true, now()),
  ('mtn-risk-barometer', '/api/cron/risk-barometer?dryRun=false', '30 22 * * 1-5', 1, 352800, true, now()),
  ('mtn-rs-metrics-kr', '/api/cron/rs-metrics?market=KR', '15 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-edgar-backfill-a', '/api/cron/edgar-backfill?wave=A&size=80', '30 02 * * *', 1, 93600, true, now()),
  ('mtn-edgar-backfill-b', '/api/cron/edgar-backfill?wave=B&size=80', '0 03 * * *', 1, 93600, true, now()),
  ('mtn-gold-strategy', '/api/cron/gold-strategy?dryRun=false', '30 23 * * *', 1, 93600, true, now()),
  ('mtn-nasdaq-strategy', '/api/cron/nasdaq-strategy?dryRun=false', '45 23 * * 1-5', 1, 352800, true, now()),
  ('mtn-market-intelligence-feeds', '/api/cron/market-intelligence?mode=feeds', '*/30 * * * *', 30, 2700, true, now()),
  ('mtn-market-intelligence-indicators', '/api/cron/market-intelligence?mode=indicators', '35,45,55 12,13 * * *', 10, 93600, true, now());

-- Re-applying this migration cannot create duplicate schedules. pg_cron must be
-- managed through its functions; direct writes to cron.job are intentionally avoided.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname like 'mtn-%'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

do $$
declare
  definition record;
begin
  for definition in
    select job_name, path, schedule, slot_minutes
    from public.cron_job_definitions
    where enabled
    order by job_name
  loop
    perform cron.schedule(
      definition.job_name,
      definition.schedule,
      format(
        'select mtn_internal.invoke_cron(%L, %L, %s);',
        definition.job_name,
        definition.path,
        definition.slot_minutes
      )
    );
  end loop;
end;
$$;

select cron.schedule(
  'mtn-cron-response-monitor',
  '* * * * *',
  $cron$select mtn_internal.collect_cron_http_responses();$cron$
);

-- pg_cron does not prune its own history. Keep the small production database bounded.
select cron.schedule(
  'mtn-cron-history-prune',
  '17 02 * * *',
  $cron$
    delete from cron.job_run_details
    where end_time < now() - interval '30 days';
    delete from public.cron_http_runs
    where requested_at < now() - interval '90 days';
  $cron$
);
