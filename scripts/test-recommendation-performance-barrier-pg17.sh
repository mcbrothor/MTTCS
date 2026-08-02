#!/usr/bin/env bash
set -euo pipefail

pg17_bin="${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
if [[ ! -x "$pg17_bin/initdb" || ! -x "$pg17_bin/pg_ctl" || ! -x "$pg17_bin/psql" ]]; then
  echo "PostgreSQL 17 binaries were not found at $pg17_bin" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/20260802160000_recommendation_performance_scheduler_barrier.sql"
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
SQL

"${psql_cmd[@]}" -f "$migration" >/dev/null

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

multi_batch_retry_count="$("${psql_cmd[@]}" -qAt <<'SQL'
update public.recommendation_performance_batches
set barrier_status = 'SUCCESS',
    finalization_status = 'SUCCESS',
    finalization_claim_token = null;
delete from public.cron_http_runs
where job_name like 'mtn-recommendation-performance-retry-%';
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
select mtn_internal.retry_recommendation_performance_batches();
SQL
)"

final_state="$("${psql_cmd[@]}" -Atc "select finalization_status from public.recommendation_performance_batches where batch_date = '2026-08-02' and market = 'US';")"
timeout_state="$("${psql_cmd[@]}" -Atc "select status from public.cron_http_runs where job_name = 'mtn-fixture-timeout';")"
retry_cron_count="$("${psql_cmd[@]}" -Atc "select count(*) from cron.job where jobname = 'mtn-recommendation-performance-retry-sweep';")"
multi_batch_retry_rows="$("${psql_cmd[@]}" -Atc "select count(*) from public.cron_http_runs where job_name like 'mtn-recommendation-performance-retry-%';")"
multi_batch_retry_bad_names="$("${psql_cmd[@]}" -Atc "select count(*) from public.cron_http_runs where job_name like 'mtn-recommendation-performance-retry-%' and job_name !~ 'mtn-recommendation-performance-retry-(us|kr)-[0-3]-[0-9]{8}$';")"

if [[ "$final_state" != "SUCCESS" || "$timeout_state" != "TIMED_OUT" || "$retry_cron_count" != "1" || "$multi_batch_retry_count" != "8" || "$multi_batch_retry_rows" != "8" || "$multi_batch_retry_bad_names" != "0" ]]; then
  echo "PG17 verification failed: final=$final_state timeout=$timeout_state retry_cron=$retry_cron_count multi_batch_queued=$multi_batch_retry_count multi_batch_rows=$multi_batch_retry_rows bad_retry_names=$multi_batch_retry_bad_names" >&2
  exit 1
fi

echo "PG17 recommendation performance barrier verification passed"
