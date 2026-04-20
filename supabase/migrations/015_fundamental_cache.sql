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

-- 모든 사용자에게 읽기/쓰기 허용 (서버에서 관리하므로 public 허용이나 service_role을 권장하지만 
-- 현 시스템의 정책 패턴을 따르기 위해 전체 허용)
CREATE POLICY "Allow select on fundamental_cache" ON public.fundamental_cache FOR SELECT USING (true);
CREATE POLICY "Allow insert/update on fundamental_cache" ON public.fundamental_cache FOR ALL USING (true);
