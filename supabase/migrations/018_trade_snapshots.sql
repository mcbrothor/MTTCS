alter table public.trades
  add column if not exists entry_snapshot jsonb,
  add column if not exists contest_snapshot jsonb,
  add column if not exists llm_verdict jsonb;

create index if not exists trades_entry_snapshot_gin
  on public.trades using gin (entry_snapshot);

create index if not exists trades_contest_snapshot_gin
  on public.trades using gin (contest_snapshot);

create index if not exists trades_llm_verdict_gin
  on public.trades using gin (llm_verdict);

-- 보안 취약 정책 클리닝
DROP POLICY IF EXISTS "Public full access for links" ON public.investment_resources;
DROP POLICY IF EXISTS "Allow insert/update on fundamental_cache" ON public.fundamental_cache;
DROP POLICY IF EXISTS "Admin can manage all trades" ON public.trades;
DROP POLICY IF EXISTS "Admin can manage all watchlist" ON public.watchlist;
