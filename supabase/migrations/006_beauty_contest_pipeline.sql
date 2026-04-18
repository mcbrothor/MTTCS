-- v6.0: beauty contest, automated reviews, and portfolio risk support

CREATE TABLE IF NOT EXISTS public.beauty_contest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'KR')),
  universe TEXT NOT NULL,
  selected_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  prompt_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_prompt TEXT NOT NULL,
  llm_raw_response TEXT,
  llm_provider TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEW_READY', 'COMPLETED'))
);

CREATE TABLE IF NOT EXISTS public.contest_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  session_id UUID NOT NULL REFERENCES public.beauty_contest_sessions(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  exchange TEXT NOT NULL,
  name TEXT,
  user_rank INTEGER NOT NULL CHECK (user_rank BETWEEN 1 AND 10),
  llm_rank INTEGER CHECK (llm_rank BETWEEN 1 AND 10),
  llm_comment TEXT,
  actual_invested BOOLEAN NOT NULL DEFAULT false,
  linked_trade_id UUID REFERENCES public.trades(id) ON DELETE SET NULL,
  entry_reference_price NUMERIC,
  snapshot JSONB DEFAULT '{}'::jsonb,
  UNIQUE(session_id, ticker),
  UNIQUE(session_id, user_rank)
);

CREATE TABLE IF NOT EXISTS public.contest_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  candidate_id UUID NOT NULL REFERENCES public.contest_candidates(id) ON DELETE CASCADE,
  horizon TEXT NOT NULL CHECK (horizon IN ('W1', 'M1')),
  due_date DATE NOT NULL,
  base_price NUMERIC,
  review_price NUMERIC,
  return_pct NUMERIC,
  price_as_of DATE,
  price_source TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UPDATED', 'ERROR', 'MANUAL')),
  mistake_tags TEXT[] DEFAULT '{}',
  user_review_note TEXT,
  error_message TEXT,
  UNIQUE(candidate_id, horizon)
);

CREATE TABLE IF NOT EXISTS public.trade_stop_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  stop_price NUMERIC NOT NULL CHECK (stop_price > 0),
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('INITIAL', 'TEN_WEEK_MA', 'HIGH_WATERMARK', 'MANUAL', 'PYRAMID'))
);

CREATE TABLE IF NOT EXISTS public.trade_exit_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('GAIN_PCT', 'PRICE', 'R_MULTIPLE', 'MANUAL')),
  trigger_value NUMERIC NOT NULL,
  exit_fraction NUMERIC NOT NULL CHECK (exit_fraction > 0 AND exit_fraction <= 1),
  note TEXT,
  executed BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.portfolio_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  market TEXT NOT NULL DEFAULT 'US' CHECK (market IN ('US', 'KR')),
  total_equity NUMERIC NOT NULL CHECK (total_equity > 0),
  cash NUMERIC DEFAULT 0 CHECK (cash >= 0),
  max_positions INTEGER,
  UNIQUE(market)
);

CREATE TABLE IF NOT EXISTS public.security_profiles (
  ticker TEXT PRIMARY KEY,
  exchange TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  industry TEXT,
  market TEXT NOT NULL CHECK (market IN ('US', 'KR')),
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS beauty_contest_sessions_market_selected_idx
  ON public.beauty_contest_sessions (market, selected_at DESC);

CREATE INDEX IF NOT EXISTS contest_candidates_session_rank_idx
  ON public.contest_candidates (session_id, user_rank ASC);

CREATE INDEX IF NOT EXISTS contest_reviews_due_status_idx
  ON public.contest_reviews (status, due_date ASC);

ALTER TABLE public.beauty_contest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_stop_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_exit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'beauty_contest_sessions',
    'contest_candidates',
    'contest_reviews',
    'trade_stop_events',
    'trade_exit_rules',
    'portfolio_settings',
    'security_profiles'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'Service role full access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (auth.role() = %L) WITH CHECK (auth.role() = %L)',
        tbl,
        'service_role',
        'service_role'
      );
    END IF;
  END LOOP;
END
$$;
