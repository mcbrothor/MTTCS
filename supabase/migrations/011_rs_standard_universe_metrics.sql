-- Standard-universe RS metrics and macro trend snapshots.
-- RS values are precomputed by /api/cron/rs-metrics and then read by scanner runtime.

create table if not exists public.stock_metrics (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  market text not null check (market in ('KR', 'US')),
  calc_date date not null,
  ibd_proxy_score numeric(14, 8),
  rs_rating integer check (rs_rating between 1 and 99),
  rs_rank integer,
  rs_universe_size integer,
  mansfield_rs_flag boolean,
  mansfield_rs_score numeric(12, 4),
  data_quality text not null default 'NA' check (data_quality in ('FULL', 'PARTIAL', 'NA')),
  price_source text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticker, market, calc_date)
);

create index if not exists idx_stock_metrics_market_date_rating
  on public.stock_metrics (market, calc_date desc, rs_rating desc nulls last);

create index if not exists idx_stock_metrics_ticker_market_date
  on public.stock_metrics (ticker, market, calc_date desc);

create table if not exists public.macro_trend (
  id uuid primary key default gen_random_uuid(),
  index_code text not null,
  market text not null check (market in ('KR', 'US')),
  calc_date date not null,
  index_price numeric(14, 4),
  ma_50 numeric(14, 4),
  ma_200 numeric(14, 4),
  is_uptrend_50 boolean,
  is_uptrend_200 boolean,
  action_level text not null default 'HALT' check (action_level in ('FULL', 'REDUCED', 'HALT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (index_code, calc_date)
);

create index if not exists idx_macro_trend_market_date
  on public.macro_trend (market, calc_date desc, index_code);

alter table public.stock_metrics enable row level security;
alter table public.macro_trend enable row level security;

revoke all on table public.stock_metrics from anon;
revoke all on table public.macro_trend from anon;

drop policy if exists "Authenticated read stock metrics" on public.stock_metrics;
create policy "Authenticated read stock metrics" on public.stock_metrics
  for select to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists "Service role full access" on public.stock_metrics;
create policy "Service role full access" on public.stock_metrics
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Authenticated read macro trend" on public.macro_trend;
create policy "Authenticated read macro trend" on public.macro_trend
  for select to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists "Service role full access" on public.macro_trend;
create policy "Service role full access" on public.macro_trend
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    drop trigger if exists trg_stock_metrics_updated_at on public.stock_metrics;
    create trigger trg_stock_metrics_updated_at
      before update on public.stock_metrics
      for each row execute function public.update_updated_at_column();

    drop trigger if exists trg_macro_trend_updated_at on public.macro_trend;
    create trigger trg_macro_trend_updated_at
      before update on public.macro_trend
      for each row execute function public.update_updated_at_column();
  end if;
end
$$;
