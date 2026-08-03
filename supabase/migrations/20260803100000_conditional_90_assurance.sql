-- Conditional 90-point assurance: longitudinal evidence, prospective pilot lineage,
-- freshness-aware controls, and immutable assessment-only score snapshots.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.assurance_canonical_jsonb(value jsonb)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  value_type text := pg_catalog.jsonb_typeof(value);
  canonical text;
begin
  if value_type = 'null' then
    return 'null';
  elsif value_type in ('boolean', 'number') then
    return value::text;
  elsif value_type = 'string' then
    return pg_catalog.to_jsonb(value #>> '{}')::text;
  elsif value_type = 'array' then
    select '[' || coalesce(pg_catalog.string_agg(
      public.assurance_canonical_jsonb(element.value),
      ',' order by element.ordinality
    ), '') || ']'
      into canonical
    from pg_catalog.jsonb_array_elements(value) with ordinality as element(value, ordinality);
    return canonical;
  elsif value_type = 'object' then
    select '{' || coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(member.key)::text || ':' || public.assurance_canonical_jsonb(member.value),
      ',' order by member.key
    ), '') || '}'
      into canonical
    from pg_catalog.jsonb_each(value) as member(key, value);
    return canonical;
  end if;
  raise exception 'Unsupported assurance JSON value type: %', value_type using errcode = '22023';
end;
$$;

create or replace function public.assurance_stable_jsonb_hash(value jsonb)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
return pg_catalog.encode(
  extensions.digest(
    pg_catalog.convert_to(public.assurance_canonical_jsonb(value), 'UTF8'),
    'sha256'
  ),
  'hex'
);

create or replace function public.assurance_jsonb_object_key_count(value jsonb)
returns integer
language sql
immutable
strict
security invoker
set search_path = ''
return case
  when pg_catalog.jsonb_typeof(value) = 'object' then (
    select pg_catalog.count(*)::integer
    from pg_catalog.jsonb_object_keys(value)
  )
  else null
end;

-- NULL/NULL remains rollout-compatible with an older application during a
-- DB-first deployment, but such rows are permanently ineligible for
-- longitudinal assurance. The new application binds new publications at insert.
alter table public.recommendation_publications
  add column if not exists assurance_contract_hash text,
  add column if not exists assurance_contract jsonb;

alter table public.recommendation_publications
  add constraint recommendation_publications_assurance_contract_pair_check check (
    (assurance_contract_hash is null and assurance_contract is null)
    or (
      assurance_contract_hash ~ '^[a-f0-9]{64}$'
      and jsonb_typeof(assurance_contract) = 'object'
      and public.assurance_jsonb_object_key_count(assurance_contract) = 7
      and assurance_contract ?& array[
        'schemaVersion',
        'engineVersion',
        'promptVersion',
        'llmProvider',
        'llmModel',
        'strategyContractVersion',
        'dataContractVersion'
      ]
      and assurance_contract - array[
        'schemaVersion',
        'engineVersion',
        'promptVersion',
        'llmProvider',
        'llmModel',
        'strategyContractVersion',
        'dataContractVersion'
      ] = '{}'::jsonb
      and assurance_contract ->> 'schemaVersion' = 'mtn-recommendation-assurance-contract-v1'
      and (assurance_contract ->> 'engineVersion') is not distinct from engine_version
      and (assurance_contract ->> 'promptVersion') is not distinct from prompt_version
      and (assurance_contract ->> 'llmProvider') is not distinct from llm_provider
      and (assurance_contract ->> 'llmModel') is not distinct from llm_model
      and coalesce(assurance_contract ->> 'strategyContractVersion', '') <> ''
      and coalesce(assurance_contract ->> 'dataContractVersion', '') <> ''
      and assurance_contract_hash = public.assurance_stable_jsonb_hash(assurance_contract)
    )
  );

create or replace function public.validate_recommendation_publication_assurance_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.assurance_contract_hash is distinct from new.assurance_contract_hash
    or old.assurance_contract is distinct from new.assurance_contract then
    raise exception 'Recommendation publication assurance contracts are immutable and cannot be backfilled or changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger recommendation_publication_assurance_contract_validate
  before update on public.recommendation_publications
  for each row execute function public.validate_recommendation_publication_assurance_contract();

create index if not exists recommendation_publications_assurance_contract_idx
  on public.recommendation_publications (category, assurance_contract_hash, run_date desc)
  where is_official = true and status = 'PUBLISHED' and assurance_contract_hash is not null;

create table if not exists public.recommendation_longitudinal_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_hash text not null unique check (evaluation_hash ~ '^[a-f0-9]{64}$'),
  market text not null check (market in ('US', 'KR')),
  category text not null check (category in ('NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150')),
  engine_version text not null,
  assurance_contract_hash text not null check (assurance_contract_hash ~ '^[a-f0-9]{64}$'),
  horizon text not null check (horizon in ('D5', 'D20', 'D60')),
  window_months integer not null check (window_months in (12, 24)),
  window_start date not null,
  window_end date not null,
  covered_month_count integer not null check (covered_month_count >= 0),
  sample_size integer not null check (sample_size >= 0),
  cohort_count integer not null check (cohort_count >= 0),
  market_regime_count integer not null check (market_regime_count >= 0),
  regime_cohort_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(regime_cohort_counts) = 'object'),
  mean_net_return_pct numeric,
  mean_net_excess_return_pct numeric,
  excess_ci95_lower numeric,
  excess_ci95_upper numeric,
  average_mae_pct numeric,
  lower_decile_net_return_pct numeric,
  lower_decile_net_excess_return_pct numeric,
  tail_breach_rate numeric check (tail_breach_rate is null or tail_breach_rate between 0 and 1),
  manifest_set_hash text not null check (manifest_set_hash ~ '^[a-f0-9]{64}$'),
  statistics_version text not null,
  policy_version text not null,
  evidence_status text not null check (evidence_status in ('READY', 'INSUFFICIENT', 'INCOMPLETE')),
  gate_status text not null check (gate_status in ('PASS', 'BLOCKED')),
  gate_reasons text[] not null default '{}',
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint recommendation_longitudinal_window_check check (window_start <= window_end),
  constraint recommendation_longitudinal_pass_fail_closed_check check (
    gate_status <> 'PASS'
    or (
      evidence_status = 'READY'
      and statistics_version = 'mtn-cohort-block-bootstrap-95-v1'
      and policy_version = 'mtn-longitudinal-assurance-2026.08-v1'
      and excess_ci95_lower > 0
      and market_regime_count >= 2
      and lower_decile_net_excess_return_pct >= 0
      and tail_breach_rate <= 0.05
      and cardinality(gate_reasons) = 0
      and (
        (
          window_months = 12
          and covered_month_count >= 10
          and sample_size >= 100
          and (
            (horizon = 'D5' and cohort_count >= 60)
            or (horizon = 'D20' and cohort_count >= 40)
            or (horizon = 'D60' and cohort_count >= 20)
          )
        )
        or (
          window_months = 24
          and covered_month_count >= 20
          and sample_size >= 200
          and (
            (horizon = 'D5' and cohort_count >= 120)
            or (horizon = 'D20' and cohort_count >= 80)
            or (horizon = 'D60' and cohort_count >= 40)
          )
        )
      )
    )
  ),
  constraint recommendation_longitudinal_market_category_check check (
    (market = 'US' and category in ('NASDAQ100', 'SP500'))
    or (market = 'KR' and category in ('KOSPI200', 'KOSDAQ150'))
  ),
  constraint recommendation_longitudinal_append_window_check check (
    evaluated_at between created_at - interval '5 minutes' and created_at + interval '5 minutes'
  )
);

