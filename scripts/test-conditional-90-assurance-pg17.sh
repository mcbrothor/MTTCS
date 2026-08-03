#!/usr/bin/env bash
set -euo pipefail

pg17_bin="${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
if [[ ! -x "$pg17_bin/initdb" || ! -x "$pg17_bin/pg_ctl" || ! -x "$pg17_bin/psql" ]]; then
  echo "PostgreSQL 17 binaries were not found at $pg17_bin" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/20260803100000_conditional_90_assurance.sql"
manual_accessibility_migration="$repo_root/supabase/migrations/20260803103000_harden_manual_accessibility_assurance.sql"
pilot_source_integrity_migration="$repo_root/supabase/migrations/20260803110000_pilot_source_integrity.sql"
least_privilege_migration="$repo_root/supabase/migrations/20260803120000_assurance_least_privilege.sql"
test_root="$(mktemp -d "/tmp/mtn-assurance-pg17.XXXXXX")"
data_dir="$test_root/data"
socket_dir="$test_root/socket"
mkdir -p "$socket_dir"

cleanup() {
  if [[ -f "$data_dir/postmaster.pid" ]]; then
    "$pg17_bin/pg_ctl" -D "$data_dir" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$test_root" in
    /tmp/mtn-assurance-pg17.*) rm -rf -- "$test_root" ;;
    *) echo "Refusing to remove unexpected test directory: $test_root" >&2 ;;
  esac
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

create table public.recommendation_publications (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default current_date,
  category text,
  engine_version text not null,
  prompt_version text,
  llm_provider text,
  llm_model text,
  generated_at timestamptz not null,
  is_official boolean not null default false,
  status text not null default 'DRAFT'
);
create table public.recommendation_picks (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.recommendation_publications(id),
  ticker text not null,
  candidate_snapshot jsonb not null default '{}'::jsonb
);
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  status text not null,
  version bigint not null default 0,
  direction text not null default 'LONG',
  total_equity numeric,
  planned_risk numeric,
  risk_percent numeric,
  entry_price numeric,
  stoploss_price numeric,
  position_size integer,
  total_shares integer,
  result_amount numeric,
  exit_price numeric,
  entry_snapshot jsonb,
  current_plan_snapshot jsonb
);
create table public.trade_executions (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id),
  side text not null,
  executed_at timestamptz not null,
  price numeric not null,
  shares numeric not null,
  fees numeric not null default 0
);
create table public.trade_performance_records (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null unique references public.trades(id),
  fees numeric not null,
  r_multiple numeric,
  return_pct numeric,
  pyramid_compliant boolean,
  stop_raise_compliant boolean
);
create table public.recommendation_performance (
  pick_id uuid not null references public.recommendation_picks(id),
  horizon text not null,
  entry_price numeric,
  primary key (pick_id, horizon)
);

create function public.prevent_recommendation_evidence_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'immutable' using errcode = '55000';
end;
$$;

insert into public.recommendation_publications (
  id, run_date, category, engine_version, prompt_version, llm_provider, llm_model,
  generated_at, is_official, status
) values (
  '10000000-0000-4000-8000-000000000099', current_date - 1000, 'NASDAQ100',
  'legacy-engine', 'legacy-prompt', 'legacy-provider', 'legacy-model',
  now() - interval '1000 days', true, 'PUBLISHED'
);
SQL

"${psql_cmd[@]}" -f "$migration" >/dev/null
"${psql_cmd[@]}" -f "$manual_accessibility_migration" >/dev/null
"${psql_cmd[@]}" -f "$pilot_source_integrity_migration" >/dev/null
"${psql_cmd[@]}" -f "$least_privilege_migration" >/dev/null

"${psql_cmd[@]}" >/dev/null <<'SQL'
do $$
begin
  if public.assurance_canonical_jsonb('{"z":1,"a":[true,{"x":"v"}]}'::jsonb)
      <> '{"a":[true,{"x":"v"}],"z":1}' then
    raise exception 'canonical JSON ordering changed';
  end if;
  if public.assurance_stable_jsonb_hash('{}'::jsonb)
      <> '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' then
    raise exception 'stable JSON hash is incompatible with the application hash';
  end if;
end;
$$;

create or replace function public.fixture_assurance_snapshot_hash(
  p_evaluated_at timestamptz,
  p_release_sha text,
  p_verified_score integer,
  p_status text,
  p_domains jsonb,
  p_gates jsonb,
  p_evidence_manifest_hash text
)
returns text
language sql
stable
security invoker
set search_path = ''
return public.assurance_stable_jsonb_hash(pg_catalog.jsonb_build_object(
  'evaluationDay', pg_catalog.to_char(p_evaluated_at at time zone 'UTC', 'YYYY-MM-DD'),
  'policyVersion', 'mtn-conditional-90-policy-2026.08-v1',
  'evaluatorVersion', 'mtn-conditional-90-scorecard-v1',
  'releaseSha', p_release_sha,
  'verifiedScore', p_verified_score,
  'status', p_status,
  'domains', p_domains,
  'gates', p_gates,
  'evidenceManifestHash', p_evidence_manifest_hash
));

insert into public.recommendation_longitudinal_evaluations (
  evaluation_hash, market, category, engine_version, assurance_contract_hash, horizon, window_months,
  window_start, window_end, covered_month_count, sample_size, cohort_count,
  market_regime_count, regime_cohort_counts, excess_ci95_lower,
  lower_decile_net_excess_return_pct, tail_breach_rate, manifest_set_hash,
  statistics_version, policy_version, evidence_status, gate_status, evaluated_at
) values (
  repeat('01', 32), 'US', 'NASDAQ100', 'engine-v1', repeat('aa', 32), 'D5', 12,
  current_date - 365, current_date, 10, 100, 60, 2, '{"UP":30,"DOWN":30}',
  0.1, 0, 0.01, repeat('02', 32), 'mtn-cohort-block-bootstrap-95-v1',
  'mtn-longitudinal-assurance-2026.08-v1', 'READY', 'PASS', now() - interval '1 minute'
);

