-- Forward-only repair for the free-tier retry budget.
-- One 15-minute sweep may dispatch at most one shard or one finalization retry.

create table if not exists mtn_internal.recommendation_performance_retry_sweep_state (
  state_key text primary key check (state_key = 'singleton'),
  last_candidate_key text,
  last_slot_started_at timestamptz,
  last_dispatched_at timestamptz,
  dispatch_count bigint not null default 0 check (dispatch_count >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table mtn_internal.recommendation_performance_retry_sweep_state
  from public, anon, authenticated, service_role;

insert into mtn_internal.recommendation_performance_retry_sweep_state (state_key)
values ('singleton')
on conflict (state_key) do nothing;

create or replace function mtn_internal.retry_recommendation_performance_batches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  utc_now timestamp := clock_timestamp() at time zone 'UTC';
  sweep_slot_started_at timestamptz;
  sweep_state mtn_internal.recommendation_performance_retry_sweep_state%rowtype;
  selected_candidate record;
  retry_job_name text;
  retry_path text;
  queued_request_id bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('mtn:recommendation-performance:retry-sweep', 0)
  );

  sweep_slot_started_at := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 900) * 900
  );

  select state.*
  into sweep_state
  from mtn_internal.recommendation_performance_retry_sweep_state as state
  where state.state_key = 'singleton'
  for update;

  -- Duplicate/manual delivery in the same 15-minute slot cannot consume more budget.
  if sweep_state.last_slot_started_at = sweep_slot_started_at then
    return 0;
  end if;

  -- Seed a batch after all four official shard start windows have elapsed, even
  -- if no original HTTP request reached the route.
  if utc_now::time >= time '06:50' then
    insert into public.recommendation_performance_batches (batch_date, market, shard_count)
    values (utc_now::date, 'US', 4)
    on conflict (batch_date, market) do nothing;
  end if;
  if utc_now::time >= time '08:30' then
    insert into public.recommendation_performance_batches (batch_date, market, shard_count)
    values (utc_now::date, 'KR', 4)
    on conflict (batch_date, market) do nothing;
  end if;

  with batch_state as (
    select
      batch.batch_date,
      batch.market,
      batch.finalization_status,
      batch.finalization_claimed_at,
      count(*) filter (where shard_run.status = 'SUCCESS')::integer as successful_shards
    from public.recommendation_performance_batches as batch
    left join public.recommendation_performance_batch_shards as shard_run
      on shard_run.batch_date = batch.batch_date
     and shard_run.market = batch.market
    where batch.batch_date between utc_now::date - 2 and utc_now::date
      and batch.finalization_status <> 'SUCCESS'
    group by
      batch.batch_date,
      batch.market,
      batch.finalization_status,
      batch.finalization_claimed_at
  ),
  candidates as (
    select
      format(
        '%s:%s:F:0',
        to_char(batch.batch_date, 'YYYYMMDD'),
        batch.market
      ) as candidate_key,
      batch.batch_date,
      batch.market,
      0::integer as shard,
      'FINALIZATION'::text as candidate_kind
    from batch_state as batch
    where batch.successful_shards = 4
      and (
        batch.finalization_status in ('PENDING', 'FAILED')
        or (
          batch.finalization_status = 'CLAIMED'
          and (
            batch.finalization_claimed_at is null
            or batch.finalization_claimed_at < clock_timestamp() - interval '10 minutes'
          )
        )
      )

    union all

    select
      format(
        '%s:%s:S:%s',
        to_char(batch.batch_date, 'YYYYMMDD'),
        batch.market,
        expected.shard
      ) as candidate_key,
      batch.batch_date,
      batch.market,
      expected.shard::integer as shard,
      'SHARD'::text as candidate_kind
    from batch_state as batch
    cross join generate_series(0, 3) as expected(shard)
    left join public.recommendation_performance_batch_shards as shard_run
      on shard_run.batch_date = batch.batch_date
     and shard_run.market = batch.market
     and shard_run.shard = expected.shard
    where batch.successful_shards < 4
      and (
        shard_run.status is null
        or shard_run.status in ('PENDING', 'DEGRADED', 'FAILED')
        or (
          shard_run.status = 'RUNNING'
          and (
            shard_run.claimed_at is null
            or shard_run.claimed_at < clock_timestamp() - interval '10 minutes'
          )
        )
      )
  )
  select candidate.*
  into selected_candidate
  from candidates as candidate
  order by
    case
      when sweep_state.last_candidate_key is not null
        and candidate.candidate_key > sweep_state.last_candidate_key
      then 0
      else 1
    end,
    candidate.candidate_key
  limit 1;

  if not found then
    return 0;
  end if;

  if selected_candidate.candidate_kind = 'FINALIZATION' then
    retry_job_name := format(
      'mtn-recommendation-performance-retry-finalize-%s-%s',
      lower(selected_candidate.market),
      to_char(selected_candidate.batch_date, 'YYYYMMDD')
    );
  else
    retry_job_name := format(
      'mtn-recommendation-performance-retry-%s-%s-%s',
      lower(selected_candidate.market),
      selected_candidate.shard,
      to_char(selected_candidate.batch_date, 'YYYYMMDD')
    );
  end if;

  retry_path := format(
    '/api/cron/recommendation-performance?market=%s&shard=%s&shards=4&batchDate=%s',
    selected_candidate.market,
    selected_candidate.shard,
    selected_candidate.batch_date
  );

  queued_request_id := mtn_internal.invoke_cron(retry_job_name, retry_path, 15);

  update mtn_internal.recommendation_performance_retry_sweep_state as state
  set last_candidate_key = selected_candidate.candidate_key,
      last_slot_started_at = sweep_slot_started_at,
      last_dispatched_at = clock_timestamp(),
      dispatch_count = state.dispatch_count + 1,
      updated_at = clock_timestamp()
  where state.state_key = 'singleton';

  return case when queued_request_id is null then 0 else 1 end;
