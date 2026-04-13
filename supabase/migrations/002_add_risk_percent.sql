alter table public.trades
  add column if not exists risk_percent numeric default 0.03;

update public.trades
set risk_percent = 0.03
where risk_percent is null;
