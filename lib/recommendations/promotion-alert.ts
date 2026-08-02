import { createHash } from 'node:crypto';
import { KR_RISK_FLOW_ENGINE_VERSION, RECOMMENDATION_CATEGORY_LABEL } from './config';
import type { evaluateKrLongTermPolicyPromotion } from './policy-evaluation';

type PromotionReadiness = ReturnType<typeof evaluateKrLongTermPolicyPromotion>;

export function recommendationPromotionAlertKey(input: {
  activeEngineVersion: string;
  recommendedEngineVersion: string;
}) {
  const identity = `${input.activeEngineVersion}->${input.recommendedEngineVersion}:long-term-v1`;
  return `recommendation-promotion-ready:${createHash('sha256').update(identity).digest('hex')}`;
}

export function formatRecommendationPromotionAlert(readiness: PromotionReadiness) {
  if (!readiness.ready || !readiness.recommendedEngineVersion) return null;
  const cohortLines = (['KOSPI200', 'KOSDAQ150'] as const).map((category) => {
    const counts = (['D20', 'D60'] as const).map((horizon) => {
      const evaluation = readiness.evaluations.find((row) => row.category === category && row.horizon === horizon);
      return `${horizon} ${evaluation?.result.cohortCount || 0}일`;
    });
    return `• ${RECOMMENDATION_CATEGORY_LABEL[category]} · ${counts.join(' · ')}`;
  });
  const criteriaLine = readiness.recommendedEngineVersion === KR_RISK_FLOW_ENGINE_VERSION
    ? '상대성과와 90% 부트스트랩 하한, 평균 최대하락·하위 10% 손실 비열위, 수급 커버리지 조건을 모두 통과했습니다.'
    : 'v2 대비 평균 초과수익과 90% 부트스트랩 하한 조건을 모두 통과했습니다.';

  return [
    '🚨 *MTN 추천 정책 승격 준비 알림*',
    '',
    '장기 검증 조건을 충족해 운영 정책 변경이 필요합니다.',
    `• 현재 정책: ${readiness.activeEngineVersion}`,
    `• 권고 정책: ${readiness.recommendedEngineVersion}`,
    `• 기준: 코스피·코스닥 D20·D60 각각 동일 추천일 ${readiness.minCohorts}개 이상`,
    ...cohortLines,
    '',
    criteriaLine,
    '자동 승격은 실행하지 않았습니다. 운영 환경의 KR_RECOMMENDATION_POLICY 변경과 배포가 필요합니다.',
  ].join('\n');
}
