create table if not exists public.trade_performance_records (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  market text not null check (market in ('US', 'KR')),
  ticker text not null,
  completed_at timestamptz not null,
  entry_value numeric not null default 0,
  exit_value numeric not null default 0,
  fees numeric not null default 0,
  realized_pnl numeric not null default 0,
  r_multiple numeric,
  return_pct numeric,
  pyramid_compliant boolean,
  stop_raise_compliant boolean,
  performance_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trade_id)
);

create index if not exists trade_performance_records_market_completed_idx
  on public.trade_performance_records (market, completed_at desc);

alter table public.trade_performance_records enable row level security;

grant select on table public.trade_performance_records to authenticated;
grant all on table public.trade_performance_records to service_role;

drop policy if exists "Service role full access" on public.trade_performance_records;
create policy "Service role full access" on public.trade_performance_records
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
