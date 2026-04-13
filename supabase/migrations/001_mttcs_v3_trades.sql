alter table public.trades
  add column if not exists chk_sepa boolean,
  add column if not exists sepa_evidence jsonb,
  add column if not exists risk_percent numeric default 0.03,
  add column if not exists total_shares integer,
  add column if not exists entry_targets jsonb,
  add column if not exists trailing_stops jsonb;

update public.trades
set chk_sepa = coalesce(chk_sepa, chk_market)
where chk_sepa is null;

create index if not exists trades_status_created_at_idx
  on public.trades (status, created_at desc);

create index if not exists trades_ticker_status_created_at_idx
  on public.trades (ticker, status, created_at desc);