create index if not exists recommendation_longitudinal_latest_idx
  on public.recommendation_longitudinal_evaluations
  (category, assurance_contract_hash, window_months, horizon, evaluated_at desc);

create table if not exists public.recommendation_decision_events (
  id uuid primary key default gen_random_uuid(),
  decision_hash text not null unique check (decision_hash ~ '^[a-f0-9]{64}$'),
  pick_id uuid not null references public.recommendation_picks(id) on delete restrict,
  actor_subject_hash text not null check (actor_subject_hash ~ '^[a-f0-9]{64}$'),
  decision_code text not null check (decision_code in ('ACCEPT', 'REJECT', 'WATCH', 'NO_ACTION')),
  decided_at timestamptz not null,
  engine_version text not null,
  prompt_version text,
  candidate_snapshot_hash text not null check (candidate_snapshot_hash ~ '^[a-f0-9]{64}$'),
  policy_version text not null,
  reason_codes text[] not null check (cardinality(reason_codes) > 0),
  rationale text not null check (char_length(rationale) between 10 and 4000),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  supersedes_id uuid references public.recommendation_decision_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint recommendation_decision_append_window_check check (
    decided_at between created_at - interval '5 minutes' and created_at + interval '5 minutes'
  ),
  constraint recommendation_decision_policy_version_check check (
    policy_version = 'mtn-conditional-90-policy-2026.08-v1'
  ),
  constraint recommendation_decision_single_successor_uniq
    unique nulls not distinct (pick_id, actor_subject_hash, supersedes_id)
);

create index if not exists recommendation_decision_pick_latest_idx
  on public.recommendation_decision_events (pick_id, decided_at desc, created_at desc);

create table if not exists public.recommendation_pilot_links (
  id uuid primary key default gen_random_uuid(),
  link_hash text not null unique check (link_hash ~ '^[a-f0-9]{64}$'),
  decision_id uuid not null references public.recommendation_decision_events(id) on delete restrict,
  pick_id uuid not null references public.recommendation_picks(id) on delete restrict,
  trade_id uuid not null unique references public.trades(id) on delete restrict,
  actor_subject_hash text not null check (actor_subject_hash ~ '^[a-f0-9]{64}$'),
  authorized_risk_r numeric not null check (authorized_risk_r > 0 and authorized_risk_r <= 0.5),
  risk_unit_account_equity_pct numeric not null default 0.01
    check (risk_unit_account_equity_pct = 0.01),
  trade_version_at_link bigint not null check (trade_version_at_link >= 0),
  risk_policy_snapshot jsonb not null check (jsonb_typeof(risk_policy_snapshot) = 'object'),
  risk_policy_hash text not null check (risk_policy_hash ~ '^[a-f0-9]{64}$'),
  linked_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (pick_id, actor_subject_hash),
  constraint recommendation_pilot_link_append_window_check check (
    linked_at between created_at - interval '5 minutes' and created_at + interval '5 minutes'
  )
);

create index if not exists recommendation_pilot_links_pick_idx
  on public.recommendation_pilot_links (pick_id, linked_at desc);

create table if not exists public.recommendation_broker_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  review_hash text not null unique check (review_hash ~ '^[a-f0-9]{64}$'),
  pilot_link_id uuid not null references public.recommendation_pilot_links(id) on delete restrict,
  pick_id uuid not null references public.recommendation_picks(id) on delete restrict,
  trade_id uuid not null references public.trades(id) on delete restrict,
  source_kind text not null check (source_kind in ('BROKER_API', 'BROKER_STATEMENT')),
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  reviewer_subject_hash text not null check (reviewer_subject_hash ~ '^[a-f0-9]{64}$'),
  attestation_status text not null check (attestation_status in ('PASS', 'REJECTED')),
  attestation text not null check (char_length(attestation) between 20 and 4000),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),
  checklist_hash text not null check (checklist_hash ~ '^[a-f0-9]{64}$'),
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint recommendation_broker_review_append_window_check check (
    reviewed_at between created_at - interval '5 minutes' and created_at + interval '5 minutes'
  ),
  constraint recommendation_broker_review_pass_check check (
    attestation_status <> 'PASS'
    or checklist @> '{
      "artifactHashVerified": true,
      "accountOwnershipMatched": true,
      "tickerMatched": true,
      "entryExitMatched": true,
      "costsReconciled": true,
      "riskReviewed": true
    }'::jsonb
  ),
  unique (pilot_link_id, artifact_hash, reviewer_subject_hash)
);

create index if not exists recommendation_broker_evidence_reviews_link_idx
  on public.recommendation_broker_evidence_reviews (pilot_link_id, reviewed_at desc, created_at desc);

