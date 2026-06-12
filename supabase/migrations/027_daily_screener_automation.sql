-- v27.0: daily screener automation queue and normalized candidates

CREATE TABLE IF NOT EXISTS public.daily_screener_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  run_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_provider_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  scan_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  top5_result JSONB,
  error_summary TEXT,
  telegram_sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.daily_screener_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  run_id UUID NOT NULL REFERENCES public.daily_screener_runs(id) ON DELETE CASCADE,
  run_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('minervini', 'canslim', 'leader', 'momentum', 'qullamaggie')),
  universe TEXT NOT NULL CHECK (universe IN ('NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150')),
  ticker TEXT NOT NULL,
  exchange TEXT NOT NULL,
  name TEXT,
  score NUMERIC NOT NULL,
  grade TEXT NOT NULL,
  source_rank INTEGER CHECK (source_rank IS NULL OR source_rank > 0),
  price NUMERIC,
  price_as_of TEXT,
  reason TEXT,
  raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(run_id, source, universe, ticker)
);

CREATE INDEX IF NOT EXISTS daily_screener_runs_status_date_idx
  ON public.daily_screener_runs (status, run_date ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS daily_screener_candidates_run_source_score_idx
  ON public.daily_screener_candidates (run_id, source, score DESC);

CREATE INDEX IF NOT EXISTS daily_screener_candidates_ticker_idx
  ON public.daily_screener_candidates (ticker);

ALTER TABLE public.daily_screener_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_screener_candidates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'daily_screener_runs',
    'daily_screener_candidates'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = 'Service role full access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (auth.role() = %L) WITH CHECK (auth.role() = %L)',
        tbl,
        'service_role',
        'service_role'
      );
    END IF;
  END LOOP;
END
$$;
