create table public.kr_investor_flow_daily (
  ticker text not null check (ticker ~ '^[0-9]{6}$'),
  trade_date date not null,
  foreign_net_buy_qty bigint not null,
  institution_net_buy_qty bigint not null,
  foreign_net_buy_amount_mkrw numeric not null,
  institution_net_buy_amount_mkrw numeric not null,
  turnover_amount_mkrw numeric not null check (turnover_amount_mkrw >= 0),
  provider text not null,
  quality text not null check (quality in ('FULL', 'STALE')),
  observed_at timestamptz not null,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ticker, trade_date, provider)
);
create index kr_investor_flow_daily_trade_date_idx
  on public.kr_investor_flow_daily (trade_date desc, ticker);
alter table public.kr_investor_flow_daily enable row level security;
revoke all on table public.kr_investor_flow_daily from anon, authenticated;
grant select, insert, update, delete on table public.kr_investor_flow_daily to service_role;
create policy "Service role full access kr_investor_flow_daily"
  on public.kr_investor_flow_daily
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