create table if not exists public.recommendation_pilot_outcomes (
  id uuid primary key default gen_random_uuid(),
  outcome_hash text not null unique check (outcome_hash ~ '^[a-f0-9]{64}$'),
  pilot_link_id uuid not null references public.recommendation_pilot_links(id) on delete restrict,
  trade_id uuid not null references public.trades(id) on delete restrict,
  performance_record_id uuid not null references public.trade_performance_records(id) on delete restrict,
  broker_evidence_review_id uuid references public.recommendation_broker_evidence_reviews(id) on delete restrict,
  evidence_status text not null check (evidence_status in ('VERIFIED', 'INCOMPLETE', 'REJECTED')),
  source_kind text not null check (source_kind in ('BROKER_API', 'BROKER_STATEMENT', 'MANUAL_JOURNAL')),
  broker_evidence_hash text check (broker_evidence_hash is null or broker_evidence_hash ~ '^[a-f0-9]{64}$'),
  entry_at timestamptz,
  exit_at timestamptz,
  modeled_entry_price numeric check (modeled_entry_price is null or modeled_entry_price > 0),
  actual_entry_price numeric check (actual_entry_price is null or actual_entry_price > 0),
  adverse_slippage_pct numeric,
  commission_amount numeric check (commission_amount is null or commission_amount >= 0),
  tax_amount numeric check (tax_amount is null or tax_amount >= 0),
  fx_cost_amount numeric check (fx_cost_amount is null or fx_cost_amount >= 0),
  other_cost_amount numeric check (other_cost_amount is null or other_cost_amount >= 0),
  total_cost_amount numeric check (total_cost_amount is null or total_cost_amount >= 0),
  net_return_pct numeric,
  r_multiple numeric,
  risk_breach boolean not null default false,
  execution_snapshot jsonb not null check (jsonb_typeof(execution_snapshot) = 'object'),
  execution_snapshot_hash text not null check (execution_snapshot_hash ~ '^[a-f0-9]{64}$'),
  supersedes_id uuid references public.recommendation_pilot_outcomes(id) on delete restrict,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint recommendation_pilot_outcome_time_check check (
    (entry_at is null and exit_at is null) or (entry_at is not null and exit_at is not null and exit_at >= entry_at)
  ),
  constraint recommendation_pilot_outcome_verified_check check (
    evidence_status <> 'VERIFIED'
    or (
      source_kind in ('BROKER_API', 'BROKER_STATEMENT')
      and broker_evidence_hash is not null
      and broker_evidence_review_id is not null
      and entry_at is not null
      and exit_at is not null
      and modeled_entry_price is not null
      and actual_entry_price is not null
      and adverse_slippage_pct is not null
      and commission_amount is not null
      and tax_amount is not null
      and fx_cost_amount is not null
      and other_cost_amount is not null
      and total_cost_amount is not null
      and net_return_pct is not null
      and r_multiple is not null
    )
  ),
  constraint recommendation_pilot_outcome_cost_sum_check check (
    total_cost_amount is null
    or abs(total_cost_amount - (
      coalesce(commission_amount, 0)
      + coalesce(tax_amount, 0)
      + coalesce(fx_cost_amount, 0)
      + coalesce(other_cost_amount, 0)
    )) <= 0.000001
  ),
  constraint recommendation_pilot_outcome_append_window_check check (
    observed_at between created_at - interval '5 minutes' and created_at + interval '5 minutes'
  ),
  constraint recommendation_pilot_outcome_single_successor_uniq
    unique nulls not distinct (pilot_link_id, supersedes_id)
);

create index if not exists recommendation_pilot_outcomes_latest_idx
  on public.recommendation_pilot_outcomes (pilot_link_id, observed_at desc, created_at desc);

create table if not exists public.assurance_control_evidence (
  id uuid primary key default gen_random_uuid(),
  evidence_hash text not null unique check (evidence_hash ~ '^[a-f0-9]{64}$'),
  control_key text not null check (control_key in (
    'RELEASE_CI',
    'BRANCH_PROTECTION',
    'SECRETS_LEAST_PRIVILEGE',
    'EXTERNAL_HEALTH',
    'BACKUP_RESTORE',
    'RECOVERY_DRILL',
    'ACCESSIBILITY_AUTOMATED',
    'ACCESSIBILITY_MANUAL'
  )),
  environment text not null default 'PRODUCTION' check (environment in ('PRODUCTION', 'STAGING', 'TEST')),
  status text not null check (status in ('PASS', 'FAIL', 'INCONCLUSIVE')),
  source_kind text not null check (source_kind in (
    'GITHUB_ACTIONS',
    'GITHUB_API',
    'OPERATIONS_MONITOR',
    'BACKUP_LEDGER',
    'MANUAL_REVIEW',
    'DEPLOYMENT'
  )),
  source_record_id text not null,
  release_sha text check (release_sha is null or release_sha ~ '^[a-f0-9]{40}$'),
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint assurance_control_freshness_window_check check (valid_until > observed_at),
  constraint assurance_control_not_future_check check (
    observed_at between created_at - interval '5 minutes' and created_at + interval '5 minutes'
  ),
  constraint assurance_manual_accessibility_payload_check check (
    control_key <> 'ACCESSIBILITY_MANUAL'
    or status <> 'PASS'
    or (
      source_kind = 'MANUAL_REVIEW'
      and release_sha is not null
      and coalesce(payload ->> 'artifact_hash', '') ~ '^[a-f0-9]{64}$'
      and coalesce(payload ->> 'reviewer_subject_hash', '') ~ '^[a-f0-9]{64}$'
      and jsonb_array_length(coalesce(payload -> 'routes_reviewed', '[]'::jsonb)) between 1 and 20
      and payload @> '{"checks":{"screenReader":true,"keyboardOnly":true,"focusOrder":true,"colorIndependence":true,"zoom200":true,"mobile360":true}}'::jsonb
    )
  ),
  constraint assurance_branch_protection_payload_check check (
    control_key <> 'BRANCH_PROTECTION'
    or status <> 'PASS'
    or (
      source_kind = 'GITHUB_API'
      and release_sha is not null
      and coalesce(payload ->> 'artifact_hash', '') ~ '^[a-f0-9]{64}$'
      and coalesce(payload ->> 'reviewer_subject_hash', '') ~ '^[a-f0-9]{64}$'
      and payload ->> 'branch' = 'main'
      and payload ->> 'protected_ref' = 'refs/heads/main'
      and coalesce(payload ->> 'protected_ref_head_sha', '') ~ '^[a-f0-9]{40}$'
      and payload ->> 'release_relation' in ('MAIN_HEAD', 'MAIN_ANCESTOR')
      and payload -> 'release_ancestor_verified' = 'true'::jsonb
      and coalesce(payload ->> 'protection_snapshot_hash', '') ~ '^[a-f0-9]{64}$'
      and (
        payload ->> 'release_relation' <> 'MAIN_HEAD'
        or payload ->> 'protected_ref_head_sha' = release_sha
      )
      and payload @> '{"checks":{"strict_status_checks":true,"required_test_check":true,"enforce_admins":true,"force_pushes_disabled":true,"deletions_disabled":true}}'::jsonb
    )
  ),
  constraint assurance_secrets_least_privilege_payload_check check (
    control_key <> 'SECRETS_LEAST_PRIVILEGE'
    or status <> 'PASS'
    or (
      source_kind = 'GITHUB_ACTIONS'
      and release_sha is not null
      and payload @> '{"api_auth_audit_passed":true,"service_role_server_only_tested":true,"rls_anon_write_denied_tested":true,"deployed_rls_verified":true,"result":"PASS"}'::jsonb
    )
  ),
  constraint assurance_recovery_drill_payload_check check (
    control_key <> 'RECOVERY_DRILL'
    or status <> 'PASS'
    or (
      source_kind = 'GITHUB_ACTIONS'
      and release_sha is not null
      and payload @> '{
        "encrypted": true,
        "restore_drill": true,
        "row_count_reconciliation": true,
        "critical_query_smoke": true,
        "rpo_measured": true,
        "offsite": true,
        "offsite_provider": "GITHUB_ARTIFACT",
        "rto_target_seconds": 3600,
        "rpo_target_seconds": 86400
      }'::jsonb
      and jsonb_typeof(payload -> 'critical_query_count') = 'number'
      and (payload ->> 'critical_query_count')::numeric >= 3
      and char_length(coalesce(payload ->> 'artifact_id', '')) > 0
      and coalesce(payload ->> 'artifact_digest', '') ~ '^(sha256:)?[a-f0-9]{64}$'
      and jsonb_typeof(payload -> 'rto_seconds') = 'number'
      and (payload ->> 'rto_seconds')::numeric between 0 and 3600
      and jsonb_typeof(payload -> 'rpo_seconds') = 'number'
      and (payload ->> 'rpo_seconds')::numeric between 0 and 86400
    )
  )
);

