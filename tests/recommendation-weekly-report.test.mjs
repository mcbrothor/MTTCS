import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { formatRecommendationWeeklyReport } = jiti('../lib/recommendations/weekly-report.ts');

const message = formatRecommendationWeeklyReport({
  generatedAt: '2026-06-20T07:00:00.000Z',
  categories: [{
    category: 'NASDAQ100',
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
assert.match(message, /산식: 종목수익률=\(평가종가\/진입시가-1\), 초과수익=종목수익률-벤치마크수익률/);
assert.match(message, /미국 · 나스닥/);
assert.match(message, /벤치마크: \^NDX/);
assert.match(message, /D5: 표본 n=40/);
assert.match(message, /양수수익률 55\.0% \(22\/40\)/);
assert.match(message, /벤치마크 초과율 47\.5% \(19\/40\)/);
assert.match(message, /평균 초과수익 -1\.2%/);
assert.match(message, /SIGNAL_SOURCE \(반복 원인 1건\)/);
assert.match(message, /kr-risk-flow-v2\.1: D5 표본 n=20/);
assert.match(message, /수급데이터 커버리지 95\.0% \(19\/20\)/);
assert.match(message, /성숙\(MATURED\) 및 가격품질 FULL\/FALLBACK 표본만 집계/);
assert.match(message, /https:\/\/example.com/);
console.log('recommendation weekly report tests passed');
