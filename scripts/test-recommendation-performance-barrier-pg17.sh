#!/usr/bin/env bash
set -euo pipefail

pg17_bin="${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
if [[ ! -x "$pg17_bin/initdb" || ! -x "$pg17_bin/pg_ctl" || ! -x "$pg17_bin/psql" ]]; then
  echo "PostgreSQL 17 binaries were not found at $pg17_bin" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
barrier_migration="$repo_root/supabase/migrations/20260802160000_recommendation_performance_scheduler_barrier.sql"
budget_migration="$repo_root/supabase/migrations/20260802170000_recommendation_performance_retry_budget.sql"
test_root="$(mktemp -d "/tmp/mtn-pg17.XXXXXX")"
data_dir="$test_root/data"
socket_dir="$test_root/socket"
mkdir -p "$socket_dir"

cleanup() {
  if [[ -f "$data_dir/postmaster.pid" ]]; then
    "$pg17_bin/pg_ctl" -D "$data_dir" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf -- "$test_root"
}
trap cleanup EXIT

"$pg17_bin/initdb" -D "$data_dir" -A trust -U postgres --no-locale >/dev/null
postgres_log="$test_root/postgres.log"
if ! "$pg17_bin/pg_ctl" -D "$data_dir" -l "$postgres_log" -o "-k '$socket_dir' -c listen_addresses=''" -w start >/dev/null; then
  tail -n 40 "$postgres_log" >&2 || true
  exit 1
fi

psql_cmd=("$pg17_bin/psql" -X -v ON_ERROR_STOP=1 -h "$socket_dir" -U postgres -d postgres)

"${psql_cmd[@]}" >/dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema mtn_internal;
create schema vault;
create schema net;
create schema cron;

create table vault.decrypted_secrets (
  name text primary key,
  decrypted_secret text
);
insert into vault.decrypted_secrets values
  ('mtn_app_base_url', 'https://example.invalid'),
  ('mtn_cron_secret', 'fixture-secret');

create sequence net.request_id_seq;
create function net.http_get(
  url text,
  headers jsonb,
  timeout_milliseconds integer
)
returns bigint
language sql
as $$ select nextval('net.request_id_seq') $$;
create table net._http_response (
  id bigint primary key,
  status_code integer,
  content text,
  timed_out boolean not null default false,
  error_msg text,
  created timestamptz not null default clock_timestamp()
);

create table cron.job (
  jobid bigint generated always as identity primary key,
  jobname text unique not null,
  schedule text not null,
  command text not null
);
create function cron.schedule(job_name text, schedule text, command text)
returns bigint
language plpgsql
as $$
declare scheduled_job_id bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update
    set schedule = excluded.schedule,
        command = excluded.command
  returning jobid into scheduled_job_id;
  return scheduled_job_id;
end;
$$;
create function cron.unschedule(target_job_id bigint)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobid = target_job_id;
  return found;
end;
$$;

create table public.cron_http_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  slot_started_at timestamptz not null,
  path text not null,
  request_id bigint unique,
  status text not null check (status in ('CLAIMED', 'QUEUED', 'SUCCESS', 'FAILED', 'TIMED_OUT')),
  http_status integer,
  error_message text,
  response_excerpt text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cron_http_runs_job_name_slot_started_at_key unique (job_name, slot_started_at)
);

