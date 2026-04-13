-- v4.0: VCP 분석 컬럼 추가 + RLS 활성화

-- VCP 분석 근거 저장
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS vcp_analysis JSONB;

-- RLS 활성화
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- 기본 정책: service_role은 모든 작업 가능 (개인 전용 앱)
-- anon key를 통한 직접 접근은 차단됨
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trades' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.trades
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
