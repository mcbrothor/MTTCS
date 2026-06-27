-- v31: manual strategy trade plans

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS plan_mode TEXT NOT NULL DEFAULT 'SYSTEM_ANALYSIS',
  ADD COLUMN IF NOT EXISTS chart_plan JSONB,
  ADD COLUMN IF NOT EXISTS plan_answers JSONB,
  ADD COLUMN IF NOT EXISTS strategy_template_id TEXT;

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_plan_mode_check,
  ADD CONSTRAINT trades_plan_mode_check
    CHECK (plan_mode IN ('SYSTEM_ANALYSIS', 'MANUAL_STRATEGY'));

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_risk_strategy_check,
  ADD CONSTRAINT trades_risk_strategy_check
    CHECK (risk_strategy IN ('MINERVINI_VCP', 'HIGH_TIGHT_FLAG', 'ATR_VOLATILITY', 'CONSERVATIVE', 'ONL_PYRAMID', 'MANUAL_FIXED_RISK'));

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_requested_risk_strategy_check,
  ADD CONSTRAINT trades_requested_risk_strategy_check
    CHECK (requested_risk_strategy IN ('AUTO', 'MINERVINI_VCP', 'HIGH_TIGHT_FLAG', 'ATR_VOLATILITY', 'CONSERVATIVE', 'ONL_PYRAMID', 'MANUAL_FIXED_RISK'));

CREATE INDEX IF NOT EXISTS trades_plan_mode_created_at_idx
  ON public.trades (plan_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS trades_chart_plan_gin
  ON public.trades USING gin (chart_plan);