do $$
begin
  begin
    insert into public.recommendation_longitudinal_evaluations (
      evaluation_hash, market, category, engine_version, assurance_contract_hash, horizon, window_months,
      window_start, window_end, covered_month_count, sample_size, cohort_count,
      market_regime_count, regime_cohort_counts, excess_ci95_lower,
      lower_decile_net_excess_return_pct, tail_breach_rate, manifest_set_hash,
      statistics_version, policy_version, evidence_status, gate_status, evaluated_at
    ) values (
      repeat('09', 32), 'US', 'NASDAQ100', 'engine-v1', repeat('aa', 32), 'D5', 12,
      current_date - 365, current_date, 10, 100, 60, 2, '{"UP":30,"DOWN":30}',
      0.1, 0, 0.01, repeat('0a', 32), 'mtn-cohort-block-bootstrap-95-v1',
      'mtn-longitudinal-assurance-2026.08-v1', 'READY', 'PASS', now() - interval '1 day'
    );
    raise exception 'backdated longitudinal evaluation unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_longitudinal_evaluations (
      evaluation_hash, market, category, engine_version, assurance_contract_hash, horizon, window_months,
      window_start, window_end, covered_month_count, sample_size, cohort_count,
      market_regime_count, excess_ci95_lower, lower_decile_net_excess_return_pct,
      tail_breach_rate, manifest_set_hash, statistics_version, policy_version,
      evidence_status, gate_status
    ) values (
      repeat('03', 32), 'US', 'NASDAQ100', 'engine-v1', repeat('aa', 32), 'D5', 12,
      current_date, current_date, 0, 0, 0, 2, 0.1, 0, 0,
      repeat('04', 32), 'mtn-cohort-block-bootstrap-95-v1',
      'mtn-longitudinal-assurance-2026.08-v1', 'READY', 'PASS'
    );
    raise exception 'zero-sample PASS unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_longitudinal_evaluations (
      evaluation_hash, market, category, engine_version, assurance_contract_hash, horizon, window_months,
      window_start, window_end, covered_month_count, sample_size, cohort_count,
      market_regime_count, excess_ci95_lower, lower_decile_net_excess_return_pct,
      tail_breach_rate, manifest_set_hash, statistics_version, policy_version,
      evidence_status, gate_status
    ) values (
      repeat('05', 32), 'US', 'SP500', 'engine-v1', repeat('aa', 32), 'D20', 12,
      current_date - 365, current_date, 10, 100, 39, 2, 0.1, 0, 0,
      repeat('06', 32), 'mtn-cohort-block-bootstrap-95-v1',
      'mtn-longitudinal-assurance-2026.08-v1', 'READY', 'PASS'
    );
    raise exception 'under-cohort PASS unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_longitudinal_evaluations (
      evaluation_hash, market, category, engine_version, assurance_contract_hash, horizon, window_months,
      window_start, window_end, covered_month_count, sample_size, cohort_count,
      market_regime_count, excess_ci95_lower, lower_decile_net_excess_return_pct,
      tail_breach_rate, manifest_set_hash, statistics_version, policy_version,
      evidence_status, gate_status
    ) values (
      repeat('07', 32), 'KR', 'KOSPI200', 'engine-v1', repeat('aa', 32), 'D60', 24,
      current_date - 730, current_date, 19, 199, 39, 2, 0.1, 0, 0,
      repeat('08', 32), 'wrong-statistics-version', 'wrong-policy-version', 'READY', 'PASS'
    );
    raise exception 'wrong-version 24-month PASS unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

do $$
declare
  retroactive_contract jsonb := jsonb_build_object(
    'schemaVersion', 'mtn-recommendation-assurance-contract-v1',
    'engineVersion', 'legacy-engine',
    'promptVersion', 'legacy-prompt',
    'llmProvider', 'legacy-provider',
    'llmModel', 'legacy-model',
    'strategyContractVersion', 'legacy-strategy',
    'dataContractVersion', 'legacy-data'
  );
begin
  begin
    update public.recommendation_publications
    set assurance_contract = retroactive_contract,
        assurance_contract_hash = public.assurance_stable_jsonb_hash(retroactive_contract)
    where id = '10000000-0000-4000-8000-000000000099';
    raise exception 'legacy publication assurance contract was retroactively backfilled';
  exception when check_violation then null;
  end;
end;
$$;

-- DB-first rollout compatibility: an older application may still insert a
-- NULL/NULL contract pair, but it must never be able to smuggle mismatched
-- nullable version fields into a supposedly bound assurance contract.
insert into public.recommendation_publications (
  id, run_date, category, engine_version, generated_at, is_official, status
) values (
  '10000000-0000-4000-8000-000000000098', current_date, 'SP500',
  'old-app-engine', now(), false, 'DRAFT'
);

do $$
declare
  forged_contract jsonb := '{
    "schemaVersion":"mtn-recommendation-assurance-contract-v1",
    "engineVersion":"nullable-engine",
    "promptVersion":"forged-prompt",
    "llmProvider":"forged-provider",
    "llmModel":"forged-model",
    "strategyContractVersion":"strategy-v1",
    "dataContractVersion":"data-v1"
  }'::jsonb;
begin
  begin
    insert into public.recommendation_publications (
      id, run_date, category, engine_version, prompt_version, llm_provider, llm_model,
      assurance_contract_hash, assurance_contract, generated_at, is_official, status
    ) values (
      '10000000-0000-4000-8000-000000000097', current_date, 'SP500',
      'nullable-engine', null, null, null,
      public.assurance_stable_jsonb_hash(forged_contract), forged_contract,
      now(), false, 'DRAFT'
    );
    raise exception 'nullable publication versions unexpectedly accepted a mismatched contract';
  exception when check_violation then null;
  end;
end;
$$;

with assurance_contract as (
  select jsonb_build_object(
    'schemaVersion', 'mtn-recommendation-assurance-contract-v1',
    'engineVersion', 'engine-v1',
    'promptVersion', 'prompt-v1',
    'llmProvider', 'fixture-provider',
    'llmModel', 'fixture-model',
    'strategyContractVersion', 'fixture-strategy-v1',
    'dataContractVersion', 'fixture-data-v1'
  ) as value
)
insert into public.recommendation_publications (
  id, run_date, category, engine_version, prompt_version, llm_provider, llm_model,
  assurance_contract_hash, assurance_contract, generated_at, is_official, status
)
select fixture.id::uuid, current_date - 3, fixture.category, 'engine-v1', 'prompt-v1',
       'fixture-provider', 'fixture-model', public.assurance_stable_jsonb_hash(contract.value),
       contract.value, now() - interval '3 days', fixture.is_official, fixture.status
