-- Market state history snapshots for 30-day sparkline and trend analysis.
-- master_filter_snapshot: daily P3 score + component scores per market
-- macro_snapshot: daily macro P-score + regime per market

create table if not exists public.master_filter_snapshot (
  calc_date date not null,
  market text not null check (market in ('KR', 'US')),
  p3_score integer not null,
  state text not null check (state in ('GREEN', 'YELLOW', 'RED')),
  trend_score numeric(6, 2),
  breadth_score numeric(6, 2),
  volatility_score numeric(6, 2),
  liquidity_score numeric(6, 2),
  ftd_score integer,
  distribution_score integer,
  nhnl_score integer,
  above200_score integer,
  sector_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (calc_date, market)
);

create index if not exists idx_master_filter_snapshot_market_date
  on public.master_filter_snapshot (market, calc_date desc);

create table if not exists public.macro_snapshot (
  calc_date date not null,
  macro_score integer not null,
  regime text not null check (regime in ('RISK_ON', 'RISK_OFF', 'NEUTRAL')),
  spy_above_50ma boolean,
  hyg_ief_diff numeric(8, 4),
  vix_level numeric(8, 4),
  trend_score numeric(6, 2),
  credit_score numeric(6, 2),
  volatility_score numeric(6, 2),
  dollar_rate_score numeric(6, 2),
  econ_sensitivity_score numeric(6, 2),
  breadth_score numeric(6, 2),
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (calc_date)
);

create index if not exists idx_macro_snapshot_date
  on public.macro_snapshot (calc_date desc);

alter table public.master_filter_snapshot enable row level security;
alter table public.macro_snapshot enable row level security;

revoke all on table public.master_filter_snapshot from anon;
revoke all on table public.macro_snapshot from anon;

drop policy if exists "Authenticated read master filter snapshot" on public.master_filter_snapshot;
create policy "Authenticated read master filter snapshot" on public.master_filter_snapshot
  for select to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists "Service role full access master filter snapshot" on public.master_filter_snapshot;
create policy "Service role full access master filter snapshot" on public.master_filter_snapshot
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Authenticated read macro snapshot" on public.macro_snapshot;
create policy "Authenticated read macro snapshot" on public.macro_snapshot
  for select to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists "Service role full access macro snapshot" on public.macro_snapshot;
create policy "Service role full access macro snapshot" on public.macro_snapshot
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    drop trigger if exists trg_master_filter_snapshot_updated_at on public.master_filter_snapshot;
    create trigger trg_master_filter_snapshot_updated_at
      before update on public.master_filter_snapshot
      for each row execute function public.update_updated_at_column();

    drop trigger if exists trg_macro_snapshot_updated_at on public.macro_snapshot;
    create trigger trg_macro_snapshot_updated_at
      before update on public.macro_snapshot
      for each row execute function public.update_updated_at_column();
  end if;
end
$$;