create index if not exists assurance_control_latest_idx
  on public.assurance_control_evidence (environment, control_key, observed_at desc, created_at desc);

create table if not exists public.assurance_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_hash text not null unique check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  policy_version text not null,
  evaluator_version text not null,
  release_sha text check (release_sha is null or release_sha ~ '^[a-f0-9]{40}$'),
  investment_score integer not null check (investment_score between 0 and 17),
  data_score integer not null check (data_score between 0 and 13),
  strategy_score integer not null check (strategy_score between 0 and 13),
  risk_score integer not null check (risk_score between 0 and 14),
  software_score integer not null check (software_score between 0 and 10),
  operations_score integer not null check (operations_score between 0 and 8),
  security_score integer not null check (security_score between 0 and 5),
  system_ui_score integer not null check (system_ui_score between 0 and 10),
  awarded_score integer generated always as (
    investment_score + data_score + strategy_score + risk_score
    + software_score + operations_score + security_score + system_ui_score
  ) stored,
  technical_gate_passed boolean not null,
  longitudinal_gate_passed boolean not null,
  pilot_gate_passed boolean not null,
  operational_gate_passed boolean not null,
  accessibility_gate_passed boolean not null,
  duration_24m_gate_passed boolean not null,
  longitudinal_24m_gate_passed boolean not null,
  recovery_gate_passed boolean not null,
  operations_90d_gate_passed boolean not null,
  conditional_ceiling integer generated always as (
    case
      when technical_gate_passed
        and longitudinal_gate_passed
        and pilot_gate_passed
        and operational_gate_passed
        and accessibility_gate_passed
        and duration_24m_gate_passed
        and longitudinal_24m_gate_passed
        and recovery_gate_passed
        and operations_90d_gate_passed then 90
      when technical_gate_passed
        and longitudinal_gate_passed
        and operational_gate_passed then 85
      when technical_gate_passed then 73
      else 72
    end
  ) stored,
  status text not null check (status in ('RESEARCH_ONLY', 'SMALL_PILOT_REVIEW', 'ELIGIBLE_FOR_HUMAN_REVIEW')),
  blockers jsonb not null check (jsonb_typeof(blockers) = 'array'),
  next_actions jsonb not null check (jsonb_typeof(next_actions) = 'array'),
  evidence_manifest jsonb not null check (jsonb_typeof(evidence_manifest) = 'object'),
  evidence_manifest_hash text not null check (evidence_manifest_hash ~ '^[a-f0-9]{64}$'),
  decision_scope text not null default 'ASSESSMENT_ONLY' check (decision_scope = 'ASSESSMENT_ONLY'),
  capital_authorized boolean not null default false check (not capital_authorized),
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint assurance_score_version_check check (
    policy_version = 'mtn-conditional-90-policy-2026.08-v1'
    and evaluator_version = 'mtn-conditional-90-scorecard-v1'
  ),
  constraint assurance_score_release_gate_check check (
    not technical_gate_passed or release_sha is not null
  ),
  constraint assurance_score_exact_ceiling_check check (awarded_score = conditional_ceiling),
  constraint assurance_score_append_window_check check (
    evaluated_at between created_at - interval '5 minutes' and created_at + interval '5 minutes'
  ),
  constraint assurance_score_status_consistency_check check (
    (status = 'RESEARCH_ONLY' and awarded_score <= 73)
    or (status = 'SMALL_PILOT_REVIEW' and awarded_score = 85 and conditional_ceiling >= 85)
    or (status = 'ELIGIBLE_FOR_HUMAN_REVIEW' and awarded_score = 90 and conditional_ceiling = 90)
  )
);

create index if not exists assurance_score_snapshots_latest_idx
  on public.assurance_score_snapshots (evaluated_at desc, created_at desc);

create or replace function public.validate_recommendation_longitudinal_evaluation_append()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.evaluated_at not between pg_catalog.clock_timestamp() - interval '5 minutes'
      and pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'Longitudinal evaluation append timestamp must be within five minutes of database time.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger recommendation_longitudinal_evaluation_validate
  before insert on public.recommendation_longitudinal_evaluations
  for each row execute function public.validate_recommendation_longitudinal_evaluation_append();

