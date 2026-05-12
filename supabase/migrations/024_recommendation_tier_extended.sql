-- Extend contest_candidates.recommendation_tier CHECK to allow 'IB Review' and 'Watch'.
--
-- Context: migration 008 defined the constraint as
--   recommendation_tier IN ('Recommended', 'Partial', 'Low Priority', 'Error')
-- but the scanner recommendation engine (lib/scanner-recommendation.ts) later
-- introduced 'IB Review' and 'Watch' tiers. Every contest session creation
-- attempted to insert these new values, which the DB rejected with a CHECK
-- violation surfaced to the UI as "Failed to create contest session."

ALTER TABLE public.contest_candidates
  DROP CONSTRAINT IF EXISTS contest_candidates_recommendation_tier_check;

ALTER TABLE public.contest_candidates
  ADD CONSTRAINT contest_candidates_recommendation_tier_check
  CHECK (
    recommendation_tier IS NULL
    OR recommendation_tier IN ('Recommended', 'IB Review', 'Watch', 'Partial', 'Low Priority', 'Error')
  );
