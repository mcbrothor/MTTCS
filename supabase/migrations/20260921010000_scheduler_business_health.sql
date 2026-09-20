-- HTTP acceptance and completed business work are distinct for closing-bet jobs.
-- A later out-of-window response must not recover an earlier failed execution.
alter table public.cron_http_runs
  add column if not exists business_status text,
  add column if not exists business_reason text;

create or replace function mtn_internal.cron_business_payload(p_content text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (p_content::jsonb)->'data';
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function mtn_internal.cron_business_status(p_path text, p_content text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  payload jsonb;
  snapshot jsonb;
  delivery jsonb;
  collected numeric;
  total numeric;
  member_count numeric;
  expected_count numeric;
begin
  if p_path not like '/api/cron/closing-bet?%' then return 'SUCCESS'; end if;
  payload := mtn_internal.cron_business_payload(p_content);
  if payload is null or jsonb_typeof(payload) <> 'object' then return 'UNKNOWN'; end if;
  if payload->'skipped' = 'true'::jsonb then return 'SKIPPED'; end if;
  if payload->'pending' = 'true'::jsonb then return 'PENDING'; end if;
  if payload = '{}'::jsonb then return 'UNKNOWN'; end if;
  if p_path ~ '[?&]phase=final(&|$)' then
    snapshot := payload->'snapshot';
    delivery := payload->'delivery';
    if snapshot->>'phase' is distinct from 'FINAL'
      or coalesce(snapshot->>'status', '') not in ('READY', 'DEGRADED', 'BLOCKED')
      or jsonb_typeof(snapshot->'picks') is distinct from 'array'
      or jsonb_typeof(snapshot#>'{coverage,collected}') is distinct from 'number'
      or jsonb_typeof(snapshot#>'{coverage,total}') is distinct from 'number'
      or jsonb_typeof(snapshot#>'{universe,count}') is distinct from 'number'
      or jsonb_typeof(snapshot#>'{universe,expectedCount}') is distinct from 'number'
    then return 'UNKNOWN'; end if;
    collected := (snapshot#>>'{coverage,collected}')::numeric;
    total := (snapshot#>>'{coverage,total}')::numeric;
    member_count := (snapshot#>>'{universe,count}')::numeric;
    expected_count := (snapshot#>>'{universe,expectedCount}')::numeric;
    -- Match the closing-bet engine's 95% minimum coverage policy.
    if total <= 0 or expected_count <= 0 or total < expected_count
      or collected > total or collected < total * 0.95
      or member_count < expected_count * 0.95
      or coalesce(snapshot->>'regime', '') not in ('GREEN', 'YELLOW', 'RED')
      or coalesce(snapshot->'warnings', '[]'::jsonb) ? 'LIVE_RECOMMENDATION_EXPIRED'
    then return 'DATA_BLOCKED'; end if;
    if jsonb_typeof(delivery->'sent') is distinct from 'number'
      or jsonb_typeof(delivery->'skipped') is distinct from 'number'
      or jsonb_typeof(delivery->'failed') is distinct from 'number'
    then return 'DELIVERY_FAILED'; end if;
    if (delivery->>'sent')::numeric < 0 or (delivery->>'skipped')::numeric < 0
      or (delivery->>'failed')::numeric <> 0
      or (delivery->>'sent')::numeric + (delivery->>'skipped')::numeric <= 0
    then return 'DELIVERY_FAILED'; end if;
    if snapshot->>'regime' = 'RED' or jsonb_array_length(snapshot->'picks') = 0 then return 'HELD'; end if;
    if snapshot->>'status' = 'BLOCKED' then return 'DATA_BLOCKED'; end if;
  end if;
  return 'SUCCESS';
end;
$$;

revoke all on function mtn_internal.cron_business_payload(text) from public, anon, authenticated;
revoke all on function mtn_internal.cron_business_status(text, text) from public, anon, authenticated;
grant execute on function mtn_internal.cron_business_payload(text) to service_role;
grant execute on function mtn_internal.cron_business_status(text, text) to service_role;

update public.cron_http_runs
set business_status = case
      when status in ('FAILED', 'TIMED_OUT') then 'FAILED'
      when status = 'SUCCESS' then mtn_internal.cron_business_status(path, response_excerpt)
      else null
    end,
    business_reason = case when status = 'SUCCESS' then
      left(mtn_internal.cron_business_payload(response_excerpt)->>'reason', 2000)
      else error_message end
where business_status is null and status in ('SUCCESS', 'FAILED', 'TIMED_OUT');

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
    and run.status in ('QUEUED', 'TIMED_OUT');
  get diagnostics completed_count = row_count;

  update public.cron_http_runs as run
  set status = 'TIMED_OUT',
      business_status = 'FAILED',
      error_message = 'No pg_net response was received within the configured request window.',
      completed_at = clock_timestamp()
  where run.status in ('CLAIMED', 'QUEUED')
    and run.requested_at < clock_timestamp() - case when run.path like '/api/cron/closing-bet?%' then interval '300 seconds' else interval '290 seconds' end
    and not exists (select 1 from net._http_response as response where response.id = run.request_id);
  get diagnostics timed_out_count = row_count;
  return completed_count + timed_out_count;
end;
$$;

revoke all on function mtn_internal.collect_cron_http_responses() from public, anon, authenticated;

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
  where run.job_name = definition.job_name
  order by run.requested_at desc, run.id desc limit 1
) as latest on true
left join lateral (
  select
    case when run.business_status in ('DATA_BLOCKED', 'DELIVERY_FAILED') then 'FAILED' else run.status end as status,
    coalesce(run.error_message, case when run.business_status in ('DATA_BLOCKED', 'DELIVERY_FAILED')
      then coalesce(run.business_reason, run.business_status) end) as error_message
  from public.cron_http_runs as run
  where run.job_name = definition.job_name
    and run.status in ('SUCCESS', 'FAILED', 'TIMED_OUT')
    and (run.path not like '/api/cron/closing-bet?%'
      or run.status in ('FAILED', 'TIMED_OUT')
      or run.business_status in ('SUCCESS', 'HELD', 'DATA_BLOCKED', 'DELIVERY_FAILED'))
  order by run.requested_at desc, run.id desc limit 1
) as outcome on true
left join lateral (
  select max(run.completed_at) as last_success_at from public.cron_http_runs as run
  where run.job_name = definition.job_name and run.status = 'SUCCESS'
    and (run.path not like '/api/cron/closing-bet?%' or run.business_status in ('SUCCESS', 'HELD'))
) as success on true;

create or replace view public.cron_scheduler_alerts
with (security_invoker = true)
as select * from public.cron_scheduler_health where health_status in ('FAILED', 'STALE');

revoke all on table public.cron_scheduler_health, public.cron_scheduler_alerts from public, anon, authenticated;
grant select on table public.cron_scheduler_health, public.cron_scheduler_alerts to service_role;
