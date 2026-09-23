-- Canonicalize dated retries once in the index instead of regex-scanning every job's history.
create or replace function mtn_internal.cron_health_job_name(p_job_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select case
    when p_job_name ~ '^mtn-recommendation-performance-retry-(us|kr)-[0-3]-[0-9]{8}$'
      then 'mtn-recommendation-performance-' || split_part(p_job_name, '-', 5) || '-' || split_part(p_job_name, '-', 6)
    when p_job_name ~ '^mtn-recommendation-performance-retry-finalize-(us|kr)-[0-9]{8}$'
      then 'mtn-recommendation-performance-' || split_part(p_job_name, '-', 6) || '-0'
    else p_job_name
  end;
$$;

revoke all on function mtn_internal.cron_health_job_name(text) from public, anon, authenticated;
grant usage on schema mtn_internal to service_role;
grant execute on function mtn_internal.cron_health_job_name(text) to service_role;

create index if not exists cron_http_runs_health_job_requested_idx
  on public.cron_http_runs (mtn_internal.cron_health_job_name(job_name), requested_at desc, id desc);

create or replace view public.cron_scheduler_health
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
    when outcome.status in ('FAILED', 'TIMED_OUT') then 'FAILED'
    when success.last_success_at is null
      and clock_timestamp() > definition.updated_at + make_interval(secs => definition.expected_delay_seconds) then 'STALE'
    when success.last_success_at is null then 'PENDING'
    when clock_timestamp() > success.last_success_at + make_interval(secs => definition.expected_delay_seconds) then 'STALE'
    when latest.status in ('CLAIMED', 'QUEUED') then 'RUNNING'
    else 'HEALTHY'
  end as health_status,
  outcome.error_message,
  latest.business_status as latest_business_status,
  latest.business_reason as latest_business_reason
from public.cron_job_definitions as definition
left join lateral (
  select run.* from public.cron_http_runs as run
  where mtn_internal.cron_health_job_name(run.job_name) = definition.job_name
  order by run.requested_at desc, run.id desc limit 1
) as latest on true
left join lateral (
  select
    case when run.business_status in ('DATA_BLOCKED', 'DELIVERY_FAILED') then 'FAILED' else run.status end as status,
    coalesce(run.error_message, case when run.business_status in ('DATA_BLOCKED', 'DELIVERY_FAILED')
      then coalesce(run.business_reason, run.business_status) end) as error_message
  from public.cron_http_runs as run
  where mtn_internal.cron_health_job_name(run.job_name) = definition.job_name
    and run.status in ('SUCCESS', 'FAILED', 'TIMED_OUT')
    and (run.path not like '/api/cron/closing-bet?%'
      or run.status in ('FAILED', 'TIMED_OUT')
      or run.business_status in ('SUCCESS', 'HELD', 'DATA_BLOCKED', 'DELIVERY_FAILED'))
  order by run.requested_at desc, run.id desc limit 1
) as outcome on true
left join lateral (
  select max(run.completed_at) as last_success_at from public.cron_http_runs as run
  where mtn_internal.cron_health_job_name(run.job_name) = definition.job_name and run.status = 'SUCCESS'
    and (run.path not like '/api/cron/closing-bet?%' or run.business_status in ('SUCCESS', 'HELD'))
) as success on true;

create or replace view public.cron_scheduler_alerts
with (security_invoker = true)
as select * from public.cron_scheduler_health where health_status in ('FAILED', 'STALE');

revoke all on table public.cron_scheduler_health, public.cron_scheduler_alerts from public, anon, authenticated;
grant select on table public.cron_scheduler_health, public.cron_scheduler_alerts to service_role;