from assurance_contract as contract
cross join (values
  ('10000000-0000-4000-8000-000000000001', 'NASDAQ100', true, 'PUBLISHED'),
  ('10000000-0000-4000-8000-000000000002', 'SP500', false, 'DRAFT')
) as fixture(id, category, is_official, status);
insert into public.recommendation_picks (id, publication_id, ticker, candidate_snapshot)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'TEST', '{}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'LATE', '{}'::jsonb),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'DRAFT', '{}'::jsonb);
insert into public.trades (
  id, ticker, status, version, direction, total_equity, planned_risk, risk_percent,
  entry_price, stoploss_price, position_size, total_shares, entry_snapshot, current_plan_snapshot
) values
  ('30000000-0000-4000-8000-000000000001', 'TEST', 'PLANNED', 0, 'LONG', 100000, 500, 0.005,
   100, 95, 10, 10, '{}'::jsonb, '{}'::jsonb),
  ('30000000-0000-4000-8000-000000000002', 'LATE', 'PLANNED', 0, 'LONG', 100000, 250, 0.0025,
   50, 45, 10, 10, '{}'::jsonb, '{}'::jsonb),
  ('30000000-0000-4000-8000-000000000003', 'TEST', 'PLANNED', 0, 'LONG', 100000, 600, 0.006,
   100, 94, 100, 100, '{}'::jsonb, '{}'::jsonb);

insert into public.recommendation_decision_events (
  id, decision_hash, pick_id, actor_subject_hash, decision_code, decided_at,
  engine_version, prompt_version, candidate_snapshot_hash, policy_version,
  reason_codes, rationale, snapshot, snapshot_hash
) values (
  '40000000-0000-4000-8000-000000000001', repeat('11', 32),
  '20000000-0000-4000-8000-000000000001', repeat('a', 64), 'ACCEPT', now() - interval '4 minutes',
  'engine-v1', 'prompt-v1', public.assurance_stable_jsonb_hash('{}'::jsonb),
  'mtn-conditional-90-policy-2026.08-v1', array['TEST'], 'prospective acceptance fixture',
  '{"candidateSnapshot":{}}'::jsonb, repeat('12', 32)
), (
  '40000000-0000-4000-8000-000000000002', repeat('13', 32),
  '20000000-0000-4000-8000-000000000002', repeat('a', 64), 'REJECT', now() - interval '4 minutes',
  'engine-v1', 'prompt-v1', public.assurance_stable_jsonb_hash('{}'::jsonb),
  'mtn-conditional-90-policy-2026.08-v1', array['TEST'], 'prospective rejection fixture',
  '{"candidateSnapshot":{}}'::jsonb, repeat('14', 32)
);

do $$
begin
  begin
    insert into public.recommendation_decision_events (
      decision_hash, pick_id, actor_subject_hash, decision_code, decided_at,
      engine_version, prompt_version, candidate_snapshot_hash, policy_version,
      reason_codes, rationale, snapshot, snapshot_hash
    ) values (
      repeat('15', 32), '20000000-0000-4000-8000-000000000001', repeat('a', 64),
      'WATCH', now() - interval '3 minutes', 'wrong-engine', 'prompt-v1',
      public.assurance_stable_jsonb_hash('{}'::jsonb), 'mtn-conditional-90-policy-2026.08-v1',
      array['TEST'], 'mismatched engine fixture', '{"candidateSnapshot":{}}'::jsonb, repeat('16', 32)
    );
    raise exception 'mismatched engine unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_decision_events (
      decision_hash, pick_id, actor_subject_hash, decision_code, decided_at,
      engine_version, prompt_version, candidate_snapshot_hash, policy_version,
      reason_codes, rationale, snapshot, snapshot_hash
    ) values (
      repeat('17', 32), '20000000-0000-4000-8000-000000000001', repeat('a', 64),
      'WATCH', now() - interval '3 minutes', 'engine-v1', 'prompt-v1', repeat('f', 64),
      'mtn-conditional-90-policy-2026.08-v1', array['TEST'], 'mismatched snapshot hash fixture',
      '{"candidateSnapshot":{}}'::jsonb, repeat('18', 32)
    );
    raise exception 'mismatched candidate snapshot hash unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_decision_events (
      decision_hash, pick_id, actor_subject_hash, decision_code, decided_at,
      engine_version, prompt_version, candidate_snapshot_hash, policy_version,
      reason_codes, rationale, snapshot, snapshot_hash
    ) values (
      repeat('19', 32), '20000000-0000-4000-8000-000000000003', repeat('c', 64),
      'ACCEPT', now() - interval '3 minutes', 'engine-v1', 'prompt-v1',
      public.assurance_stable_jsonb_hash('{}'::jsonb), 'mtn-conditional-90-policy-2026.08-v1',
      array['TEST'], 'unofficial recommendation fixture', '{"candidateSnapshot":{}}'::jsonb, repeat('1a', 32)
    );
    raise exception 'unofficial DRAFT recommendation unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_decision_events (
      decision_hash, pick_id, actor_subject_hash, decision_code, decided_at,
      engine_version, prompt_version, candidate_snapshot_hash, policy_version,
      reason_codes, rationale, snapshot, snapshot_hash, supersedes_id
    ) values (
      repeat('1b', 32), '20000000-0000-4000-8000-000000000001', repeat('a', 64),
      'WATCH', now() - interval '4 minutes 30 seconds', 'engine-v1', 'prompt-v1',
      public.assurance_stable_jsonb_hash('{}'::jsonb), 'mtn-conditional-90-policy-2026.08-v1',
      array['TEST'], 'backdated correction fixture', '{"candidateSnapshot":{}}'::jsonb,
      repeat('1c', 32), '40000000-0000-4000-8000-000000000001'
    );
    raise exception 'backdated decision correction unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_decision_events (
      decision_hash, pick_id, actor_subject_hash, decision_code, decided_at,
      engine_version, prompt_version, candidate_snapshot_hash, policy_version,
      reason_codes, rationale, snapshot, snapshot_hash, supersedes_id, created_at
    ) values (
      repeat('1d', 32), '20000000-0000-4000-8000-000000000002', repeat('a', 64),
      'WATCH', now() - interval '1 day', 'engine-v1', 'prompt-v1',
      public.assurance_stable_jsonb_hash('{}'::jsonb), 'mtn-conditional-90-policy-2026.08-v1',
      array['TEST'], 'direct service-role backdating fixture', '{"candidateSnapshot":{}}'::jsonb,
      repeat('1e', 32), '40000000-0000-4000-8000-000000000002', now() - interval '1 day'
    );
    raise exception 'directly backdated decision unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recommendation_pilot_links (
      link_hash, decision_id, pick_id, trade_id, actor_subject_hash,
      authorized_risk_r, trade_version_at_link, risk_policy_snapshot, risk_policy_hash, linked_at
    ) values (
      repeat('21', 32), '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
      repeat('a', 64), 0.5, 0, '{}'::jsonb, repeat('22', 32), now() - interval '2 minutes'
    );
    raise exception 'pilot link unexpectedly accepted before an 85-point snapshot';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.assurance_score_snapshots (
  snapshot_hash, policy_version, evaluator_version, release_sha,
  investment_score, data_score, strategy_score, risk_score, software_score,
  operations_score, security_score, system_ui_score,
  technical_gate_passed, longitudinal_gate_passed, pilot_gate_passed,
  operational_gate_passed, accessibility_gate_passed,
  duration_24m_gate_passed, longitudinal_24m_gate_passed,
  recovery_gate_passed, operations_90d_gate_passed,
  status, blockers, next_actions, evidence_manifest, evidence_manifest_hash,
  capital_authorized, evaluated_at
) values (
  public.fixture_assurance_snapshot_hash(
    now() - interval '3 minutes', repeat('a', 40), 85, 'SMALL_PILOT_REVIEW',
    '{"investment":15,"data":12,"strategy":12,"risk":14,"software":10,"operations":8,"security":5,"system_ui":9}'::jsonb,
    '{"technical":true,"longitudinal":true,"pilot":false,"operational":true,"accessibility":false,"duration24m":false,"longitudinal24m":false,"recovery":false,"operations90d":false}'::jsonb,
    public.assurance_stable_jsonb_hash('{}'::jsonb)
  ),
  'mtn-conditional-90-policy-2026.08-v1', 'mtn-conditional-90-scorecard-v1', repeat('a', 40),
  15, 12, 12, 14, 10, 8, 5, 9,
  true, true, false, true, false,
  false, false, false, false,
  'SMALL_PILOT_REVIEW', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
  public.assurance_stable_jsonb_hash('{}'::jsonb), false,
  now() - interval '3 minutes'
);

