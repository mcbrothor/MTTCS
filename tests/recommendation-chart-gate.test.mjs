import assert from 'node:assert/strict';
import { buildRecommendationChartGate, rankChartGatedPicks } from '../lib/recommendations/chart-gate.ts';

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
console.log('recommendation chart gate tests passed');
