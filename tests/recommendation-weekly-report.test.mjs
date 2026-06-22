import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { formatRecommendationWeeklyReport } = jiti('../lib/recommendations/weekly-report.ts');

const message = formatRecommendationWeeklyReport({
  generatedAt: '2026-06-20T07:00:00.000Z',
  markets: [{
    market: 'US',
    horizons: [{ horizon: 'D5', sampleSize: 40, positiveHitRate: 55, benchmarkWinRate: 47.5, averageExcessReturnPct: -1.2 }],
    causes: [{ causeCode: 'SIGNAL_SOURCE', count: 1, critical: 1, confirmed: 1 }],
    policies: [{
      engineVersion: 'kr-risk-flow-v2.1',
      d5: { horizon: 'D5', sampleSize: 20, positiveHitRate: 60, benchmarkWinRate: 55, averageExcessReturnPct: 0.8, averageMaePct: -2, lowerDecileReturnPct: -5, flowCoveragePct: 95 },
    }],
  }],
  dashboardUrl: 'https://example.com/recommendations?view=diagnostics',
});

assert.match(message, /MTN 추천 성과 주간 보고/);
assert.match(message, /D5: n=40/);
assert.match(message, /SIGNAL_SOURCE \(반복 원인 1건\)/);
assert.match(message, /kr-risk-flow-v2\.1: D5 n=20/);
assert.match(message, /수급커버 \+95\.0%/);
assert.match(message, /https:\/\/example.com/);
console.log('recommendation weekly report tests passed');