do $$
begin
  begin
    insert into public.recommendation_pilot_links (
      link_hash, decision_id, pick_id, trade_id, actor_subject_hash,
      authorized_risk_r, trade_version_at_link, risk_policy_snapshot, risk_policy_hash, linked_at
    ) values (
      repeat('25', 32), '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
      repeat('a', 64), 0.5, 0, '{}'::jsonb, repeat('26', 32), now() - interval '10 minutes'
    );
    raise exception 'pilot link predating its decision unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_pilot_links (
      link_hash, decision_id, pick_id, trade_id, actor_subject_hash,
      authorized_risk_r, trade_version_at_link, risk_policy_snapshot, risk_policy_hash, linked_at
    ) values (
      repeat('27', 32), '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
      repeat('a', 64), 0.5, 0, '{}'::jsonb, repeat('28', 32), now() - interval '2 minutes'
    );
    raise exception 'pilot risk above 0.5R account-equity limit unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_pilot_links (
      link_hash, decision_id, pick_id, trade_id, actor_subject_hash,
      authorized_risk_r, trade_version_at_link, risk_policy_snapshot, risk_policy_hash, linked_at
    ) values (
      repeat('29', 32), '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
      repeat('a', 64), 0.5001, 0, '{}'::jsonb, repeat('2a', 32), now() - interval '2 minutes'
    );
    raise exception '0.5001R unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.recommendation_pilot_links (
  id, link_hash, decision_id, pick_id, trade_id, actor_subject_hash,
  authorized_risk_r, trade_version_at_link, risk_policy_snapshot, risk_policy_hash, linked_at
) values (
  '50000000-0000-4000-8000-000000000001', repeat('31', 32),
  '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', repeat('a', 64), 0.5, 0,
  '{"riskUnit":{"basis":"ACCOUNT_EQUITY","oneRPercent":1}}'::jsonb,
  public.assurance_stable_jsonb_hash('{"riskUnit":{"basis":"ACCOUNT_EQUITY","oneRPercent":1}}'::jsonb),
  now() - interval '2 minutes'
);

do $$
begin
  begin
    insert into public.recommendation_decision_events (
      decision_hash, pick_id, actor_subject_hash, decision_code, decided_at,
      engine_version, prompt_version, candidate_snapshot_hash, policy_version,
      reason_codes, rationale, snapshot, snapshot_hash, supersedes_id
    ) values (
      repeat('33', 32), '20000000-0000-4000-8000-000000000001', repeat('a', 64),
      'WATCH', now() - interval '1 minute', 'engine-v1', 'prompt-v1',
      public.assurance_stable_jsonb_hash('{}'::jsonb), 'mtn-conditional-90-policy-2026.08-v1',
      array['TEST'], 'post-pilot decision mutation fixture', '{"candidateSnapshot":{}}'::jsonb,
      repeat('34', 32), '40000000-0000-4000-8000-000000000001'
    );
    raise exception 'decision change after pilot link unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.trade_executions (trade_id, side, executed_at, price, shares, fees)
values
  ('30000000-0000-4000-8000-000000000001', 'ENTRY', now() - interval '90 seconds', 101, 10, 2),
  ('30000000-0000-4000-8000-000000000001', 'EXIT', now() - interval '60 seconds', 110, 10, 3),
  ('30000000-0000-4000-8000-000000000002', 'ENTRY', now() - interval '90 seconds', 50, 10, 0);
