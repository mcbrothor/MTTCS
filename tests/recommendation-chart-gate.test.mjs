import assert from 'node:assert/strict';
import {
  assessRecommendationPublicationGate,
  buildRecommendationChartGate,
  buildUnverifiedRecommendationChartGate,
  isOfficiallyEligibleRecommendationGate,
  rankChartGatedPicks,
} from '../lib/recommendations/chart-gate.ts';

const base = {
  fundamentals: { epsGrowthPct: 35, revenueGrowthPct: 22, roePct: 18, debtToEquityPct: 30 },
  dataQuality: { missingFundamentals: [] },
};
const actionable = buildRecommendationChartGate(base, {
  verdict: 'BUY', setupGrade: 'A', readiness: 'ACTIONABLE', professionalPlan: { trendScore: 5 },
});
const avoid = buildRecommendationChartGate(base, {
  verdict: 'AVOID', setupGrade: 'D', readiness: 'INVALID', professionalPlan: { trendScore: 1 },
});
const missingFundamentals = buildRecommendationChartGate({ ...base, fundamentals: null }, {
  verdict: 'WATCH', setupGrade: 'B', readiness: 'NEAR_TRIGGER', professionalPlan: { trendScore: 4 },
});

assert.equal(actionable.disposition, 'ACTIONABLE');
assert.equal(actionable.eligible, true);
assert.equal(avoid.eligible, false);
assert.equal(missingFundamentals.eligible, false);
assert.equal(buildRecommendationChartGate({ ...base, fundamentals: { ...base.fundamentals, debtToEquityPct: null } }, {
  verdict: 'WATCH', setupGrade: 'B', readiness: 'NEAR_TRIGGER', professionalPlan: { trendScore: 4 },
}).fundamentalVerification, 'PARTIAL');
assert.deepEqual(rankChartGatedPicks([
  { rank: 1, ticker: 'AVOID', confidence: 0.9, chartGate: avoid },
  { rank: 2, ticker: 'BUY', confidence: 0.7, chartGate: actionable },
]).map((pick) => pick.ticker), ['BUY', 'AVOID']);

const eligibleTop10 = Array.from({ length: 10 }, (_, index) => ({
  ticker: `SAFE${index + 1}`,
  chartGate: actionable,
}));
const publishable = assessRecommendationPublicationGate(eligibleTop10);
assert.equal(publishable.canPublish, true);
assert.equal(publishable.eligibleCount, 10);
assert.equal(publishable.coverage, 1);

const unverified = buildUnverifiedRecommendationChartGate('테스트 데이터 누락');
const disabledFailClosed = assessRecommendationPublicationGate(Array.from({ length: 10 }, (_, index) => ({
  ticker: `DISABLED${index + 1}`,
  chartGate: buildUnverifiedRecommendationChartGate('통합 차트 게이트가 비활성화되었습니다.'),
})));
assert.equal(disabledFailClosed.canPublish, false);
assert.equal(disabledFailClosed.coverage, 0);
assert.equal(disabledFailClosed.failures.length, 10);

const degraded = assessRecommendationPublicationGate([
  ...eligibleTop10.slice(0, 8),
  { ticker: 'AVOID', chartGate: avoid },
  { ticker: 'UNVERIFIED', chartGate: unverified },
]);
assert.equal(degraded.canPublish, false);
assert.equal(degraded.eligibleCount, 8);
assert.equal(degraded.coverage, 0.8);
assert.deepEqual(degraded.failures.map((failure) => failure.ticker), ['AVOID', 'UNVERIFIED']);
assert.match(degraded.reason, /8\/10/);

const missingGate = assessRecommendationPublicationGate([...eligibleTop10.slice(0, 9), { ticker: 'MISSING' }]);
assert.equal(missingGate.canPublish, false);
assert.equal(missingGate.failures[0].disposition, 'MISSING');

assert.equal(isOfficiallyEligibleRecommendationGate({
  ...actionable,
  eligible: true,
  verdict: 'AVOID',
}), false);
console.log('recommendation chart gate tests passed');
