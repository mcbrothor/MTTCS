-- v4.0: 관심 종목(Watchlist) 테이블

CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  ticker TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'NAS',
  memo TEXT,                       -- 사용자 메모 (왜 관심 종목인지)
  tags TEXT[] DEFAULT '{}',        -- 태그 (예: 'VCP후보', '실적발표전')
  priority INTEGER DEFAULT 0,     -- 0=보통, 1=높음, 2=긴급

  UNIQUE(ticker)                   -- 같은 티커 중복 방지
);

-- 인덱스
CREATE INDEX IF NOT EXISTS watchlist_priority_created_at_idx
  ON public.watchlist (priority DESC, created_at DESC);

-- RLS 활성화
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

-- service_role 전체 접근 정책
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'watchlist' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.watchlist
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