create or replace function public.validate_recommendation_decision_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication_engine text;
  publication_prompt text;
  publication_generated_at timestamptz;
  publication_is_official boolean;
  publication_status text;
  pick_candidate_snapshot jsonb;
  previous_pick uuid;
  previous_actor text;
  previous_decided_at timestamptz;
  latest_decision_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.pick_id::text || ':' || new.actor_subject_hash,
    0
  ));

  select publication.engine_version, publication.prompt_version, publication.generated_at,
         publication.is_official, publication.status, pick.candidate_snapshot
    into publication_engine, publication_prompt, publication_generated_at,
         publication_is_official, publication_status, pick_candidate_snapshot
  from public.recommendation_picks as pick
  join public.recommendation_publications as publication on publication.id = pick.publication_id
  where pick.id = new.pick_id
  for update of pick, publication;

  if publication_engine is null then
    raise exception 'Decision pick does not resolve to a recommendation publication.' using errcode = '23514';
  end if;
  if publication_is_official is distinct from true or publication_status is distinct from 'PUBLISHED' then
    raise exception 'Decisions require an official PUBLISHED recommendation.' using errcode = '23514';
  end if;
  if new.engine_version <> publication_engine
    or coalesce(new.prompt_version, '') <> coalesce(publication_prompt, '') then
    raise exception 'Decision engine or prompt does not match the immutable publication.' using errcode = '23514';
  end if;
  if new.candidate_snapshot_hash is distinct from public.assurance_stable_jsonb_hash(pick_candidate_snapshot)
    or new.snapshot -> 'candidateSnapshot' is distinct from pick_candidate_snapshot then
    raise exception 'Decision candidate snapshot or hash does not match the recommendation pick.' using errcode = '23514';
  end if;
  if new.decided_at < publication_generated_at then
    raise exception 'Decision cannot predate recommendation publication.' using errcode = '23514';
  end if;
  if new.decided_at not between pg_catalog.clock_timestamp() - interval '5 minutes'
      and pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'Decision append timestamp must be within five minutes of database time.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.recommendation_pilot_links as link
    where link.pick_id = new.pick_id and link.actor_subject_hash = new.actor_subject_hash
  ) then
    raise exception 'A recommendation decision cannot change after its pilot has been linked.' using errcode = '23514';
  end if;

  select previous.id, previous.decided_at into latest_decision_id, previous_decided_at
  from public.recommendation_decision_events as previous
  where previous.pick_id = new.pick_id and previous.actor_subject_hash = new.actor_subject_hash
  order by previous.decided_at desc, previous.created_at desc, previous.id desc
  limit 1;
  if latest_decision_id is not null and new.supersedes_id is distinct from latest_decision_id then
    raise exception 'A subsequent decision must supersede the latest decision for the same pick and actor.' using errcode = '23514';
  end if;
  if latest_decision_id is null and new.supersedes_id is not null then
    raise exception 'An initial decision cannot supersede an unrelated row.' using errcode = '23514';
  end if;

  if new.supersedes_id is not null then
    select previous.pick_id, previous.actor_subject_hash
      into previous_pick, previous_actor
    from public.recommendation_decision_events as previous
    where previous.id = new.supersedes_id;
    if previous_pick is distinct from new.pick_id or previous_actor is distinct from new.actor_subject_hash then
      raise exception 'A correction must supersede a decision for the same pick and actor.' using errcode = '23514';
    end if;
    if new.decided_at < previous_decided_at then
      raise exception 'A correction decision timestamp cannot precede the decision it supersedes.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger recommendation_decision_event_validate
  before insert on public.recommendation_decision_events
  for each row execute function public.validate_recommendation_decision_event();

create or replace function public.validate_recommendation_pilot_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision_code text;
  decision_pick uuid;
  decision_actor text;
  decision_decided_at timestamptz;
  pick_ticker text;
  trade_ticker text;
  trade_status text;
  trade_version bigint;
  trade_total_equity numeric;
  trade_planned_risk numeric;
  trade_risk_percent numeric;
  latest_decision_id uuid;
  latest_score integer;
  latest_score_ceiling integer;
  latest_score_status text;
  latest_score_evaluated_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.pick_id::text || ':' || new.actor_subject_hash,
    0
  ));

  select decision.decision_code, decision.pick_id, decision.actor_subject_hash, decision.decided_at
    into decision_code, decision_pick, decision_actor, decision_decided_at
  from public.recommendation_decision_events as decision
  where decision.id = new.decision_id;

  if decision_code is distinct from 'ACCEPT'
    or decision_pick is distinct from new.pick_id
    or decision_actor is distinct from new.actor_subject_hash then
    raise exception 'Pilot links require an ACCEPT decision for the same pick and actor.' using errcode = '23514';
  end if;
  select latest.id into latest_decision_id
  from public.recommendation_decision_events as latest
  where latest.pick_id = new.pick_id and latest.actor_subject_hash = new.actor_subject_hash
  order by latest.decided_at desc, latest.created_at desc, latest.id desc
  limit 1;
  if latest_decision_id is distinct from new.decision_id then
    raise exception 'Pilot links require the latest recommendation decision to remain ACCEPT.' using errcode = '23514';
  end if;
  if new.linked_at < decision_decided_at then
    raise exception 'Pilot links cannot predate their ACCEPT decision.' using errcode = '23514';
  end if;
  if new.linked_at not between pg_catalog.clock_timestamp() - interval '5 minutes'
      and pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'Pilot link append timestamp must be within five minutes of database time.' using errcode = '23514';
  end if;

  select snapshot.awarded_score, snapshot.conditional_ceiling, snapshot.status, snapshot.evaluated_at
    into latest_score, latest_score_ceiling, latest_score_status, latest_score_evaluated_at
  from public.assurance_score_snapshots as snapshot
  order by snapshot.evaluated_at desc, snapshot.created_at desc, snapshot.id desc
  limit 1;
  if latest_score is null
    or latest_score < 85
    or latest_score_ceiling < 85
    or latest_score_status not in ('SMALL_PILOT_REVIEW', 'ELIGIBLE_FOR_HUMAN_REVIEW')
    or latest_score_evaluated_at > new.linked_at then
    raise exception 'Pilot links require the latest 85-or-higher assessment snapshot to predate the link.' using errcode = '23514';
  end if;

  select upper(pick.ticker) into pick_ticker
  from public.recommendation_picks as pick where pick.id = new.pick_id;
  select upper(trade.ticker), trade.status, coalesce(trade.version, 0),
         trade.total_equity, trade.planned_risk, trade.risk_percent
    into trade_ticker, trade_status, trade_version,
         trade_total_equity, trade_planned_risk, trade_risk_percent
  from public.trades as trade where trade.id = new.trade_id
  for update;

  if pick_ticker is distinct from trade_ticker then
    raise exception 'Pilot trade ticker must exactly match the recommendation pick.' using errcode = '23514';
  end if;
  if trade_status is distinct from 'PLANNED' then
    raise exception 'Pilot trade must be PLANNED when it is linked.' using errcode = '23514';
  end if;
  if new.trade_version_at_link is distinct from trade_version then
    raise exception 'Pilot link trade version is stale.' using errcode = '40001';
  end if;
  if trade_total_equity is null or trade_total_equity <= 0
    or trade_planned_risk is null or trade_planned_risk <= 0
    or trade_risk_percent is null or trade_risk_percent <= 0
    or abs(trade_risk_percent - (trade_planned_risk / trade_total_equity)) > 0.000001 then
    raise exception 'Pilot trade account equity, planned risk, and risk percent must reconcile.' using errcode = '23514';
  end if;
  if trade_risk_percent > new.authorized_risk_r / 100 then
    raise exception 'Pilot trade risk percent exceeds the authorized R limit where 1R equals 1 percent of account equity.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.trade_executions as execution
    where execution.trade_id = new.trade_id and execution.side = 'ENTRY'
  ) then
    raise exception 'Pilot trade must be linked before its first entry execution.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger recommendation_pilot_link_validate
  before insert on public.recommendation_pilot_links
  for each row execute function public.validate_recommendation_pilot_link();

