-- 014_security_hardening.sql
-- 1. 함수 보안 강화 (Search Path 설정)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 2. trades 테이블 보안 강화
-- user_id 컬럼 추가 (기존 데이터가 있을 수 있으므로 우선 NULL 허용으로 추가)
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 기존 데이터 소유권 할당 (첫 번째 사용자에게 할당)
UPDATE public.trades 
SET user_id = (SELECT id FROM auth.users LIMIT 1) 
WHERE user_id IS NULL;

-- 취약한 기존 정책 및 신규 정책 중복 방지를 위해 삭제
DROP POLICY IF EXISTS "Allow all for now" ON public.trades;
DROP POLICY IF EXISTS "Users can manage their own trades" ON public.trades;

-- 사용자 기반 RLS 정책 생성
CREATE POLICY "Users can manage their own trades" ON public.trades
    FOR ALL 
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. watchlist 테이블 보안 강화
-- user_id 컬럼 추가
ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 기존 데이터 소유권 할당
UPDATE public.watchlist 
SET user_id = (SELECT id FROM auth.users LIMIT 1) 
WHERE user_id IS NULL;

-- 중복 방지 UNIQUE 제약 조건 수정 (사용자별로 티커 중복 방지)
ALTER TABLE public.watchlist DROP CONSTRAINT IF EXISTS watchlist_ticker_key;
ALTER TABLE public.watchlist DROP CONSTRAINT IF EXISTS watchlist_user_ticker_unique;
ALTER TABLE public.watchlist ADD CONSTRAINT watchlist_user_ticker_unique UNIQUE (user_id, ticker);

-- 사용자 기반 RLS 정책 생성
DROP POLICY IF EXISTS "Users can manage their own watchlist" ON public.watchlist;
CREATE POLICY "Users can manage their own watchlist" ON public.watchlist
    FOR ALL 
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. 인덱스 최적화
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON public.watchlist(user_id);
