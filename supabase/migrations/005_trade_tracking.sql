-- v5.0: execution-based trade tracking and review fields

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS setup_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mistake_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS plan_note TEXT,
  ADD COLUMN IF NOT EXISTS invalidation_note TEXT,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS review_action TEXT;

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_status_check;

ALTER TABLE public.trades
  ADD CONSTRAINT trades_status_check
  CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'));

CREATE TABLE IF NOT EXISTS public.trade_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('ENTRY', 'EXIT')),
  executed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  price NUMERIC NOT NULL CHECK (price > 0),
  shares NUMERIC NOT NULL CHECK (shares > 0),
  fees NUMERIC DEFAULT 0 NOT NULL CHECK (fees >= 0),
  leg_label TEXT DEFAULT 'MANUAL' NOT NULL CHECK (leg_label IN ('E1', 'E2', 'E3', 'MANUAL')),
  note TEXT
);

CREATE INDEX IF NOT EXISTS trade_executions_trade_id_executed_at_idx
  ON public.trade_executions (trade_id, executed_at ASC);

ALTER TABLE public.trade_executions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trade_executions' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.trade_executions
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
