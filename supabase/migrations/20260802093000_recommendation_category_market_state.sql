-- Recommendation allocation needs a state derived from the same benchmark as each category.
-- Keep this separate from the legacy US/KR master-filter table to preserve existing consumers.

create table if not exists public.recommendation_category_market_state (
  calc_date date not null,
  category text not null check (category in ('NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150')),
  market text not null check (market in ('US', 'KR')),
  benchmark_symbol text not null,
  source_symbol text not null,
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
  primary key (calc_date, category)
);

create index if not exists recommendation_category_market_state_category_date_idx
  on public.recommendation_category_market_state (category, calc_date desc);

alter table public.recommendation_category_market_state enable row level security;
revoke all on table public.recommendation_category_market_state from anon, authenticated;
grant select on table public.recommendation_category_market_state to authenticated;
grant select, insert, update, delete on table public.recommendation_category_market_state to service_role;

drop policy if exists "Authenticated read recommendation category market state"
  on public.recommendation_category_market_state;
create policy "Authenticated read recommendation category market state"
  on public.recommendation_category_market_state
  for select to authenticated
  using (true);

drop policy if exists "Service role full access recommendation category market state"
  on public.recommendation_category_market_state;
create policy "Service role full access recommendation category market state"
  on public.recommendation_category_market_state
  for all to service_role
  using (true)
  with check (true);

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    drop trigger if exists trg_recommendation_category_market_state_updated_at
      on public.recommendation_category_market_state;
    create trigger trg_recommendation_category_market_state_updated_at
      before update on public.recommendation_category_market_state
      for each row execute function public.update_updated_at_column();
  end if;
end
$$;

comment on table public.recommendation_category_market_state is
  'Category-benchmark-aligned market states used to gate recommendation activation.';
