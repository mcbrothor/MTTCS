-- 020_contest_ib_validation.sql
-- IB 전문가 검증 결과 저장 컬럼 추가

ALTER TABLE public.beauty_contest_sessions
  ADD COLUMN IF NOT EXISTS ib_raw_response TEXT,
  ADD COLUMN IF NOT EXISTS ib_analysis JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ib_provider TEXT,
  ADD COLUMN IF NOT EXISTS llm_report_summary TEXT;

COMMENT ON COLUMN public.beauty_contest_sessions.ib_raw_response IS '외부 LLM IB 검증 원본 응답';
COMMENT ON COLUMN public.beauty_contest_sessions.ib_analysis IS '구조화된 IB 위원회 분석 결과 (committee_consensus, candidate_analyses 등)';
COMMENT ON COLUMN public.beauty_contest_sessions.ib_provider IS '사용된 외부 LLM 프로바이더 (예: gemini (gemini-1.5-pro))';
COMMENT ON COLUMN public.beauty_contest_sessions.llm_report_summary IS '내부 룰엔진 분석 요약';
