-- Gold core/tactical strategy v1.
-- MTN authenticates with its own signed session, so owner_id is intentionally
-- not linked to auth.users. All access is server-side through service_role and
-- application repositories must scope every query by owner_id.

create table if not exists public.gold_strategy_settings (
  owner_id uuid primary key,
  core_product text not null default '411060'
    check (core_product in ('GLD', '411060', '132030')),
  tactical_product text not null default '132030'
    check (tactical_product in ('GLD', '411060', '132030')),
  base_currency text not null default 'KRW'
    check (base_currency in ('KRW', 'USD')),
  external_gold_value numeric(24, 4) not null default 0
    check (external_gold_value >= 0),
  physical_gold_value numeric(24, 4) not null default 0
    check (physical_gold_value >= 0),
  execution_levels jsonb not null default '{}'::jsonb
    check (jsonb_typeof(execution_levels) = 'object'),
  reference_scenario jsonb not null default
    '{
      "instrument": "XAU/USD",
      "as_of": "2026-07-24",
      "support": [3950, 4000],
      "resistance": [4165, 4185],
      "upside_target": 4500,
      "tactical_wait_until": "2026-07-30",
      "expires_at": "2026-07-31T00:00:00Z",
      "active_signal": false,
      "note": "Reference only; never convert these levels to GLD or Korean ETF prices."
    }'::jsonb
    check (jsonb_typeof(reference_scenario) = 'object'),
  risk_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gold_macro_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  observation_month date not null
    check (extract(day from observation_month) = 1),
  etf_net_flow_usd numeric(24, 2) not null,
  holdings_change_tonnes numeric(18, 3),
  etf_flow_direction text generated always as (
    case
      when etf_net_flow_usd > 0 then 'INFLOW'
      when etf_net_flow_usd < 0 then 'OUTFLOW'
      else 'FLAT'
    end
  ) stored,
  central_bank_demand_status text not null default 'UNKNOWN'
    check (central_bank_demand_status in ('STRENGTHENING', 'STABLE', 'WEAKENING', 'UNKNOWN')),
  source_url text not null
    check (char_length(source_url) between 8 and 2048 and source_url ~ '^https://'),
  source_excerpt text
    check (source_excerpt is null or char_length(source_excerpt) <= 600),
  central_bank_source_url text
    check (
      central_bank_source_url is null
      or (
        char_length(central_bank_source_url) between 8 and 2048
        and central_bank_source_url ~ '^https://'
      )
    ),
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gold_macro_observations_owner_month_key
    unique (owner_id, observation_month)
);

create index if not exists gold_macro_observations_owner_latest_idx
  on public.gold_macro_observations (owner_id, observation_month desc);

create table if not exists public.gold_strategy_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  as_of_date date not null,
  core_product text not null
    check (core_product in ('GLD', '411060', '132030')),
  tactical_product text not null
    check (tactical_product in ('GLD', '411060', '132030')),
  model_version text not null default 'gold-core-tactical-2026.07-v1'
    check (char_length(model_version) between 1 and 120),
  data_quality text not null
    check (data_quality in ('READY', 'DEGRADED', 'BLOCKED')),
  inputs jsonb not null
    check (jsonb_typeof(inputs) = 'object'),
  result jsonb not null
    check (jsonb_typeof(result) = 'object'),
  input_hash text not null
    check (input_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gold_strategy_snapshots_idempotency_key
    unique (owner_id, as_of_date, core_product, tactical_product, input_hash)
);

create index if not exists gold_strategy_snapshots_owner_latest_idx
  on public.gold_strategy_snapshots (owner_id, as_of_date desc, created_at desc);

alter table public.gold_strategy_settings enable row level security;
alter table public.gold_macro_observations enable row level security;
alter table public.gold_strategy_snapshots enable row level security;

revoke all on table public.gold_strategy_settings from anon, authenticated;
revoke all on table public.gold_macro_observations from anon, authenticated;
revoke all on table public.gold_strategy_snapshots from anon, authenticated;

grant select, insert, update, delete on table public.gold_strategy_settings to service_role;
grant select, insert, update, delete on table public.gold_macro_observations to service_role;
grant select, insert, update, delete on table public.gold_strategy_snapshots to service_role;

drop policy if exists "Service role manages gold strategy settings"
  on public.gold_strategy_settings;
create policy "Service role manages gold strategy settings"
  on public.gold_strategy_settings
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role manages gold macro observations"
  on public.gold_macro_observations;
create policy "Service role manages gold macro observations"
  on public.gold_macro_observations
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role manages gold strategy snapshots"
  on public.gold_strategy_snapshots;
create policy "Service role manages gold strategy snapshots"
  on public.gold_strategy_snapshots
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.model_versions (model_key, version, status, parameters)
values (
  'gold-core-tactical',
  'gold-core-tactical-2026.07-v1',
  'RESEARCH_ONLY',
  '{
    "decision_engine": "deterministic",
    "llm_decision": false,
    "max_gold_weight": 0.10,
    "core_weight": 0.04,
    "max_tactical_weight": 0.06,
    "risk_per_trade": 0.005,
    "leverage_enabled": false
  }'::jsonb
)
on conflict (model_key, version) do update
set
  status = case
    when public.model_versions.status in ('APPROVED', 'RETIRED')
      then public.model_versions.status
    else excluded.status
  end,
  parameters = excluded.parameters;
