-- Keep the always-on local workers cheap enough for Nano compute.
-- Partial indexes only cover the small set of rows each worker can claim.

create index if not exists daily_screener_runs_stale_processing_idx
  on public.daily_screener_runs (updated_at, run_date)
  include (id)
  where status = 'processing';

create index if not exists recommendation_publications_telegram_outbox_idx
  on public.recommendation_publications (run_date desc, category, updated_at)
  include (id, screener_run_id)
  where is_official = true
    and status = 'PUBLISHED'
    and telegram_status in ('PENDING', 'FAILED');

create index if not exists recommendation_publications_screener_run_idx
  on public.recommendation_publications (screener_run_id);

create index if not exists beauty_contest_sessions_pending_worker_idx
  on public.beauty_contest_sessions (updated_at, id)
  where ib_provider in ('pending-codex-cli', 'pending-local-llm');

analyze public.daily_screener_runs;
analyze public.recommendation_publications;
analyze public.beauty_contest_sessions;