end;
$$;

revoke all on function mtn_internal.retry_recommendation_performance_batches()
  from public, anon, authenticated, service_role;

-- Treat a dated retry as an execution of its official shard for health purposes.
-- Chronological ordering means a newer retry failure remains visible, while a
-- newer retry success clears an older official failure.
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
    or (
      definition.job_name ~ '^mtn-recommendation-performance-(us|kr)-[0-3]$'
      and (
        run.job_name ~ format(
          '^mtn-recommendation-performance-retry-%s-%s-[0-9]{8}$',
          split_part(definition.job_name, '-', 4),
          split_part(definition.job_name, '-', 5)
        )
        or (
          split_part(definition.job_name, '-', 5) = '0'
          and run.job_name ~ format(
            '^mtn-recommendation-performance-retry-finalize-%s-[0-9]{8}$',
            split_part(definition.job_name, '-', 4)
          )
        )
      )
    )
  order by run.requested_at desc, run.id desc
  limit 1
) as latest on true
left join lateral (
  select max(run.completed_at) as last_success_at
  from public.cron_http_runs as run
  where run.status = 'SUCCESS'
    and (
      run.job_name = definition.job_name
      or (
        definition.job_name ~ '^mtn-recommendation-performance-(us|kr)-[0-3]$'
        and (
          run.job_name ~ format(
            '^mtn-recommendation-performance-retry-%s-%s-[0-9]{8}$',
            split_part(definition.job_name, '-', 4),
            split_part(definition.job_name, '-', 5)
          )
          or (
            split_part(definition.job_name, '-', 5) = '0'
            and run.job_name ~ format(
              '^mtn-recommendation-performance-retry-finalize-%s-[0-9]{8}$',
              split_part(definition.job_name, '-', 4)
            )
          )
        )
      )
    )
) as success on true;

create or replace view public.cron_scheduler_alerts
with (security_invoker = true)
as
select *
from public.cron_scheduler_health
where health_status in ('FAILED', 'STALE');

revoke all on table public.cron_scheduler_health from public, anon, authenticated;
revoke all on table public.cron_scheduler_alerts from public, anon, authenticated;
grant select on table public.cron_scheduler_health to service_role;
grant select on table public.cron_scheduler_alerts to service_role;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'mtn-recommendation-performance-retry-sweep'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'mtn-recommendation-performance-retry-sweep',
  '*/15 * * * *',
  $cron$select mtn_internal.retry_recommendation_performance_batches();$cron$
);

comment on table mtn_internal.recommendation_performance_retry_sweep_state is
  'Singleton slot budget and round-robin cursor for free-tier recommendation performance retries.';
comment on function mtn_internal.retry_recommendation_performance_batches() is
  'Queues at most one fair, deterministic recommendation-performance shard or finalization retry per 15-minute slot.';
comment on view public.cron_scheduler_health is
  'Latest effective HTTP result for each official job; dated recommendation-performance retries are safely aliased to their shard.';
