-- ============================================================
-- CAN SLIM 풀 펀더멘털 캐시 + EDGAR 백필 cursor
-- ------------------------------------------------------------
-- 목적:
--   getSecFundamentals가 1~3MB의 XBRL companyfacts JSON을 매 스캔마다
--   다운로드하던 비용을 nightly cron으로 일괄 처리하고 결과를 캐시한다.
--   기존 fundamental_cache(015) 테이블에 CAN SLIM 풀 필드를 추가 컬럼으로 확장한다.
--
-- 무료 인프라 한도:
--   - Supabase free 500MB DB → row당 ~600B × 3,000 종목 = 1.8MB (안전)
--   - Vercel Hobby cron 60초 한도 → chunked resume
-- ============================================================

ALTER TABLE public.fundamental_cache
  ADD COLUMN IF NOT EXISTS current_qtr_eps_growth_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS prior_qtr_eps_growth_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS eps_growth_last_3qtrs NUMERIC[],
  ADD COLUMN IF NOT EXISTS current_qtr_sales_growth_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS annual_eps_growth_each_year NUMERIC[],
  ADD COLUMN IF NOT EXISTS had_negative_eps_in_last_3yr BOOLEAN,
  ADD COLUMN IF NOT EXISTS shares_buyback BOOLEAN,
  ADD COLUMN IF NOT EXISTS edgar_last_filed DATE,
  ADD COLUMN IF NOT EXISTS edgar_fetch_status TEXT,        -- 'OK' | 'NO_CIK' | 'FETCH_FAIL' | 'PARSE_FAIL'
  ADD COLUMN IF NOT EXISTS edgar_error_message TEXT,
  ADD COLUMN IF NOT EXISTS backfilled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS fundamental_cache_backfilled_at_idx
  ON public.fundamental_cache (backfilled_at DESC);
CREATE INDEX IF NOT EXISTS fundamental_cache_market_updated_idx
  ON public.fundamental_cache (market, updated_at DESC);

-- ----------------------------------------------------------------
-- 백필 진행 상황 (cron resume cursor)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fundamentals_backfill_progress (
  wave TEXT PRIMARY KEY,                    -- 'A' | 'B' | 'KR'
  market TEXT NOT NULL,                     -- 'US' | 'KR'
  cursor_offset INTEGER NOT NULL DEFAULT 0,
  universe_size INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_run_processed INTEGER DEFAULT 0,
  last_run_failed INTEGER DEFAULT 0,
  last_run_skipped INTEGER DEFAULT 0,
  last_error TEXT
);

ALTER TABLE public.fundamentals_backfill_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage backfill progress" ON public.fundamentals_backfill_progress;
CREATE POLICY "Service role can manage backfill progress" ON public.fundamentals_backfill_progress
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 초기 row (멱등)
INSERT INTO public.fundamentals_backfill_progress (wave, market, cursor_offset, universe_size)
VALUES
  ('A', 'US', 0, 0),
  ('B', 'US', 0, 0),
  ('KR', 'KR', 0, 0)
ON CONFLICT (wave) DO NOTHING;