update public.trades set status = 'COMPLETED'
where id = '30000000-0000-4000-8000-000000000001';
insert into public.trade_performance_records (
  id, trade_id, fees, r_multiple, return_pct, pyramid_compliant, stop_raise_compliant
) values (
  '60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  5, 1, 9, true, true
);
insert into public.recommendation_performance (pick_id, horizon, entry_price)
values ('20000000-0000-4000-8000-000000000001', 'D5', 100);

do $$
declare
  checklist jsonb := '{
    "artifactHashVerified":true,
    "accountOwnershipMatched":true,
    "tickerMatched":true,
    "entryExitMatched":true,
    "costsReconciled":true,
    "riskReviewed":true
  }'::jsonb;
begin
  begin
    insert into public.recommendation_broker_evidence_reviews (
      review_hash, pilot_link_id, pick_id, trade_id, source_kind, artifact_hash,
      reviewer_subject_hash, attestation_status, attestation, checklist, checklist_hash, reviewed_at
    ) values (
      repeat('35', 32), '50000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      'BROKER_STATEMENT', repeat('b', 64), repeat('a', 64), 'PASS',
      'self review must never satisfy independent attestation', checklist,
      public.assurance_stable_jsonb_hash(checklist), now() - interval '30 seconds'
    );
    raise exception 'self-attested broker review unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_broker_evidence_reviews (
      review_hash, pilot_link_id, pick_id, trade_id, source_kind, artifact_hash,
      reviewer_subject_hash, attestation_status, attestation, checklist, checklist_hash, reviewed_at
    ) values (
      repeat('36', 32), '50000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      'BROKER_STATEMENT', repeat('b', 64), repeat('d', 64), 'PASS',
      'incomplete checklist must never satisfy broker review', '{"artifactHashVerified":true}'::jsonb,
      public.assurance_stable_jsonb_hash('{"artifactHashVerified":true}'::jsonb), now() - interval '30 seconds'
    );
    raise exception 'incomplete PASS broker checklist unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_broker_evidence_reviews (
      review_hash, pilot_link_id, pick_id, trade_id, source_kind, artifact_hash,
      reviewer_subject_hash, attestation_status, attestation, checklist, checklist_hash, reviewed_at
    ) values (
      repeat('38', 32), '50000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      'BROKER_STATEMENT', repeat('c', 64), repeat('e', 64), 'PASS',
      'backdated review must never satisfy the append-only evidence ledger', checklist,
      public.assurance_stable_jsonb_hash(checklist), now() - interval '10 minutes'
    );
    raise exception 'backdated broker review unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.recommendation_broker_evidence_reviews (
  id, review_hash, pilot_link_id, pick_id, trade_id, source_kind, artifact_hash,
  reviewer_subject_hash, attestation_status, attestation, checklist, checklist_hash, reviewed_at
) values (
  '80000000-0000-4000-8000-000000000001', repeat('37', 32),
  '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', 'BROKER_STATEMENT', repeat('b', 64), repeat('d', 64),
  'PASS', 'independent reviewer opened the artifact and reconciled all account evidence',
  '{"artifactHashVerified":true,"accountOwnershipMatched":true,"tickerMatched":true,"entryExitMatched":true,"costsReconciled":true,"riskReviewed":true}'::jsonb,
  public.assurance_stable_jsonb_hash('{"artifactHashVerified":true,"accountOwnershipMatched":true,"tickerMatched":true,"entryExitMatched":true,"costsReconciled":true,"riskReviewed":true}'::jsonb),
  now() - interval '30 seconds'
);