create or replace function public.validate_recommendation_broker_evidence_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_pick uuid;
  linked_trade uuid;
  linked_actor text;
  linked_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.pilot_link_id::text,
    0
  ));
  select link.pick_id, link.trade_id, link.actor_subject_hash, link.linked_at
    into linked_pick, linked_trade, linked_actor, linked_at
  from public.recommendation_pilot_links as link
  where link.id = new.pilot_link_id
  for update;
  if linked_pick is distinct from new.pick_id or linked_trade is distinct from new.trade_id then
    raise exception 'Broker evidence review pick or trade does not match its pilot link.' using errcode = '23514';
  end if;
  if new.reviewer_subject_hash is not distinct from linked_actor then
    raise exception 'Broker evidence review must be independently attested.' using errcode = '23514';
  end if;
  if new.reviewed_at < linked_at
    or new.reviewed_at not between pg_catalog.clock_timestamp() - interval '5 minutes'
      and pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'Broker review append timestamp must follow the link and be within five minutes of database time.' using errcode = '23514';
  end if;
  if new.checklist_hash is distinct from public.assurance_stable_jsonb_hash(new.checklist) then
    raise exception 'Broker evidence review checklist hash does not match its content.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger recommendation_broker_evidence_review_validate
  before insert on public.recommendation_broker_evidence_reviews
  for each row execute function public.validate_recommendation_broker_evidence_review();

