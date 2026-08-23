-- KOSPI 52주 신고가 전략 스냅샷 (독립 탭 A안)
create table if not exists public.kospi52w_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of date not null,
  holdings text[] not null default '{}',
  cash_slots int not null default 0,
  buy_tickers text[] not null default '{}',
  sell_tickers text[] not null default '{}',
  rs_rank jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(as_of)
);
create index if not exists kospi52w_snapshots_asof_idx on public.kospi52w_snapshots (as_of desc);
alter table public.kospi52w_snapshots enable row level security;
revoke all on table public.kospi52w_snapshots from public, anon, authenticated;
grant select, insert on table public.kospi52w_snapshots to service_role;
grant select on table public.kospi52w_snapshots to authenticated;
drop policy if exists "service manages kospi52w" on public.kospi52w_snapshots;
create policy "service manages kospi52w" on public.kospi52w_snapshots for all to service_role using (true) with check (true);
drop policy if exists "authenticated reads kospi52w" on public.kospi52w_snapshots;
create policy "authenticated reads kospi52w" on public.kospi52w_snapshots for select to authenticated using (true);
comment on table public.kospi52w_snapshots is 'KOSPI 52주 신고가 전략 일별 스냅샷: RS Top12∩52w → 4×25% MA10 drift';
