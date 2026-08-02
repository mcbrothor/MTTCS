-- US AI/FOMO risk barometer v1.
-- Deterministic research-only model. All writes remain service-role only.

alter table public.stock_metrics
  add column if not exists close_price numeric(24, 8),
  add column if not exists above_200d boolean;

create table if not exists public.risk_barometer_indicator_observations (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'US'
    check (market = 'US'),
  calc_date date not null,
  indicator_key text not null
    check (indicator_key in (
      'sp500_concentration',
      'household_equity_exposure',
      'margin_debt',
      'market_participation',
      'valuation_driven_returns',
      'hyperscaler_fcf',
      'hyperscaler_leverage',
      'corporate_cross_holdings',
      'capital_market_frenzy',
      'equity_risk_premium'
    )),
  observation_kind text not null default 'SNAPSHOT'
    check (observation_kind in ('SOURCE', 'SNAPSHOT')),
  value numeric(30, 8),
  display_value text,
  unit text not null
    check (char_length(unit) between 1 and 40),
  threshold text not null
    check (char_length(threshold) between 1 and 160),
  status text not null
    check (status in ('SAFE', 'TRIGGERED', 'UNKNOWN')),
  contribution numeric(4, 2) not null default 0
    check (contribution in (0, 1)),
  method text not null
    check (method in ('DIRECT', 'PROXY', 'MANUAL')),
  provider text not null
    check (char_length(provider) between 1 and 120),
  source_url text not null
    check (char_length(source_url) between 8 and 2048 and source_url ~ '^https://'),
  observed_at timestamptz not null,
  freshness_seconds integer not null
    check (freshness_seconds > 0),
  is_stale boolean not null default false,
  model_version text not null
    check (char_length(model_version) between 1 and 120),
  approved_by uuid,
  approved_at timestamptz,
  source_excerpt text
    check (source_excerpt is null or char_length(source_excerpt) <= 600),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_barometer_observation_idempotency_key
    unique (market, calc_date, indicator_key, observation_kind, model_version)
);

create index if not exists risk_barometer_observations_lookup_idx
  on public.risk_barometer_indicator_observations
    (market, indicator_key, observation_kind, observed_at desc);

create table if not exists public.risk_barometer_snapshots (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'US'
    check (market = 'US'),
  calc_date date not null,
  score numeric(4, 1)
    check (score is null or (score >= 0 and score <= 10)),
  raw_score integer not null
    check (raw_score between 0 and 10),
  band text not null
    check (band in ('LOW', 'CAUTION', 'HIGH', 'UNAVAILABLE')),
  quality text not null
    check (quality in ('VALID', 'DEGRADED', 'BLOCKED')),
  coverage integer not null
    check (coverage between 0 and 10),
  total_indicators integer not null default 10
    check (total_indicators = 10),
  model_version text not null
    check (char_length(model_version) between 1 and 120),
  input_hash text not null
    check (input_hash ~ '^[0-9a-f]{64}$'),
  indicators jsonb not null
    check (jsonb_typeof(indicators) = 'array'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_barometer_snapshot_idempotency_key
    unique (market, calc_date, model_version, input_hash)
);

create index if not exists risk_barometer_snapshots_latest_idx
  on public.risk_barometer_snapshots
    (market, calc_date desc, created_at desc);

create or replace function public.get_us_breadth_series(p_limit integer default 30)
returns table (
  calc_date date,
  total_count bigint,
  above_count bigint,
  breadth_pct numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    sm.calc_date,
    count(*)::bigint as total_count,
    count(*) filter (where sm.above_200d is true)::bigint as above_count,
    round(
      100.0 * count(*) filter (where sm.above_200d is true) / nullif(count(*), 0),
      4
    ) as breadth_pct
  from public.stock_metrics sm
  where sm.market = 'US'
    and sm.above_200d is not null
  group by sm.calc_date
  order by sm.calc_date desc
  limit greatest(1, least(p_limit, 60));
$$;

revoke all on function public.get_us_breadth_series(integer) from public, anon, authenticated;
grant execute on function public.get_us_breadth_series(integer) to service_role;

alter table public.risk_barometer_indicator_observations enable row level security;
alter table public.risk_barometer_snapshots enable row level security;

revoke all on table public.risk_barometer_indicator_observations from anon, authenticated;
revoke all on table public.risk_barometer_snapshots from anon, authenticated;

grant select on table public.risk_barometer_indicator_observations to authenticated;
grant select on table public.risk_barometer_snapshots to authenticated;
grant select, insert, update, delete on table public.risk_barometer_indicator_observations to service_role;
grant select, insert, update, delete on table public.risk_barometer_snapshots to service_role;

drop policy if exists "Authenticated users read risk barometer observations"
  on public.risk_barometer_indicator_observations;
create policy "Authenticated users read risk barometer observations"
  on public.risk_barometer_indicator_observations
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "Authenticated users read risk barometer snapshots"
  on public.risk_barometer_snapshots;
create policy "Authenticated users read risk barometer snapshots"
  on public.risk_barometer_snapshots
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "Service role manages risk barometer observations"
  on public.risk_barometer_indicator_observations;
create policy "Service role manages risk barometer observations"
  on public.risk_barometer_indicator_observations
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role manages risk barometer snapshots"
  on public.risk_barometer_snapshots;
create policy "Service role manages risk barometer snapshots"
  on public.risk_barometer_snapshots
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.model_versions (model_key, version, status, parameters)
values (
  'ai-fomo-us',
  'ai-fomo-us-2026.07-v1',
  'RESEARCH_ONLY',
  '{
    "market": "US",
    "score_direction": "higher_is_riskier",
    "minimum_coverage": 8,
    "bands": {"low_lt": 3, "high_gte": 7},
    "shadow_trading_days": 20,
    "auto_order": false
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
