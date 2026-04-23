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
