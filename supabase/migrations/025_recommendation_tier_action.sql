-- Extend contest_candidates.recommendation_tier CHECK to allow 'Action'.
--
-- Context: scanner-recommendation.ts now emits four pool tiers
--   ('Recommended', 'Action', 'IB Review', 'Watch') under the regime-adaptive
-- 4-tier system. Without this constraint update, contest session inserts that
-- forward an 'Action' tier candidate would be rejected with a CHECK violation.

ALTER TABLE public.contest_candidates
  DROP CONSTRAINT IF EXISTS contest_candidates_recommendation_tier_check;

ALTER TABLE public.contest_candidates
  ADD CONSTRAINT contest_candidates_recommendation_tier_check
  CHECK (
    recommendation_tier IS NULL
    OR recommendation_tier IN ('Recommended', 'Action', 'IB Review', 'Watch', 'Partial', 'Low Priority', 'Error')
  );
