#!/usr/bin/env bash
set -euo pipefail

pg17_bin="${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
for binary in initdb pg_ctl psql; do
  if [[ ! -x "$pg17_bin/$binary" ]]; then
    echo "PostgreSQL 17 binary not found: $pg17_bin/$binary" >&2
    exit 1
  fi
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d '/tmp/mtn-timeout-pg17.XXXXXX')"
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
if ! "$pg17_bin/pg_ctl" -D "$data_dir" -l "$test_root/postgres.log" -o "-k '$socket_dir' -c listen_addresses=''" -w start >/dev/null; then
  tail -n 30 "$test_root/postgres.log" >&2
  exit 1
fi
psql_cmd=("$pg17_bin/psql" -X -v ON_ERROR_STOP=1 -h "$socket_dir" -U postgres -d postgres)

"${psql_cmd[@]}" >/dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema mtn_internal;
create schema vault;
create schema net;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values
  ('mtn_app_base_url', 'https://example.invalid'),
  ('mtn_cron_secret', 'fixture-secret');
create table net.captured_requests (
  id bigint generated always as identity primary key,
  url text,
  headers jsonb,
  timeout_milliseconds integer
);
create function net.http_get(url text, headers jsonb, timeout_milliseconds integer)
returns bigint language sql as $$
  insert into net.captured_requests (url, headers, timeout_milliseconds)
  values ($1, $2, $3) returning id;
$$;
create table net._http_response (
  id bigint primary key,
  status_code integer,
  content text,
  timed_out boolean not null default false,
  error_msg text,
  created timestamptz not null default clock_timestamp()
);
create table public.cron_http_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  slot_started_at timestamptz not null,
  path text not null,
  request_id bigint unique,
  status text not null,
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  http_status integer,
  error_message text,
  response_excerpt text,
  unique (job_name, slot_started_at)
);
SQL

# Reproduce the deployed regression using its actual function definitions, with
# mocked transport and Vault in this disposable database. No HTTP is sent.
node -e 'const fs=require("node:fs");process.stdout.write(fs.readFileSync(process.argv[1],"utf8").split("-- UTC 트리거.")[0]);' \
  "$repo_root/supabase/migrations/20260905093000_closing_bet_scheduler.sql" > "$test_root/baseline.sql"
"${psql_cmd[@]}" -f "$test_root/baseline.sql" >/dev/null
"${psql_cmd[@]}" >/dev/null <<'SQL'
do $$
begin
  perform mtn_internal.invoke_cron('mtn-baseline', '/api/cron/recommendation-performance?market=US');
  if (select timeout_milliseconds from net.captured_requests limit 1) <> 55000 then
    raise exception 'Fixture must reproduce the deployed 55-second regression';
  end if;
end;
$$;
SQL

migration="$repo_root/supabase/migrations/20260914010000_restore_scheduler_timeout_budgets.sql"
"${psql_cmd[@]}" -f "$migration" >/dev/null
"${psql_cmd[@]}" -f "$migration" >/dev/null
"${psql_cmd[@]}" >/dev/null <<'SQL'
do $$
declare
  request_id bigint;
  invalid_rejected boolean := false;
begin
  request_id := mtn_internal.invoke_cron('mtn-performance', '/api/cron/recommendation-performance?market=US', 1440);
  if (select timeout_milliseconds from net.captured_requests where id=request_id) <> 280000 then
    raise exception 'Recommendation transport must survive the 270-second route';
  end if;
  if (select headers->>'Authorization' from net.captured_requests where id=request_id) <> 'Bearer fixture-secret' then
    raise exception 'Authenticated transport must be preserved';
  end if;
  if mtn_internal.invoke_cron('mtn-performance', '/api/cron/recommendation-performance?market=US', 1440) is not null then
    raise exception 'Same-slot invocation must remain idempotent';
  end if;
  request_id := mtn_internal.invoke_cron('mtn-contest', '/api/cron/contest-review-us');
  if (select timeout_milliseconds from net.captured_requests where id=request_id) <> 280000 then
    raise exception 'Other reports must retain the general transport budget';
  end if;
  request_id := mtn_internal.invoke_cron('mtn-closing', '/api/cron/closing-bet?market=KOSPI200&phase=prepare');
  if (select timeout_milliseconds from net.captured_requests where id=request_id) <> 240000 then
    raise exception 'Closing-bet transport must retain its separate budget';
  end if;
  begin
    perform mtn_internal.invoke_cron('mtn-invalid', 'https://example.invalid/api/cron/test');
  exception when others then
    invalid_rejected := true;
  end;
  if not invalid_rejected then raise exception 'Absolute paths must remain forbidden'; end if;
  if has_function_privilege('anon', 'mtn_internal.invoke_cron(text,text,integer)', 'execute') then
    raise exception 'Anonymous invocation must remain forbidden';
  end if;
end;
$$;

insert into public.cron_http_runs (job_name, slot_started_at, path, request_id, status, requested_at)
values
  ('mtn-active', now(), '/api/cron/recommendation-performance?market=US', 100001, 'QUEUED', clock_timestamp() - interval '150 seconds'),
  ('mtn-expired', now(), '/api/cron/contest-review-us', 100002, 'QUEUED', clock_timestamp() - interval '295 seconds'),
  ('mtn-closing-active', now(), '/api/cron/closing-bet?market=KOSPI200', 100003, 'QUEUED', clock_timestamp() - interval '295 seconds'),
  ('mtn-closing-expired', now(), '/api/cron/closing-bet?market=KOSPI200', 100004, 'QUEUED', clock_timestamp() - interval '305 seconds'),
  ('mtn-completed', now(), '/api/cron/recommendation-performance?market=KR', 100005, 'QUEUED', clock_timestamp() - interval '250 seconds');
insert into net._http_response (id, status_code, content) values (100005, 200, '{"success":true}');
select mtn_internal.collect_cron_http_responses();
do $$
begin
  if (select status from public.cron_http_runs where job_name='mtn-active') <> 'QUEUED' then
    raise exception 'Collector must not falsely fail a report still within its request budget';
  end if;
  if (select status from public.cron_http_runs where job_name='mtn-expired') <> 'TIMED_OUT' then
    raise exception 'Missing reports must time out after the restored collection window';
  end if;
  if (select status from public.cron_http_runs where job_name='mtn-closing-active') <> 'QUEUED' then
    raise exception 'Closing reports must retain the 300-second collection window';
  end if;
  if (select status from public.cron_http_runs where job_name='mtn-closing-expired') <> 'TIMED_OUT' then
    raise exception 'Expired closing reports must still be detected';
  end if;
  if (select status from public.cron_http_runs where job_name='mtn-completed') <> 'SUCCESS' then
    raise exception 'Completed response must be reconciled after more than 120 seconds';
  end if;
end;
$$;
insert into net._http_response (id, status_code, content) values (100002, 200, '{"success":true}');
select mtn_internal.collect_cron_http_responses();
do $$
begin
  if (select status from public.cron_http_runs where job_name='mtn-expired') <> 'SUCCESS' then
    raise exception 'Late successful responses must repair provisional timeouts';
  end if;
end;
$$;
SQL

echo 'Scheduler timeout PostgreSQL 17 integration tests passed (isolated database; no external requests).'