create table public.cron_job_definitions (
  job_name text primary key,
  path text not null,
  schedule text not null,
  slot_minutes smallint not null default 1,
  expected_delay_seconds integer not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create view public.cron_scheduler_health as
select
  definition.job_name,
  definition.path,
  definition.schedule,
  definition.expected_delay_seconds,
  definition.enabled,
  null::text as latest_status,
  null::integer as latest_http_status,
  null::timestamptz as last_attempt_at,
  null::timestamptz as last_completed_at,
  null::timestamptz as last_success_at,
  'PENDING'::text as health_status,
  null::text as error_message
from public.cron_job_definitions as definition;
create view public.cron_scheduler_alerts as
select * from public.cron_scheduler_health where health_status in ('FAILED', 'STALE');
SQL

"${psql_cmd[@]}" -f "$barrier_migration" >/dev/null
"${psql_cmd[@]}" -f "$budget_migration" >/dev/null

claim_sql="select public.claim_recommendation_performance_shard('2026-08-02', 'US', 0, 4) ->> 'claimed';"
"${psql_cmd[@]}" -Atc "$claim_sql" >"$test_root/shard-claim-a" &
first_pid=$!
"${psql_cmd[@]}" -Atc "$claim_sql" >"$test_root/shard-claim-b" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

shard_claim_count="$(grep -h -c '^true$' "$test_root/shard-claim-a" "$test_root/shard-claim-b" | awk -F: '{ total += $NF } END { print total + 0 }')"
if [[ "$shard_claim_count" != "1" ]]; then
  echo "Expected one concurrent shard claim, observed $shard_claim_count" >&2
  exit 1
fi

"${psql_cmd[@]}" >/dev/null <<'SQL'
do $$
declare
  shard_index integer;
  shard_claim jsonb;
  barrier_claim jsonb;
begin
  perform public.complete_recommendation_performance_shard(
    '2026-08-02',
    'US',
    0,
    (select claim_token from public.recommendation_performance_batch_shards
      where batch_date = '2026-08-02' and market = 'US' and shard = 0),
    'SUCCESS',
    '{}'::jsonb,
    null
  );
  barrier_claim := public.claim_recommendation_performance_finalization('2026-08-02', 'US');
  if (barrier_claim ->> 'claimed')::boolean
    or barrier_claim ->> 'barrier_status' <> 'WAITING'
  then
    raise exception 'A missing-shard batch crossed the finalization barrier: %', barrier_claim;
  end if;
  for shard_index in 1..3 loop
    shard_claim := public.claim_recommendation_performance_shard(
      '2026-08-02', 'US', shard_index, 4
    );
    perform public.complete_recommendation_performance_shard(
      '2026-08-02',
      'US',
      shard_index,
      (shard_claim ->> 'claim_token')::uuid,
      'SUCCESS',
      '{}'::jsonb,
      null
    );
  end loop;
end;
$$;
SQL

finalize_sql="select public.claim_recommendation_performance_finalization('2026-08-02', 'US') ->> 'claimed';"
"${psql_cmd[@]}" -Atc "$finalize_sql" >"$test_root/finalize-claim-a" &
first_pid=$!
"${psql_cmd[@]}" -Atc "$finalize_sql" >"$test_root/finalize-claim-b" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

finalize_claim_count="$(grep -h -c '^true$' "$test_root/finalize-claim-a" "$test_root/finalize-claim-b" | awk -F: '{ total += $NF } END { print total + 0 }')"
if [[ "$finalize_claim_count" != "1" ]]; then
  echo "Expected one concurrent finalization claim, observed $finalize_claim_count" >&2
  exit 1
fi

"${psql_cmd[@]}" >/dev/null <<'SQL'
select public.complete_recommendation_performance_finalization(
  '2026-08-02',
  'US',
  (select finalization_claim_token from public.recommendation_performance_batches
    where batch_date = '2026-08-02' and market = 'US'),
  false,
  'fixture retry'
);
SQL

retry_claimed="$("${psql_cmd[@]}" -Atc "select public.claim_recommendation_performance_finalization('2026-08-02', 'US') ->> 'claimed';")"
if [[ "$retry_claimed" != "true" ]]; then
  echo "Expected a failed finalization claim to be retryable" >&2
  exit 1
fi

"${psql_cmd[@]}" >/dev/null <<'SQL'
select public.complete_recommendation_performance_finalization(
  '2026-08-02',
  'US',
  (select finalization_claim_token from public.recommendation_performance_batches
    where batch_date = '2026-08-02' and market = 'US'),
  true,
  null
);

do $$
declare
  shard_index integer;
  shard_claim jsonb;
  barrier_claim jsonb;
begin
  for shard_index in 0..3 loop
    shard_claim := public.claim_recommendation_performance_shard(
      '2026-08-02', 'KR', shard_index, 4
    );
    perform public.complete_recommendation_performance_shard(
      '2026-08-02',
      'KR',
      shard_index,
      (shard_claim ->> 'claim_token')::uuid,
      case when shard_index = 3 then 'DEGRADED' else 'SUCCESS' end,
      '{}'::jsonb,
      case when shard_index = 3 then 'fixture degraded shard' else null end
    );
  end loop;
  barrier_claim := public.claim_recommendation_performance_finalization('2026-08-02', 'KR');
  if (barrier_claim ->> 'claimed')::boolean
    or barrier_claim ->> 'barrier_status' <> 'DEGRADED'
  then
    raise exception 'A degraded batch crossed the finalization barrier: %', barrier_claim;
  end if;

  shard_claim := public.claim_recommendation_performance_shard('2026-08-02', 'KR', 3, 4);
  if not (shard_claim ->> 'claimed')::boolean then
    raise exception 'A degraded shard was not retryable: %', shard_claim;
  end if;
  perform public.complete_recommendation_performance_shard(
    '2026-08-02',
    'KR',
    3,
    (shard_claim ->> 'claim_token')::uuid,
    'SUCCESS',
    '{}'::jsonb,
    null
  );
end;
$$;

insert into public.cron_http_runs (
  job_name, slot_started_at, path, status, requested_at
)
values (
  'mtn-fixture-timeout',
  date_trunc('minute', clock_timestamp() - interval '10 minutes'),
  '/api/cron/fixture',
  'QUEUED',
  clock_timestamp() - interval '291 seconds'
);
select mtn_internal.collect_cron_http_responses();
SQL

"${psql_cmd[@]}" >/dev/null <<'SQL'
update public.recommendation_performance_batches
set barrier_status = 'SUCCESS',
    finalization_status = 'SUCCESS',
    finalization_claim_token = null;
delete from public.recommendation_performance_batch_shards
where batch_date in (
  (clock_timestamp() at time zone 'UTC')::date - 2,
  (clock_timestamp() at time zone 'UTC')::date - 1
);
delete from public.cron_http_runs
where job_name like 'mtn-recommendation-performance-retry-%';
update mtn_internal.recommendation_performance_retry_sweep_state
set last_candidate_key = null,
    last_slot_started_at = null,
    last_dispatched_at = null,
    dispatch_count = 0
where state_key = 'singleton';
insert into public.recommendation_performance_batches (
  batch_date, market, shard_count, barrier_status, finalization_status
)
values
  ((clock_timestamp() at time zone 'UTC')::date - 2, 'US', 4, 'WAITING', 'PENDING'),
  ((clock_timestamp() at time zone 'UTC')::date - 1, 'US', 4, 'WAITING', 'PENDING')
on conflict (batch_date, market) do update
set barrier_status = excluded.barrier_status,
    finalization_status = excluded.finalization_status,
    finalization_claim_token = null,
    finalization_claimed_at = null;

do $$
declare
  dispatch_index integer;
  dispatch_result integer;
  dispatched_paths text[];
  old_batch_date text := ((clock_timestamp() at time zone 'UTC')::date - 2)::text;
  new_batch_date text := ((clock_timestamp() at time zone 'UTC')::date - 1)::text;
begin
  dispatch_result := mtn_internal.retry_recommendation_performance_batches();
  if dispatch_result <> 1 then
    raise exception 'First budgeted sweep queued % requests instead of one.', dispatch_result;
  end if;
  dispatch_result := mtn_internal.retry_recommendation_performance_batches();
  if dispatch_result <> 0 then
    raise exception 'Duplicate delivery in one 15-minute slot consumed extra budget.';
  end if;

  for dispatch_index in 2..8 loop
    update mtn_internal.recommendation_performance_retry_sweep_state
    set last_slot_started_at = null
    where state_key = 'singleton';
    dispatch_result := mtn_internal.retry_recommendation_performance_batches();
    if dispatch_result <> 1 then
      raise exception 'Simulated sweep % queued % requests instead of one.', dispatch_index, dispatch_result;
    end if;
  end loop;

  select array_agg(run.path order by run.id)
  into dispatched_paths
  from public.cron_http_runs as run
  where run.job_name like 'mtn-recommendation-performance-retry-%';

  if cardinality(dispatched_paths) <> 8 then
    raise exception 'Expected eight single-dispatch sweeps, observed % rows.', cardinality(dispatched_paths);
  end if;
  for dispatch_index in 1..4 loop
    if dispatched_paths[dispatch_index] not like '%batchDate=' || old_batch_date then
      raise exception 'Oldest batch did not progress first: %', dispatched_paths;
    end if;
  end loop;
  for dispatch_index in 5..8 loop
    if dispatched_paths[dispatch_index] not like '%batchDate=' || new_batch_date then
      raise exception 'Round-robin cursor did not advance to the next batch: %', dispatched_paths;
    end if;
  end loop;
end;
$$;

-- A recently running shard is ineligible; the next deterministic shard advances.
update public.recommendation_performance_batches
set barrier_status = 'SUCCESS',
    finalization_status = 'SUCCESS',
    finalization_claim_token = null;
delete from public.recommendation_performance_batch_shards
where batch_date = (clock_timestamp() at time zone 'UTC')::date - 2
  and market = 'US';
delete from public.cron_http_runs
where job_name like 'mtn-recommendation-performance-retry-%';
insert into public.recommendation_performance_batches (
  batch_date, market, shard_count, barrier_status, finalization_status
)
values (
  (clock_timestamp() at time zone 'UTC')::date - 2,
  'US',
  4,
  'WAITING',
  'PENDING'
)
on conflict (batch_date, market) do update
set barrier_status = excluded.barrier_status,
    finalization_status = excluded.finalization_status;
insert into public.recommendation_performance_batch_shards (
  batch_date, market, shard_count, shard, status, claim_token, claimed_at, attempt_count
)
values (
  (clock_timestamp() at time zone 'UTC')::date - 2,
  'US',
  4,
  0,
  'RUNNING',
  gen_random_uuid(),
  clock_timestamp(),
  1
);
update mtn_internal.recommendation_performance_retry_sweep_state
set last_candidate_key = null,
    last_slot_started_at = null
where state_key = 'singleton';

do $$
declare
  dispatch_result integer;
  dispatched_path text;
begin
  dispatch_result := mtn_internal.retry_recommendation_performance_batches();
  select run.path
  into dispatched_path
  from public.cron_http_runs as run
  where run.job_name like 'mtn-recommendation-performance-retry-%'
  order by run.id desc
  limit 1;
  if dispatch_result <> 1 or dispatched_path not like '%shard=1&%'
  then
    raise exception 'Recent RUNNING shard was not skipped: result %, path %', dispatch_result, dispatched_path;
  end if;
end;
$$;

-- Four successful shards produce one budgeted finalization dispatch.
update public.recommendation_performance_batches
set barrier_status = 'SUCCESS',
    finalization_status = 'SUCCESS',
    finalization_claim_token = null;
delete from public.recommendation_performance_batch_shards
where batch_date = (clock_timestamp() at time zone 'UTC')::date - 2
  and market = 'US';
delete from public.cron_http_runs
where job_name like 'mtn-recommendation-performance-retry-%';
insert into public.recommendation_performance_batches (
  batch_date, market, shard_count, barrier_status, finalization_status
)
values (
  (clock_timestamp() at time zone 'UTC')::date - 2,
  'US',
  4,
  'READY',
  'PENDING'
)
on conflict (batch_date, market) do update
set barrier_status = excluded.barrier_status,
    finalization_status = excluded.finalization_status;
insert into public.recommendation_performance_batch_shards (
  batch_date, market, shard_count, shard, status, attempt_count, completed_at
)
select
  (clock_timestamp() at time zone 'UTC')::date - 2,
  'US',
  4,
  shard,
  'SUCCESS',
  1,
  clock_timestamp()
from generate_series(0, 3) as shard;
update mtn_internal.recommendation_performance_retry_sweep_state
set last_candidate_key = null,
    last_slot_started_at = null
where state_key = 'singleton';

do $$
declare
  dispatch_result integer;
  duplicate_result integer;
  dispatched_job_name text;
begin
  dispatch_result := mtn_internal.retry_recommendation_performance_batches();
  duplicate_result := mtn_internal.retry_recommendation_performance_batches();
  select run.job_name
  into dispatched_job_name
  from public.cron_http_runs as run
  where run.job_name like 'mtn-recommendation-performance-retry-%'
  order by run.id desc
  limit 1;
  if dispatch_result <> 1
    or duplicate_result <> 0
    or dispatched_job_name !~ '^mtn-recommendation-performance-retry-finalize-us-[0-9]{8}$'
  then
    raise exception 'Finalization did not respect the single-dispatch budget: %/%/%',
      dispatch_result, duplicate_result, dispatched_job_name;
  end if;
end;
$$;

-- Health aliases newer dated retries to the official shard without hiding a
-- still-newer retry failure.
insert into public.cron_job_definitions (
  job_name, path, schedule, slot_minutes, expected_delay_seconds, enabled, updated_at
)
values (
  'mtn-recommendation-performance-us-0',
  '/api/cron/recommendation-performance?market=US&shard=0&shards=4',
  '30 06 * * *',
  1,
  93600,
  true,
  clock_timestamp()
)
on conflict (job_name) do update
set updated_at = excluded.updated_at;
delete from public.cron_http_runs
where job_name = 'mtn-recommendation-performance-us-0'
   or job_name ~ '^mtn-recommendation-performance-retry-(us-0|finalize-us)-[0-9]{8}$';
insert into public.cron_http_runs (
  job_name, slot_started_at, path, status, http_status, requested_at, completed_at
)
values
  (
    'mtn-recommendation-performance-us-0',
    date_trunc('minute', clock_timestamp() - interval '5 minutes'),
    '/api/cron/recommendation-performance?market=US&shard=0&shards=4',
    'FAILED',
    504,
    clock_timestamp() - interval '5 minutes',
    clock_timestamp() - interval '5 minutes'
  ),
  (
    'mtn-recommendation-performance-retry-us-0-20260802',
    date_trunc('minute', clock_timestamp() - interval '4 minutes'),
    '/api/cron/recommendation-performance?market=US&shard=0&shards=4&batchDate=2026-08-02',
    'SUCCESS',
    200,
    clock_timestamp() - interval '4 minutes',
    clock_timestamp() - interval '4 minutes'
  );

do $$
declare
  effective_status text;
  effective_health text;
begin
  select health.latest_status, health.health_status
  into effective_status, effective_health
  from public.cron_scheduler_health as health
  where health.job_name = 'mtn-recommendation-performance-us-0';
  if effective_status <> 'SUCCESS' or effective_health <> 'HEALTHY' then
    raise exception 'Successful dated retry did not clear the older official failure: %/%', effective_status, effective_health;
  end if;
end;
$$;

insert into public.cron_http_runs (
  job_name, slot_started_at, path, status, http_status, error_message, requested_at, completed_at
)
values (
  'mtn-recommendation-performance-retry-finalize-us-20260802',
  date_trunc('minute', clock_timestamp() - interval '3 minutes'),
  '/api/cron/recommendation-performance?market=US&shard=0&shards=4&batchDate=2026-08-02',
  'FAILED',
  504,
  'fixture retry failure',
  clock_timestamp() - interval '3 minutes',
  clock_timestamp() - interval '3 minutes'
);

do $$
declare
  effective_status text;
  effective_health text;
  alert_count integer;
begin
  select health.latest_status, health.health_status
  into effective_status, effective_health
  from public.cron_scheduler_health as health
  where health.job_name = 'mtn-recommendation-performance-us-0';
  select count(*)::integer
  into alert_count
  from public.cron_scheduler_alerts as alert
  where alert.job_name = 'mtn-recommendation-performance-us-0';
  if effective_status <> 'FAILED' or effective_health <> 'FAILED' or alert_count <> 1 then
    raise exception 'Newer retry failure was hidden: %/% alerts=%', effective_status, effective_health, alert_count;
  end if;
end;
$$;
SQL

final_state="$("${psql_cmd[@]}" -Atc "select finalization_status from public.recommendation_performance_batches where batch_date = '2026-08-02' and market = 'US';")"
timeout_state="$("${psql_cmd[@]}" -Atc "select status from public.cron_http_runs where job_name = 'mtn-fixture-timeout';")"
retry_cron_count="$("${psql_cmd[@]}" -Atc "select count(*) from cron.job where jobname = 'mtn-recommendation-performance-retry-sweep';")"

if [[ "$final_state" != "SUCCESS" || "$timeout_state" != "TIMED_OUT" || "$retry_cron_count" != "1" ]]; then
  echo "PG17 verification failed: final=$final_state timeout=$timeout_state retry_cron=$retry_cron_count" >&2
  exit 1
fi

echo "PG17 recommendation performance barrier verification passed"
