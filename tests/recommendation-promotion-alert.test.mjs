import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { formatRecommendationPromotionAlert, recommendationPromotionAlertKey } = jiti('../lib/recommendations/promotion-alert.ts');

const readiness = {
  ready: true,
  minCohorts: 20,
  activeEngineVersion: 'daily-top10-active-allocation-v2',
  recommendedEngineVersion: 'kr-risk-flow-v3',
  evaluations: [
    { category: 'KOSPI200', horizon: 'D20', result: { cohortCount: 20 } },
    { category: 'KOSPI200', horizon: 'D60', result: { cohortCount: 21 } },
    { category: 'KOSDAQ150', horizon: 'D20', result: { cohortCount: 22 } },
    { category: 'KOSDAQ150', horizon: 'D60', result: { cohortCount: 20 } },
  ],
};

const message = formatRecommendationPromotionAlert(readiness);
assert.match(message, /추천 정책 승격 준비 알림/);
assert.match(message, /daily-top10-active-allocation-v2/);
assert.match(message, /kr-risk-flow-v3/);
assert.match(message, /코스피 · D20 20일 · D60 21일/);
assert.match(message, /자동 승격은 실행하지 않았습니다/);

const key = recommendationPromotionAlertKey({
  activeEngineVersion: readiness.activeEngineVersion,
  recommendedEngineVersion: readiness.recommendedEngineVersion,
});
assert.match(key, /^recommendation-promotion-ready:[a-f0-9]{64}$/);
assert.equal(key, recommendationPromotionAlertKey({
  activeEngineVersion: readiness.activeEngineVersion,
  recommendedEngineVersion: readiness.recommendedEngineVersion,
}));
assert.notEqual(key, recommendationPromotionAlertKey({
  activeEngineVersion: readiness.activeEngineVersion,
  recommendedEngineVersion: 'kr-risk-ranked-v3',
}));
assert.equal(formatRecommendationPromotionAlert({ ...readiness, ready: false }), null);

const riskMessage = formatRecommendationPromotionAlert({
  ...readiness,
  recommendedEngineVersion: 'kr-risk-ranked-v3',
});
assert.match(riskMessage, /v2 대비 평균 초과수익/);
assert.doesNotMatch(riskMessage, /최대하락|하위 10% 손실|수급 커버리지/);

console.log('recommendation promotion alert tests passed');
