ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS market text;

UPDATE public.trades
SET market = CASE
  WHEN ticker ~ '^[0-9]{6}$' THEN 'KR'
  ELSE 'US'
END
WHERE market IS NULL;

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_market_check;

ALTER TABLE public.trades
  ADD CONSTRAINT trades_market_check
  CHECK (market IN ('US', 'KR'))
  NOT VALID;

ALTER TABLE public.trades
  VALIDATE CONSTRAINT trades_market_check;

ALTER TABLE public.trades
  ALTER COLUMN market SET NOT NULL;

CREATE INDEX IF NOT EXISTS trades_user_market_created_id_idx
  ON public.trades (user_id, market, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS trades_user_market_status_created_id_idx
  ON public.trades (user_id, market, status, created_at DESC, id DESC);