do $$
begin
  begin
    insert into public.recommendation_pilot_outcomes (
      outcome_hash, pilot_link_id, trade_id, performance_record_id,
      evidence_status, source_kind, broker_evidence_hash, entry_at, exit_at,
      modeled_entry_price, actual_entry_price, adverse_slippage_pct,
      commission_amount, tax_amount, fx_cost_amount, other_cost_amount, total_cost_amount,
      net_return_pct, r_multiple, risk_breach, execution_snapshot, execution_snapshot_hash, observed_at
    ) values (
      repeat('41', 32), '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
      'VERIFIED', 'BROKER_STATEMENT', repeat('b', 64),
      (select min(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'ENTRY'),
      (select max(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'EXIT'),
      100, 101, 1, 5, 0, 0, 0, 5, 9, 1, false, '{}'::jsonb, repeat('42', 32), now() - interval '10 seconds'
    );
    raise exception 'VERIFIED outcome without independent review unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_pilot_outcomes (
      outcome_hash, pilot_link_id, trade_id, performance_record_id, broker_evidence_review_id,
      evidence_status, source_kind, broker_evidence_hash, entry_at, exit_at,
      modeled_entry_price, actual_entry_price, adverse_slippage_pct,
      commission_amount, tax_amount, fx_cost_amount, other_cost_amount, total_cost_amount,
      net_return_pct, r_multiple, risk_breach, execution_snapshot, execution_snapshot_hash, observed_at
    ) values (
      repeat('43', 32), '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001', 'VERIFIED', 'BROKER_STATEMENT', repeat('e', 64),
      (select min(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'ENTRY'),
      (select max(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'EXIT'), 100, 101, 1,
      5, 0, 0, 0, 5, 9, 1, false, '{}'::jsonb, repeat('44', 32), now() - interval '10 seconds'
    );
    raise exception 'outcome with mismatched artifact review unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_pilot_outcomes (
      outcome_hash, pilot_link_id, trade_id, performance_record_id, broker_evidence_review_id,
      evidence_status, source_kind, broker_evidence_hash, entry_at, exit_at,
      modeled_entry_price, actual_entry_price, adverse_slippage_pct,
      commission_amount, tax_amount, fx_cost_amount, other_cost_amount, total_cost_amount,
      net_return_pct, r_multiple, risk_breach, execution_snapshot, execution_snapshot_hash, observed_at
    ) values (
      repeat('45', 32), '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001', 'VERIFIED', 'BROKER_STATEMENT', repeat('b', 64),
      (select min(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'ENTRY'),
      (select max(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'EXIT'), 100, 101, 1,
      5, 0, 0, 0, 5, 9, 1, true, '{}'::jsonb, repeat('46', 32), now() - interval '10 seconds'
    );
    raise exception 'risk breach mismatch unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_pilot_outcomes (
      outcome_hash, pilot_link_id, trade_id, performance_record_id, broker_evidence_review_id,
      evidence_status, source_kind, broker_evidence_hash, entry_at, exit_at,
      modeled_entry_price, actual_entry_price, adverse_slippage_pct,
      commission_amount, tax_amount, fx_cost_amount, other_cost_amount, total_cost_amount,
      net_return_pct, r_multiple, risk_breach, execution_snapshot, execution_snapshot_hash, observed_at
    ) values (
      repeat('47', 32), '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001', 'VERIFIED', 'BROKER_STATEMENT', repeat('b', 64),
      (select min(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'ENTRY'),
      (select max(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'EXIT'), 100, 101, 1,
      4, 0, 0, 0, 4, 9, 1, false, '{}'::jsonb, repeat('48', 32), now() - interval '10 seconds'
    );
    raise exception 'account cost mismatch unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.recommendation_pilot_outcomes (
      outcome_hash, pilot_link_id, trade_id, performance_record_id, broker_evidence_review_id,
      evidence_status, source_kind, broker_evidence_hash, entry_at, exit_at,
      modeled_entry_price, actual_entry_price, adverse_slippage_pct,
      commission_amount, tax_amount, fx_cost_amount, other_cost_amount, total_cost_amount,
      net_return_pct, r_multiple, risk_breach, execution_snapshot, execution_snapshot_hash, observed_at
    ) values (
      repeat('49', 32), '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001', 'VERIFIED', 'BROKER_STATEMENT', repeat('b', 64),
      (select min(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'ENTRY'),
      (select max(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'EXIT'), 100, 101, 1,
      5, 0, 0, 0, 5, 9, 1, false, '{}'::jsonb, repeat('4a', 32), now() + interval '1 day'
    );
    raise exception 'future pilot outcome unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.recommendation_pilot_outcomes (
  id, outcome_hash, pilot_link_id, trade_id, performance_record_id, broker_evidence_review_id,
  evidence_status, source_kind, broker_evidence_hash, entry_at, exit_at,
  modeled_entry_price, actual_entry_price, adverse_slippage_pct,
  commission_amount, tax_amount, fx_cost_amount, other_cost_amount, total_cost_amount,
  net_return_pct, r_multiple, risk_breach, execution_snapshot, execution_snapshot_hash, observed_at
) values (
  '70000000-0000-4000-8000-000000000001', repeat('51', 32),
  '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  'VERIFIED', 'BROKER_STATEMENT', repeat('b', 64),
  (select min(executed_at) from public.trade_executions
   where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'ENTRY'),
  (select max(executed_at) from public.trade_executions
   where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'EXIT'),
  100, 101, 1, 5, 0, 0, 0, 5, 9, 1, false, '{}'::jsonb,
  public.assurance_stable_jsonb_hash('{}'::jsonb), now() - interval '10 seconds'
);

do $$
begin
  begin
    update public.recommendation_pilot_outcomes set r_multiple = 2
    where id = '70000000-0000-4000-8000-000000000001';
    raise exception 'immutable pilot outcome unexpectedly updated';
  exception when sqlstate '55000' then null;
  end;

  begin
    insert into public.recommendation_pilot_outcomes (
      outcome_hash, pilot_link_id, trade_id, performance_record_id,
      evidence_status, source_kind, risk_breach, execution_snapshot,
      execution_snapshot_hash, supersedes_id, observed_at
    ) values (
      repeat('57', 32), '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
      'INCOMPLETE', 'MANUAL_JOURNAL', false, '{}'::jsonb, repeat('58', 32),
      '70000000-0000-4000-8000-000000000001', now() - interval '5 seconds'
    );
    raise exception 'VERIFIED outcome unexpectedly downgraded out of the scored sample';
  exception when check_violation then null;
  end;

  begin
    update public.trade_performance_records
    set r_multiple = null, return_pct = null
    where id = '60000000-0000-4000-8000-000000000001';
    raise exception 'VERIFIED pilot performance source unexpectedly changed';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.trade_executions
    set price = price + 1
    where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'ENTRY';
    raise exception 'VERIFIED pilot execution source unexpectedly changed';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.trades
    set entry_price = entry_price + 1
    where id = '30000000-0000-4000-8000-000000000001';
    raise exception 'VERIFIED pilot trade plan unexpectedly changed';
  exception when sqlstate '55000' then null;
  end;

  begin
    update public.recommendation_performance
    set entry_price = entry_price + 1
    where pick_id = '20000000-0000-4000-8000-000000000001' and horizon = 'D5';
    raise exception 'VERIFIED pilot model source unexpectedly changed';
  exception when sqlstate '55000' then null;
  end;

  begin
    insert into public.recommendation_pilot_outcomes (
      outcome_hash, pilot_link_id, trade_id, performance_record_id, broker_evidence_review_id,
      evidence_status, source_kind, broker_evidence_hash, entry_at, exit_at,
      modeled_entry_price, actual_entry_price, adverse_slippage_pct,
      commission_amount, tax_amount, fx_cost_amount, other_cost_amount, total_cost_amount,
      net_return_pct, r_multiple, risk_breach, execution_snapshot, execution_snapshot_hash,
      supersedes_id, observed_at
    ) values (
      repeat('55', 32), '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001', 'VERIFIED', 'BROKER_STATEMENT', repeat('b', 64),
      (select min(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'ENTRY'),
      (select max(executed_at) from public.trade_executions
       where trade_id = '30000000-0000-4000-8000-000000000001' and side = 'EXIT'), 100, 101, 1,
      5, 0, 0, 0, 5, 9, 1, false, '{}'::jsonb, repeat('56', 32),
      '70000000-0000-4000-8000-000000000001', now() - interval '20 seconds'
    );
    raise exception 'backdated corrected outcome unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

do $$
declare
  manual_payload jsonb := '{
    "schema_version":"mtn-a11y-manual-review-v1",
    "policy_version":"mtn-conditional-90-policy-2026.08-v1",
    "result":"PASS",
    "artifact_kind":"ACCESSIBILITY_REVIEW_REPORT",
    "artifact_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "reviewer_subject_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "reviewer_authentication":"INDEPENDENT_ASSURANCE_CREDENTIAL",
    "assistive_technology":{"name":"VoiceOver","version":"15.6","platform":"macOS 15.6"},
    "routes_reviewed":["/","/portfolio","/recommendations?view=metrics","/scanner"],
    "checks":{"screenReader":true,"keyboardOnly":true,"focusOrder":true,"colorIndependence":true,"zoom200":true,"mobile360":true},
    "reviewer_attestation":"I independently reviewed every core route with the named assistive technology.",
    "notes":"All core route observations are captured in the hashed review report."
  }'::jsonb;
  branch_payload jsonb := '{
    "artifact_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "protection_snapshot_hash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "reviewer_subject_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "repository":"owner/mtn","branch":"main","required_status_checks":["test"],
    "protected_ref":"refs/heads/main",
    "protected_ref_head_sha":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "release_relation":"MAIN_HEAD","release_ancestor_verified":true,
    "checks":{"strict_status_checks":true,"required_test_check":true,"enforce_admins":true,"force_pushes_disabled":true,"deletions_disabled":true}
  }'::jsonb;
  secrets_payload jsonb := '{
    "api_auth_audit_passed":true,
    "service_role_server_only_tested":true,
    "rls_anon_write_denied_tested":true,
    "deployed_rls_verified":true,
    "result":"PASS"
  }'::jsonb;
begin
  insert into public.assurance_control_evidence (
    evidence_hash, control_key, status, source_kind, source_record_id, release_sha,
    observed_at, valid_until, payload, payload_hash
  ) values (
    repeat('61', 32), 'ACCESSIBILITY_MANUAL', 'PASS', 'MANUAL_REVIEW', repeat('a', 64), repeat('e', 40),
    now() - interval '1 minute', now() + interval '90 days', manual_payload,
    public.assurance_stable_jsonb_hash(manual_payload)
  );
  insert into public.assurance_control_evidence (
    evidence_hash, control_key, status, source_kind, source_record_id, release_sha,
    observed_at, valid_until, payload, payload_hash
  ) values (
    repeat('62', 32), 'BRANCH_PROTECTION', 'PASS', 'GITHUB_API', 'branch-review', repeat('e', 40),
    now() - interval '1 minute', now() + interval '90 days', branch_payload,
    public.assurance_stable_jsonb_hash(branch_payload)
  );
  begin
    insert into public.assurance_control_evidence (
      evidence_hash, control_key, status, source_kind, source_record_id, release_sha,
      observed_at, valid_until, payload, payload_hash
    ) values (
      repeat('60', 32), 'BRANCH_PROTECTION', 'PASS', 'MANUAL_REVIEW', 'forged-manual-branch', repeat('e', 40),
      now(), now() + interval '90 days', branch_payload,
      public.assurance_stable_jsonb_hash(branch_payload)
    );
    raise exception 'manually asserted branch protection PASS unexpectedly accepted';
  exception when check_violation then null;
  end;
  insert into public.assurance_control_evidence (
    evidence_hash, control_key, status, source_kind, source_record_id, release_sha,
    observed_at, valid_until, payload, payload_hash
  ) values (
    repeat('6c', 32), 'SECRETS_LEAST_PRIVILEGE', 'PASS', 'GITHUB_ACTIONS', 'secrets-audit', repeat('e', 40),
    now() - interval '1 minute', now() + interval '30 days', secrets_payload,
    public.assurance_stable_jsonb_hash(secrets_payload)
  );
  begin
    insert into public.assurance_control_evidence (
      evidence_hash, control_key, status, source_kind, source_record_id, release_sha,
      observed_at, valid_until, payload, payload_hash
    ) values (
      repeat('63', 32), 'ACCESSIBILITY_MANUAL', 'PASS', 'MANUAL_REVIEW', 'bad-manual-a11y', repeat('e', 40),
      now(), now() + interval '90 days', '{"routes_reviewed":[]}'::jsonb, repeat('64', 32)
    );
    raise exception 'incomplete manual accessibility PASS unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assurance_control_evidence (
      evidence_hash, control_key, status, source_kind, source_record_id, release_sha,
      observed_at, valid_until, payload, payload_hash
    ) values (
      repeat('65', 32), 'BRANCH_PROTECTION', 'PASS', 'MANUAL_REVIEW', 'bad-branch-review', repeat('e', 40),
      now(), now() + interval '90 days',
      '{"artifact_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","reviewer_subject_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","branch":"main","checks":{"strict_status_checks":true,"required_test_check":false,"enforce_admins":true,"force_pushes_disabled":true,"deletions_disabled":true}}'::jsonb,
      repeat('66', 32)
    );
    raise exception 'incomplete branch protection PASS unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assurance_control_evidence (
      evidence_hash, control_key, status, source_kind, source_record_id, release_sha,
      observed_at, valid_until, payload, payload_hash
    ) values (
      repeat('6d', 32), 'SECRETS_LEAST_PRIVILEGE', 'PASS', 'GITHUB_ACTIONS', 'bad-secrets-audit', repeat('e', 40),
      now(), now() + interval '30 days',
      '{"api_auth_audit_passed":true,"service_role_server_only_tested":true,"rls_anon_write_denied_tested":false,"deployed_rls_verified":false,"result":"PASS"}'::jsonb,
      public.assurance_stable_jsonb_hash('{"api_auth_audit_passed":true,"service_role_server_only_tested":true,"rls_anon_write_denied_tested":false,"deployed_rls_verified":false,"result":"PASS"}'::jsonb)
    );
    raise exception 'incomplete secrets least-privilege PASS unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assurance_control_evidence (
      evidence_hash, control_key, status, source_kind, source_record_id,
      observed_at, valid_until, payload, payload_hash, created_at
    ) values (
      repeat('6e', 32), 'EXTERNAL_HEALTH', 'PASS', 'OPERATIONS_MONITOR', 'backdated-control',
      now() - interval '1 day', now() + interval '1 day', '{}'::jsonb,
      public.assurance_stable_jsonb_hash('{}'::jsonb), now() - interval '1 day'
    );
    raise exception 'directly backdated assurance control unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.assurance_control_evidence (
  evidence_hash, control_key, status, source_kind, source_record_id,
  observed_at, valid_until, payload, payload_hash
) values (
  repeat('67', 32), 'EXTERNAL_HEALTH', 'PASS', 'OPERATIONS_MONITOR', 'fixture',
  now() - interval '1 minute', now() + interval '2 hours', '{}'::jsonb,
  public.assurance_stable_jsonb_hash('{}'::jsonb)
);

