-- 펀더멘탈 데이터 캐시를 위한 테이블 생성
CREATE TABLE IF NOT EXISTS public.fundamental_cache (
  ticker TEXT NOT NULL,
  market TEXT NOT NULL,
  eps_growth_pct NUMERIC,
  revenue_growth_pct NUMERIC,
  roe_pct NUMERIC,
  debt_to_equity_pct NUMERIC,
  source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticker, market)
);

-- RLS 활성화 및 권한 설정
ALTER TABLE public.fundamental_cache ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (멱등성 확보)
DROP POLICY IF EXISTS "Allow select on fundamental_cache" ON public.fundamental_cache;
DROP POLICY IF EXISTS "Allow insert/update on fundamental_cache" ON public.fundamental_cache;
DROP POLICY IF EXISTS "Service role can manage fundamental_cache" ON public.fundamental_cache;

-- 읽기는 모든 사용자 허용
CREATE POLICY "Allow select on fundamental_cache" ON public.fundamental_cache FOR SELECT USING (true);

-- 쓰기는 서버(service_role)만 허용
CREATE POLICY "Service role can manage fundamental_cache" ON public.fundamental_cache
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
