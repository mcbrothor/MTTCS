-- v8.0: scanner recommendation tiers and rich contest analysis mapping

ALTER TABLE public.beauty_contest_sessions
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS response_schema_version TEXT,
  ADD COLUMN IF NOT EXISTS market_context JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS candidate_pool_snapshot JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.contest_candidates
  ADD COLUMN IF NOT EXISTS recommendation_tier TEXT,
  ADD COLUMN IF NOT EXISTS recommendation_reason TEXT,
  ADD COLUMN IF NOT EXISTS llm_scores JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS llm_analysis JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS final_pick_rank INTEGER,
  ADD COLUMN IF NOT EXISTS final_pick_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contest_candidates_recommendation_tier_check'
  ) THEN
    ALTER TABLE public.contest_candidates
      ADD CONSTRAINT contest_candidates_recommendation_tier_check
      CHECK (
        recommendation_tier IS NULL
        OR recommendation_tier IN ('Recommended', 'Partial', 'Low Priority', 'Error')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contest_candidates_final_pick_rank_check'
  ) THEN
    ALTER TABLE public.contest_candidates
      ADD CONSTRAINT contest_candidates_final_pick_rank_check
      CHECK (final_pick_rank IS NULL OR final_pick_rank >= 1);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS contest_candidates_session_recommendation_idx
  ON public.contest_candidates (session_id, recommendation_tier);

CREATE INDEX IF NOT EXISTS contest_candidates_session_final_pick_idx
  ON public.contest_candidates (session_id, actual_invested, final_pick_rank);