create or replace function public.validate_recommendation_pilot_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_trade uuid;
  linked_pick uuid;
  linked_at timestamptz;
  trade_status text;
  trade_direction text;
  performance_trade uuid;
  performance_r numeric;
  performance_return numeric;
  performance_fees numeric;
  performance_pyramid_compliant boolean;
  performance_stop_raise_compliant boolean;
  weighted_entry numeric;
  first_entry timestamptz;
  last_exit timestamptz;
  model_entry numeric;
  expected_slippage numeric;
  expected_risk_breach boolean;
  linked_decision uuid;
  linked_actor text;
  review_link uuid;
  review_pick uuid;
  review_trade uuid;
  review_source text;
  review_artifact_hash text;
  review_status text;
  review_reviewed_at timestamptz;
  latest_decision_id uuid;
  latest_outcome_id uuid;
  latest_outcome_observed_at timestamptz;
  latest_outcome_evidence_status text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.pilot_link_id::text,
    0
  ));
  select link.trade_id, link.pick_id, link.decision_id, link.actor_subject_hash, link.linked_at
    into linked_trade, linked_pick, linked_decision, linked_actor, linked_at
  from public.recommendation_pilot_links as link where link.id = new.pilot_link_id
  for update;
  if linked_trade is distinct from new.trade_id then
    raise exception 'Pilot outcome trade does not match its immutable pilot link.' using errcode = '23514';
  end if;
  select decision.id into latest_decision_id
  from public.recommendation_decision_events as decision
  where decision.pick_id = linked_pick and decision.actor_subject_hash = linked_actor
  order by decision.decided_at desc, decision.created_at desc, decision.id desc
  limit 1;
  if new.evidence_status = 'VERIFIED' and latest_decision_id is distinct from linked_decision then
    raise exception 'Verified pilot outcomes require the linked ACCEPT decision to remain the latest decision.' using errcode = '23514';
  end if;

  select outcome.id, outcome.observed_at, outcome.evidence_status
    into latest_outcome_id, latest_outcome_observed_at, latest_outcome_evidence_status
  from public.recommendation_pilot_outcomes as outcome
  where outcome.pilot_link_id = new.pilot_link_id
  order by outcome.observed_at desc, outcome.created_at desc, outcome.id desc
  limit 1;
  if latest_outcome_id is not null and new.supersedes_id is distinct from latest_outcome_id then
    raise exception 'A subsequent pilot outcome must supersede the latest outcome.' using errcode = '23514';
  end if;
  if latest_outcome_id is null and new.supersedes_id is not null then
    raise exception 'An initial pilot outcome cannot supersede an unrelated row.' using errcode = '23514';
  end if;
  if latest_outcome_observed_at is not null and new.observed_at < latest_outcome_observed_at then
    raise exception 'A corrected pilot outcome cannot predate the outcome it supersedes.' using errcode = '23514';
  end if;
  if latest_outcome_evidence_status = 'VERIFIED' and new.evidence_status <> 'VERIFIED' then
    raise exception 'A VERIFIED pilot outcome cannot be downgraded or removed from the scored sample.' using errcode = '23514';
  end if;
  if new.observed_at not between pg_catalog.clock_timestamp() - interval '5 minutes'
      and pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'Pilot outcome append timestamp must be within five minutes of database time.' using errcode = '23514';
  end if;

  select trade.status, trade.direction into trade_status, trade_direction
  from public.trades as trade where trade.id = new.trade_id
  for update;
  if new.evidence_status = 'VERIFIED' and trade_status is distinct from 'COMPLETED' then
    raise exception 'Verified pilot outcomes require a completed trade.' using errcode = '23514';
  end if;

  select performance.trade_id, performance.r_multiple, performance.return_pct, performance.fees,
         performance.pyramid_compliant, performance.stop_raise_compliant,
         (coalesce(performance.pyramid_compliant, true) = false
           or coalesce(performance.stop_raise_compliant, true) = false
           or coalesce(performance.r_multiple, 0) <= -2)
    into performance_trade, performance_r, performance_return, performance_fees,
         performance_pyramid_compliant, performance_stop_raise_compliant, expected_risk_breach
  from public.trade_performance_records as performance
  where performance.id = new.performance_record_id;
  if performance_trade is distinct from new.trade_id then
    raise exception 'Pilot performance record belongs to another trade.' using errcode = '23514';
  end if;

  if new.evidence_status = 'VERIFIED' then
    if performance_r is null or performance_return is null or performance_fees is null
      or performance_pyramid_compliant is null or performance_stop_raise_compliant is null then
      raise exception 'Verified pilot outcomes require complete canonical return, cost, and risk evidence.' using errcode = '23514';
    end if;
    select sum(execution.price * execution.shares) / nullif(sum(execution.shares), 0), min(execution.executed_at)
      into weighted_entry, first_entry
    from public.trade_executions as execution
    where execution.trade_id = new.trade_id and execution.side = 'ENTRY';
    select max(execution.executed_at) into last_exit
    from public.trade_executions as execution
    where execution.trade_id = new.trade_id and execution.side = 'EXIT';
    select performance.entry_price into model_entry
    from public.recommendation_performance as performance
    where performance.pick_id = linked_pick and performance.horizon = 'D5';

    if weighted_entry is null or first_entry is null or last_exit is null or model_entry is null then
      raise exception 'Verified pilot outcomes require entry, exit, and D5 model-entry evidence.' using errcode = '23514';
    end if;
    if first_entry < linked_at or last_exit > new.observed_at then
      raise exception 'Verified pilot execution and observation timestamps must preserve prospective ordering.' using errcode = '23514';
    end if;

    select review.pilot_link_id, review.pick_id, review.trade_id, review.source_kind,
           review.artifact_hash, review.attestation_status, review.reviewed_at
      into review_link, review_pick, review_trade, review_source,
           review_artifact_hash, review_status, review_reviewed_at
    from public.recommendation_broker_evidence_reviews as review
    where review.id = new.broker_evidence_review_id;
    if review_link is distinct from new.pilot_link_id
      or review_pick is distinct from linked_pick
      or review_trade is distinct from new.trade_id
      or review_source is distinct from new.source_kind
      or review_artifact_hash is distinct from new.broker_evidence_hash
      or review_status is distinct from 'PASS'
      or review_reviewed_at < last_exit
      or review_reviewed_at > new.observed_at then
      raise exception 'Verified pilot outcomes require a matching independent PASS broker artifact review.' using errcode = '23514';
    end if;
    expected_slippage := ((weighted_entry - model_entry) / model_entry) * 100
      * case when trade_direction = 'SHORT' then -1 else 1 end;

    if abs(new.actual_entry_price - weighted_entry) > 0.000001
      or abs(new.modeled_entry_price - model_entry) > 0.000001
      or abs(new.adverse_slippage_pct - expected_slippage) > 0.000001
      or new.entry_at is distinct from first_entry
      or new.exit_at is distinct from last_exit
      or abs(new.r_multiple - performance_r) > 0.000001
      or abs(new.net_return_pct - performance_return) > 0.000001
      or abs(new.total_cost_amount - performance_fees) > 0.000001
      or new.risk_breach is distinct from expected_risk_breach then
      raise exception 'Verified pilot outcome does not match canonical trade execution and performance evidence.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger recommendation_pilot_outcome_validate
  before insert on public.recommendation_pilot_outcomes
  for each row execute function public.validate_recommendation_pilot_outcome();

create or replace function public.validate_assurance_control_evidence_append()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.observed_at not between pg_catalog.clock_timestamp() - interval '5 minutes'
      and pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'Assurance control append timestamp must be within five minutes of database time.' using errcode = '23514';
  end if;
  if new.payload_hash is distinct from public.assurance_stable_jsonb_hash(new.payload) then
    raise exception 'Assurance control payload hash does not match its content.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger assurance_control_evidence_validate
  before insert on public.assurance_control_evidence
  for each row execute function public.validate_assurance_control_evidence_append();

create or replace function public.validate_assurance_score_snapshot_append()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_identity jsonb;
begin
  if new.evaluated_at not between pg_catalog.clock_timestamp() - interval '5 minutes'
      and pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'Assurance score append timestamp must be within five minutes of database time.' using errcode = '23514';
  end if;
  if new.evidence_manifest_hash is distinct from public.assurance_stable_jsonb_hash(new.evidence_manifest) then
    raise exception 'Assurance score evidence manifest hash does not match its content.' using errcode = '23514';
  end if;
  snapshot_identity := pg_catalog.jsonb_build_object(
    'evaluationDay', pg_catalog.to_char(new.evaluated_at at time zone 'UTC', 'YYYY-MM-DD'),
    'policyVersion', new.policy_version,
    'evaluatorVersion', new.evaluator_version,
    'releaseSha', new.release_sha,
    'verifiedScore', new.investment_score + new.data_score + new.strategy_score + new.risk_score
      + new.software_score + new.operations_score + new.security_score + new.system_ui_score,
    'status', new.status,
    'domains', pg_catalog.jsonb_build_object(
      'investment', new.investment_score,
      'data', new.data_score,
      'strategy', new.strategy_score,
      'risk', new.risk_score,
      'software', new.software_score,
      'operations', new.operations_score,
      'security', new.security_score,
      'system_ui', new.system_ui_score
    ),
    'gates', pg_catalog.jsonb_build_object(
      'technical', new.technical_gate_passed,
      'longitudinal', new.longitudinal_gate_passed,
      'pilot', new.pilot_gate_passed,
      'operational', new.operational_gate_passed,
      'accessibility', new.accessibility_gate_passed,
      'duration24m', new.duration_24m_gate_passed,
      'longitudinal24m', new.longitudinal_24m_gate_passed,
      'recovery', new.recovery_gate_passed,
      'operations90d', new.operations_90d_gate_passed
    ),
    'evidenceManifestHash', new.evidence_manifest_hash
  );
  if new.snapshot_hash is distinct from public.assurance_stable_jsonb_hash(snapshot_identity) then
    raise exception 'Assurance score snapshot hash does not match its canonical identity.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger assurance_score_snapshot_validate
  before insert on public.assurance_score_snapshots
  for each row execute function public.validate_assurance_score_snapshot_append();