insert into public.assurance_score_snapshots (
  snapshot_hash, policy_version, evaluator_version, release_sha,
  investment_score, data_score, strategy_score, risk_score, software_score,
  operations_score, security_score, system_ui_score,
  technical_gate_passed, longitudinal_gate_passed, pilot_gate_passed,
  operational_gate_passed, accessibility_gate_passed,
  duration_24m_gate_passed, longitudinal_24m_gate_passed,
  recovery_gate_passed, operations_90d_gate_passed,
  status, blockers, next_actions, evidence_manifest, evidence_manifest_hash,
  capital_authorized, evaluated_at
) values (
  public.fixture_assurance_snapshot_hash(
    now(), repeat('a', 40), 73, 'RESEARCH_ONLY',
    '{"investment":6,"data":12,"strategy":10,"risk":14,"software":10,"operations":7,"security":5,"system_ui":9}'::jsonb,
    '{"technical":true,"longitudinal":false,"pilot":false,"operational":false,"accessibility":false,"duration24m":false,"longitudinal24m":false,"recovery":false,"operations90d":false}'::jsonb,
    public.assurance_stable_jsonb_hash('{}'::jsonb)
  ),
  'mtn-conditional-90-policy-2026.08-v1', 'mtn-conditional-90-scorecard-v1', repeat('a', 40),
  6, 12, 10, 14, 10, 7, 5, 9,
  true, false, false, false, false,
  false, false, false, false,
  'RESEARCH_ONLY', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
  public.assurance_stable_jsonb_hash('{}'::jsonb), false, now()
);

