-- Immutable, fail-closed recommendation evidence and cost-adjusted promotion snapshots.

create table if not exists public.recommendation_evidence_manifests (
  id uuid primary key default gen_random_uuid(),
  manifest_hash text not null unique check (manifest_hash ~ '^[a-f0-9]{64}$'),
  pick_id uuid not null references public.recommendation_picks(id) on delete restrict,
  horizon text not null check (horizon in ('LIVE', 'D5', 'D20', 'D60')),
  calculation_status text not null check (calculation_status in ('PENDING', 'MATURED', 'EXCLUDED', 'ERROR')),
  calculation_result jsonb not null,
  engine_id text,
  strategy_id text not null,
  prompt_id text,
  data_manifest_id text not null check (data_manifest_id ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  data_payload jsonb not null,
  cost_model_version text not null,
  statistics_version text not null,
  evidence_status text not null check (evidence_status in ('READY', 'INCOMPLETE')),
  missing_fields text[] not null default '{}',
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  constraint recommendation_evidence_payload_identity_check check (data_manifest_id = payload_hash),
  constraint recommendation_evidence_manifest_ready_check check (
    evidence_status <> 'READY'
    or (
      horizon in ('D5', 'D20', 'D60')
      and calculation_status = 'MATURED'
      and engine_id is not null
      and prompt_id is not null
      and data_manifest_id is not null
      and cardinality(missing_fields) = 0
    )
  )
);

create index if not exists recommendation_evidence_manifests_pick_horizon_idx
  on public.recommendation_evidence_manifests (pick_id, horizon, created_at desc);

alter table public.recommendation_performance
  add column if not exists net_return_pct numeric,
  add column if not exists net_excess_return_pct numeric,
  add column if not exists total_cost_pct numeric,
  add column if not exists commission_cost_pct numeric,
  add column if not exists tax_cost_pct numeric,
  add column if not exists slippage_cost_pct numeric,
  add column if not exists fx_cost_pct numeric,
  add column if not exists cost_model_version text,
  add column if not exists cost_evidence_status text not null default 'MISSING',
  add column if not exists account_evidence_status text not null default 'NOT_AVAILABLE',
  add column if not exists data_evidence_tier text not null default 'INCOMPLETE',
  add column if not exists evidence_status text not null default 'INCOMPLETE',
  add column if not exists evidence_manifest_id uuid references public.recommendation_evidence_manifests(id) on delete restrict,
  add column if not exists market_regime text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recommendation_performance_cost_nonnegative_check') then
    alter table public.recommendation_performance add constraint recommendation_performance_cost_nonnegative_check check (
      (total_cost_pct is null or total_cost_pct >= 0)
      and (commission_cost_pct is null or commission_cost_pct >= 0)
      and (tax_cost_pct is null or tax_cost_pct >= 0)
      and (slippage_cost_pct is null or slippage_cost_pct >= 0)
      and (fx_cost_pct is null or fx_cost_pct >= 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recommendation_performance_cost_evidence_check') then
    alter table public.recommendation_performance add constraint recommendation_performance_cost_evidence_check
      check (cost_evidence_status in ('STANDARDIZED_MODEL', 'ACCOUNT_ACTUAL', 'MISSING'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recommendation_performance_account_evidence_check') then
    alter table public.recommendation_performance add constraint recommendation_performance_account_evidence_check
      check (account_evidence_status in ('NOT_AVAILABLE', 'ACCOUNT_ACTUAL', 'MISSING'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recommendation_performance_data_evidence_tier_check') then
    alter table public.recommendation_performance add constraint recommendation_performance_data_evidence_tier_check
      check (data_evidence_tier in ('OFFICIAL', 'FALLBACK', 'INCOMPLETE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recommendation_performance_evidence_status_check') then
    alter table public.recommendation_performance add constraint recommendation_performance_evidence_status_check
      check (evidence_status in ('READY', 'INCOMPLETE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recommendation_performance_market_regime_check') then
    alter table public.recommendation_performance add constraint recommendation_performance_market_regime_check
      check (market_regime is null or market_regime in ('GREEN', 'YELLOW', 'RED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recommendation_performance_ready_evidence_check') then
    alter table public.recommendation_performance add constraint recommendation_performance_ready_evidence_check check (
      evidence_status <> 'READY'
      or (
        horizon in ('D5', 'D20', 'D60')
        and status = 'MATURED'
        and evidence_manifest_id is not null
        and data_evidence_tier in ('OFFICIAL', 'FALLBACK')
        and market_regime is not null
        and cost_evidence_status in ('STANDARDIZED_MODEL', 'ACCOUNT_ACTUAL')
        and net_return_pct is not null
        and net_excess_return_pct is not null
        and mae_pct is not null
      )
    );
  end if;
end $$;

create index if not exists recommendation_performance_evidence_idx
  on public.recommendation_performance (horizon, data_evidence_tier, evidence_status, evaluation_date desc);

create table if not exists public.recommendation_evidence_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_hash text not null unique check (evaluation_hash ~ '^[a-f0-9]{64}$'),
  market text not null check (market in ('US', 'KR')),
  category text check (category is null or category in ('NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150')),
  horizon text not null check (horizon in ('D5', 'D20', 'D60')),
  engine_version text not null,
  data_scope text not null check (data_scope = 'OFFICIAL_GATE_WITH_FALLBACK_DIAGNOSTIC'),
  manifest_set_hash text not null check (manifest_set_hash ~ '^[a-f0-9]{64}$'),
  cost_model_version text not null,
  statistics_version text not null,
  promotion_policy_version text not null,
  sample_size integer not null check (sample_size >= 0),
  cohort_count integer not null check (cohort_count >= 0),
  market_regime_count integer not null check (market_regime_count >= 0),
  mean_net_return_pct numeric,
  mean_net_excess_return_pct numeric,
  excess_ci95_lower numeric,
  excess_ci95_upper numeric,
  average_mae_pct numeric,
  lower_decile_net_return_pct numeric,
  evidence_status text not null check (evidence_status in ('READY', 'INSUFFICIENT', 'INCOMPLETE')),
  account_evidence_status text not null check (account_evidence_status in ('NOT_AVAILABLE', 'ACCOUNT_ACTUAL', 'MISSING')),
  statistics jsonb not null,
  promotion_gate jsonb not null,
  evaluated_at timestamptz not null default now(),
  constraint recommendation_evidence_promotion_fail_closed_check check (
    coalesce(promotion_gate ->> 'status', 'BLOCKED') <> 'PASS'
    or (
      evidence_status = 'READY'
      and data_scope = 'OFFICIAL_GATE_WITH_FALLBACK_DIAGNOSTIC'
      and excess_ci95_lower > 0
      and sample_size >= 100
      and cohort_count >= 20
      and market_regime_count >= 2
    )
  )
);

create index if not exists recommendation_evidence_evaluations_latest_idx
  on public.recommendation_evidence_evaluations (market, category, engine_version, horizon, evaluated_at desc);

create or replace function public.prevent_recommendation_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Recommendation evidence rows are immutable; append a new snapshot instead.'
    using errcode = '55000';
end;
$$;

create trigger recommendation_evidence_manifests_immutable
  before update or delete on public.recommendation_evidence_manifests
  for each row execute function public.prevent_recommendation_evidence_mutation();

create trigger recommendation_evidence_evaluations_immutable
  before update or delete on public.recommendation_evidence_evaluations
  for each row execute function public.prevent_recommendation_evidence_mutation();

alter table public.recommendation_evidence_manifests enable row level security;
alter table public.recommendation_evidence_evaluations enable row level security;

revoke all on table public.recommendation_evidence_manifests from public, anon, authenticated;
revoke all on table public.recommendation_evidence_evaluations from public, anon, authenticated;

grant select, insert on table public.recommendation_evidence_manifests to service_role;
grant select, insert on table public.recommendation_evidence_evaluations to service_role;

create policy "Service role reads recommendation evidence manifests"
  on public.recommendation_evidence_manifests for select to service_role using (true);
create policy "Service role appends recommendation evidence manifests"
  on public.recommendation_evidence_manifests for insert to service_role with check (true);
create policy "Service role reads recommendation evidence evaluations"
  on public.recommendation_evidence_evaluations for select to service_role using (true);
create policy "Service role appends recommendation evidence evaluations"
  on public.recommendation_evidence_evaluations for insert to service_role with check (true);

comment on table public.recommendation_evidence_manifests is
  'Immutable pick-horizon calculation identity plus canonical content-addressed entry-to-evaluation price payload.';
comment on table public.recommendation_evidence_evaluations is
  'Immutable D5, D20, and D60 cohort-bootstrap evidence snapshots; fallback samples remain diagnostic only.';
comment on column public.recommendation_performance.account_evidence_status is
  'Explicitly reports whether actual account fills, taxes, and FX costs exist; standardized modeled costs never imply account actuals.';