alter table public.recommendation_longitudinal_evaluations enable row level security;
alter table public.recommendation_decision_events enable row level security;
alter table public.recommendation_pilot_links enable row level security;
alter table public.recommendation_broker_evidence_reviews enable row level security;
alter table public.recommendation_pilot_outcomes enable row level security;
alter table public.assurance_control_evidence enable row level security;
alter table public.assurance_score_snapshots enable row level security;

revoke all on table public.recommendation_longitudinal_evaluations from public, anon, authenticated;
revoke all on table public.recommendation_decision_events from public, anon, authenticated;
revoke all on table public.recommendation_pilot_links from public, anon, authenticated;
revoke all on table public.recommendation_broker_evidence_reviews from public, anon, authenticated;
revoke all on table public.recommendation_pilot_outcomes from public, anon, authenticated;
revoke all on table public.assurance_control_evidence from public, anon, authenticated;
revoke all on table public.assurance_score_snapshots from public, anon, authenticated;

grant select, insert on table public.recommendation_longitudinal_evaluations to service_role;
grant select, insert on table public.recommendation_decision_events to service_role;
grant select, insert on table public.recommendation_pilot_links to service_role;
grant select, insert on table public.recommendation_broker_evidence_reviews to service_role;
grant select, insert on table public.recommendation_pilot_outcomes to service_role;
grant select, insert on table public.assurance_control_evidence to service_role;
grant select, insert on table public.assurance_score_snapshots to service_role;

create policy "Service role appends longitudinal recommendation evidence"
  on public.recommendation_longitudinal_evaluations for all to service_role using (true) with check (true);
create policy "Service role appends recommendation decisions"
  on public.recommendation_decision_events for all to service_role using (true) with check (true);
create policy "Service role appends recommendation pilot links"
  on public.recommendation_pilot_links for all to service_role using (true) with check (true);
create policy "Service role appends recommendation broker evidence reviews"
  on public.recommendation_broker_evidence_reviews for all to service_role using (true) with check (true);
create policy "Service role appends recommendation pilot outcomes"
  on public.recommendation_pilot_outcomes for all to service_role using (true) with check (true);
create policy "Service role appends assurance control evidence"
  on public.assurance_control_evidence for all to service_role using (true) with check (true);
create policy "Service role appends assurance score snapshots"
  on public.assurance_score_snapshots for all to service_role using (true) with check (true);

create trigger recommendation_longitudinal_evaluations_immutable
  before update or delete on public.recommendation_longitudinal_evaluations
  for each row execute function public.prevent_recommendation_evidence_mutation();
create trigger recommendation_decision_events_immutable
  before update or delete on public.recommendation_decision_events
  for each row execute function public.prevent_recommendation_evidence_mutation();
create trigger recommendation_pilot_links_immutable
  before update or delete on public.recommendation_pilot_links
  for each row execute function public.prevent_recommendation_evidence_mutation();
create trigger recommendation_broker_evidence_reviews_immutable
  before update or delete on public.recommendation_broker_evidence_reviews
  for each row execute function public.prevent_recommendation_evidence_mutation();
create trigger recommendation_pilot_outcomes_immutable
  before update or delete on public.recommendation_pilot_outcomes
  for each row execute function public.prevent_recommendation_evidence_mutation();
create trigger assurance_control_evidence_immutable
  before update or delete on public.assurance_control_evidence
  for each row execute function public.prevent_recommendation_evidence_mutation();
create trigger assurance_score_snapshots_immutable
  before update or delete on public.assurance_score_snapshots
  for each row execute function public.prevent_recommendation_evidence_mutation();

revoke all on function public.validate_recommendation_decision_event() from public, anon, authenticated;
revoke all on function public.validate_recommendation_publication_assurance_contract() from public, anon, authenticated;
revoke all on function public.validate_recommendation_longitudinal_evaluation_append() from public, anon, authenticated;
revoke all on function public.validate_recommendation_pilot_link() from public, anon, authenticated;
revoke all on function public.validate_recommendation_broker_evidence_review() from public, anon, authenticated;
revoke all on function public.validate_recommendation_pilot_outcome() from public, anon, authenticated;
revoke all on function public.validate_assurance_control_evidence_append() from public, anon, authenticated;
revoke all on function public.validate_assurance_score_snapshot_append() from public, anon, authenticated;
revoke all on function public.assurance_canonical_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.assurance_stable_jsonb_hash(jsonb) from public, anon, authenticated;
revoke all on function public.assurance_jsonb_object_key_count(jsonb) from public, anon, authenticated;

comment on table public.recommendation_longitudinal_evaluations is
  'Immutable 12/24-month official-only recommendation evidence. PASS requires positive cost-adjusted CI and precommitted tail gates.';
comment on column public.recommendation_publications.assurance_contract_hash is
  'Publication-time immutable hash of engine, prompt, LLM, strategy contract, and data contract. Legacy NULL rows never qualify for longitudinal assurance.';
comment on column public.recommendation_publications.assurance_contract is
  'Canonical publication-time assurance contract. Mutation and retrospective backfill are prohibited.';
comment on table public.recommendation_decision_events is
  'Append-only human accept/reject/watch/no-action decisions captured before outcome knowledge.';
comment on table public.recommendation_pilot_links is
  'Prospective ACCEPT-to-trade links constrained to PLANNED trades and at most 0.5R.';
comment on table public.recommendation_broker_evidence_reviews is
  'Immutable independent reviewer attestations that bind an opened broker artifact to one pilot pick and trade.';
comment on table public.recommendation_pilot_outcomes is
  'Immutable broker-backed account-actual execution outcomes; model evidence remains separate.';
comment on table public.assurance_control_evidence is
  'Content-addressed, expiring operational, recovery, CI, and accessibility evidence.';
comment on table public.assurance_score_snapshots is
  'Assessment-only 73/85/90 snapshots. Even a 90 snapshot cannot authorize capital or automatic trading.';
comment on column public.assurance_score_snapshots.capital_authorized is
  'Hard-coded false: the score only permits human review and never grants capital approval.';
