-- v19: risk strategy policy snapshots and structured risk gate results

CREATE TABLE IF NOT EXISTS public.risk_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'KR')),
  profile TEXT NOT NULL DEFAULT 'STANDARD' CHECK (profile IN ('CONSERVATIVE', 'STANDARD', 'AGGRESSIVE')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(market, profile)
);

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS risk_strategy TEXT CHECK (risk_strategy IN ('MINERVINI_VCP', 'HIGH_TIGHT_FLAG', 'ATR_VOLATILITY', 'CONSERVATIVE')),
  ADD COLUMN IF NOT EXISTS requested_risk_strategy TEXT CHECK (requested_risk_strategy IN ('AUTO', 'MINERVINI_VCP', 'HIGH_TIGHT_FLAG', 'ATR_VOLATILITY', 'CONSERVATIVE')),
  ADD COLUMN IF NOT EXISTS risk_gate JSONB,
  ADD COLUMN IF NOT EXISTS risk_policy_snapshot JSONB;

CREATE INDEX IF NOT EXISTS trades_risk_gate_gin
  ON public.trades USING gin (risk_gate);

CREATE INDEX IF NOT EXISTS risk_policies_market_profile_idx
  ON public.risk_policies (market, profile);

ALTER TABLE public.risk_policies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'risk_policies'
      AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.risk_policies
      FOR ALL TO service_role
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END
$$;
