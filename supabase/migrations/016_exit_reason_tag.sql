-- 청산 사유 태그 컬럼 추가
-- 왜: 청산 이유(손절/목표가/시장전환 등)를 구조화된 태그로 기록하여
--     복기 시 청산 유형별 승률·R 분포 집계를 가능하게 한다.
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS exit_reason TEXT;

-- 허용 값 예시 (CHECK 제약은 없이 자유 텍스트로 관리 — 드롭다운은 프론트에서 제어)
-- '손절', '목표가도달', '시장RED전환', '기술적이탈', '조기청산', '만기청산', '기타'

COMMENT ON COLUMN public.trades.exit_reason IS
  '청산 사유 태그. 예: 손절 | 목표가도달 | 시장RED전환 | 기술적이탈 | 조기청산 | 기타';
