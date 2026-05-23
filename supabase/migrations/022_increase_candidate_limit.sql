-- Increase contest candidate rank limit from 10 to 15
-- MAX_CONTEST_CANDIDATES was raised to 15 in contest-sources.ts

ALTER TABLE contest_candidates
  DROP CONSTRAINT IF EXISTS contest_candidates_user_rank_check,
  ADD CONSTRAINT contest_candidates_user_rank_check CHECK (user_rank BETWEEN 1 AND 15);

ALTER TABLE contest_candidates
  DROP CONSTRAINT IF EXISTS contest_candidates_llm_rank_check,
  ADD CONSTRAINT contest_candidates_llm_rank_check CHECK (llm_rank BETWEEN 1 AND 15);
