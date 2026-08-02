-- Nasdaq-100 core/leverage research strategy v1.
-- MTN sessions are application-owned; all table access stays server-side.

create table if not exists public.nasdaq_strategy_settings (
  owner_id uuid primary key,
  tactical_product text not null default 'QLD'
    check (tactical_product in ('QLD', 'TQQQ')),
  base_currency text not null default 'KRW'
    check (base_currency in ('KRW', 'USD')),
  external_nasdaq_value numeric(24, 4) not null default 0
    check (external_nasdaq_value >= 0),
  tqqq_opt_in boolean not null default false,
  risk_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nasdaq_product_metadata (
  product text primary key
    check (product in ('QQQ', 'QLD', 'TQQQ')),
  leverage_multiple integer not null
    check (leverage_multiple in (1, 2, 3)),
  gross_expense_ratio_pct numeric(8, 4) not null
    check (gross_expense_ratio_pct >= 0),
  net_expense_ratio_pct numeric(8, 4) not null
    check (net_expense_ratio_pct >= 0),
  effective_date date not null,
  review_after date not null,
  source_url text not null
    check (char_length(source_url) between 8 and 2048 and source_url ~ '^https://'),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.nasdaq_product_metadata (
  product,
  leverage_multiple,
  gross_expense_ratio_pct,
  net_expense_ratio_pct,
  effective_date,
  review_after,
  source_url
)
values
  (
    'QQQ', 1, 0.18, 0.18, '2026-07-27', '2027-01-31',
    'https://www.invesco.com/qqq-etf/en/market-outlook/whats-new-about-qqq.html'
  ),
  (
    'QLD', 2, 0.98, 0.95, '2026-07-27', '2027-01-31',
    'https://www.proshares.com/our-etfs/leveraged-and-inverse/qld'
  ),
  (
    'TQQQ', 3, 0.97, 0.82, '2026-07-27', '2026-09-30',
    'https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq'
  )
on conflict (product) do nothing;

create table if not exists public.nasdaq_strategy_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  as_of_date date not null,
  tactical_product text not null
    check (tactical_product in ('QLD', 'TQQQ')),
  model_version text not null default 'nasdaq-core-leverage-2026.07-v1'
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
  constraint nasdaq_strategy_snapshots_idempotency_key
    unique (owner_id, as_of_date, model_version, input_hash)
);

create index if not exists nasdaq_strategy_snapshots_owner_latest_idx
  on public.nasdaq_strategy_snapshots (owner_id, as_of_date desc, created_at desc);

alter table public.nasdaq_strategy_settings enable row level security;
alter table public.nasdaq_product_metadata enable row level security;
alter table public.nasdaq_strategy_snapshots enable row level security;

revoke all on table public.nasdaq_strategy_settings from anon, authenticated;
revoke all on table public.nasdaq_product_metadata from anon, authenticated;
revoke all on table public.nasdaq_strategy_snapshots from anon, authenticated;

grant select, insert, update, delete on table public.nasdaq_strategy_settings to service_role;
grant select, insert, update, delete on table public.nasdaq_product_metadata to service_role;
grant select, insert, update, delete on table public.nasdaq_strategy_snapshots to service_role;

drop policy if exists "Service role manages nasdaq strategy settings"
  on public.nasdaq_strategy_settings;
create policy "Service role manages nasdaq strategy settings"
  on public.nasdaq_strategy_settings
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role manages nasdaq product metadata"
  on public.nasdaq_product_metadata;
create policy "Service role manages nasdaq product metadata"
  on public.nasdaq_product_metadata
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role manages nasdaq strategy snapshots"
  on public.nasdaq_strategy_snapshots;
create policy "Service role manages nasdaq strategy snapshots"
  on public.nasdaq_strategy_snapshots
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.model_versions (model_key, version, status, parameters)
values (
  'nasdaq-core-leverage',
  'nasdaq-core-leverage-2026.07-v1',
  'RESEARCH_ONLY',
  '{
    "decision_engine": "deterministic",
    "llm_decision": false,
    "max_capital_weight": 0.20,
    "max_effective_exposure": 0.30,
    "qqq_core_weight": 0.10,
    "qld_max_capital_weight": 0.05,
    "tqqq_max_capital_weight": 0.03333333,
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
