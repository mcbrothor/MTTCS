ALTER TABLE public.fundamental_cache ADD COLUMN IF NOT EXISTS float_shares NUMERIC;
ALTER TABLE public.fundamental_cache ADD COLUMN IF NOT EXISTS shares_outstanding NUMERIC;
COMMENT ON COLUMN public.fundamental_cache.float_shares IS '유동주식수 (Yahoo Finance)';
COMMENT ON COLUMN public.fundamental_cache.shares_outstanding IS '발행주식수 (Yahoo Finance)';;