do $$
begin
  begin
    insert into public.assurance_score_snapshots (
      snapshot_hash, policy_version, evaluator_version,
      investment_score, data_score, strategy_score, risk_score, software_score,
      operations_score, security_score, system_ui_score,
      technical_gate_passed, longitudinal_gate_passed, pilot_gate_passed,
      operational_gate_passed, accessibility_gate_passed,
      status, blockers, next_actions, evidence_manifest, evidence_manifest_hash,
      capital_authorized, evaluated_at
    ) values (
      repeat('6b', 32), 'mtn-conditional-90-policy-2026.08-v1', 'mtn-conditional-90-scorecard-v1',
      6, 12, 10, 14, 10, 7, 5, 9,
      true, false, false, false, false,
      'RESEARCH_ONLY', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, repeat('ff', 32), false, now()
    );
    raise exception 'score snapshot with a forged evidence manifest hash unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assurance_score_snapshots (
      snapshot_hash, policy_version, evaluator_version,
      investment_score, data_score, strategy_score, risk_score, software_score,
      operations_score, security_score, system_ui_score,
      technical_gate_passed, longitudinal_gate_passed, pilot_gate_passed,
      operational_gate_passed, accessibility_gate_passed,
      status, blockers, next_actions, evidence_manifest, evidence_manifest_hash,
      capital_authorized, evaluated_at
    ) values (
      repeat('6c', 32), 'mtn-conditional-90-policy-2026.08-v1', 'mtn-conditional-90-scorecard-v1',
      6, 12, 10, 14, 10, 7, 5, 9,
      true, false, false, false, false,
      'RESEARCH_ONLY', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
      public.assurance_stable_jsonb_hash('{}'::jsonb), false, now() - interval '1 day'
    );
    raise exception 'backdated score snapshot unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assurance_score_snapshots (
      snapshot_hash, policy_version, evaluator_version,
      investment_score, data_score, strategy_score, risk_score, software_score,
      operations_score, security_score, system_ui_score,
      technical_gate_passed, longitudinal_gate_passed, pilot_gate_passed,
      operational_gate_passed, accessibility_gate_passed,
      status, blockers, next_actions, evidence_manifest, evidence_manifest_hash,
      capital_authorized, evaluated_at
    ) values (
      repeat('6d', 32), 'mtn-conditional-90-policy-2026.08-v1', 'mtn-conditional-90-scorecard-v1',
      5, 12, 10, 14, 10, 7, 5, 9,
      true, false, false, false, false,
      'RESEARCH_ONLY', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
      public.assurance_stable_jsonb_hash('{}'::jsonb), false, now()
    );
    raise exception 'arbitrary score below the active gate ceiling unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assurance_score_snapshots (
      snapshot_hash, policy_version, evaluator_version,
      investment_score, data_score, strategy_score, risk_score, software_score,
      operations_score, security_score, system_ui_score,
      technical_gate_passed, longitudinal_gate_passed, pilot_gate_passed,
      operational_gate_passed, accessibility_gate_passed,
      status, blockers, next_actions, evidence_manifest, evidence_manifest_hash,
      capital_authorized, evaluated_at
    ) values (
      repeat('6a', 32), 'mtn-conditional-90-policy-2026.08-v1', 'mtn-conditional-90-scorecard-v1',
      17, 13, 13, 14, 10, 8, 5, 10,
      true, true, false, true, true,
      'ELIGIBLE_FOR_HUMAN_REVIEW', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
      public.assurance_stable_jsonb_hash('{}'::jsonb), false, now()
    );
    raise exception '90 score unexpectedly accepted without pilot gate';
  exception when check_violation then null;
  end;
  begin
    update public.assurance_score_snapshots set capital_authorized = true;
    raise exception 'capital authorization unexpectedly enabled';
  exception when check_violation or sqlstate '55000' then null;
  end;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'recommendation_decision_single_successor_uniq' and contype = 'u'
  ) then
    raise exception 'decision fork-prevention unique constraint is missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'recommendation_pilot_outcome_single_successor_uniq' and contype = 'u'
  ) then
    raise exception 'outcome fork-prevention unique constraint is missing';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'assurance_control_evidence'
      and relation.relrowsecurity
  ) then
    raise exception 'assurance control evidence RLS is not enabled';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.assurance_control_evidence', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.assurance_control_evidence', 'INSERT')
    or not pg_catalog.has_table_privilege('service_role', 'public.assurance_control_evidence', 'INSERT') then
    raise exception 'assurance control evidence privilege boundary is not fail-closed';
  end if;
end;
$$;
SQL

echo "Conditional 90 assurance PostgreSQL 17 integration test passed"
