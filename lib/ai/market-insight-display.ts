import type { AiInsightErrorCode, AiModelInsight } from '@/types';

export function aiAttemptStatusLabel(
  status: AiModelInsight['status'],
  errorCode?: AiInsightErrorCode,
) {
  if (status === 'success') return '응답 완료';
  if (status === 'failed') return '응답 실패';
  return errorCode === 'UNAVAILABLE' ? '운영 환경 제외' : '건너뜀';
}

export function isCountedModelInsight(insight: Pick<AiModelInsight, 'status'>) {
  return insight.status !== 'skipped';
}

export function friendlyAiFailureMessage(errorCode?: AiInsightErrorCode, message?: string) {
  if (errorCode === 'TIMEOUT') return '응답 시간이 길어져 다른 분석 경로로 전환했습니다.';
  if (errorCode === 'RATE_LIMITED') return '요청이 몰려 잠시 응답하지 못했습니다.';
  if (errorCode === 'MODEL_NOT_FOUND') return '현재 사용할 수 없는 분석 모델입니다.';
  if (errorCode === 'INVALID_RESPONSE') return '답변 형식이 기준에 맞지 않아 사용하지 않았습니다.';
  if (errorCode === 'PROXY_ERROR') return '로컬 분석 연결 주소 또는 프록시 상태를 확인해야 합니다.';
  if (errorCode === 'UNAVAILABLE') return '현재 운영 환경에서 사용하지 않는 분석 방식입니다.';
  if (!message) return '응답을 받지 못했습니다. 다른 분석 경로의 결과를 표시합니다.';

  const lower = message.toLowerCase();
  if (lower.includes('timed out') || lower.includes('timeout')) return '응답 시간이 길어져 다른 분석 경로로 전환했습니다.';
  if (lower.includes('rate limit') || lower.includes('429')) return '요청이 몰려 잠시 응답하지 못했습니다.';
  if (lower.includes('model does not exist') || lower.includes('404')) return '현재 사용할 수 없는 분석 모델입니다.';
  if (lower.includes('not available on vercel')) return '현재 운영 환경에서 사용하지 않는 분석 방식입니다.';
  if (lower.includes('evidencekeys') || lower.includes('numeric claims') || lower.includes('json object')) {
    return '답변 형식이 기준에 맞지 않아 사용하지 않았습니다.';
  }
  return '응답을 확인할 수 없어 다른 분석 경로의 결과를 표시합니다.';
}
