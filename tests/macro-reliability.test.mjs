import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { percentToBasisPoints, hyOasToScore } from '../lib/data/fred.ts';
import { computeMacroScore } from '../lib/macro/compute.ts';
import { evaluateFreshness, buildFreshnessMeta } from '../lib/data/freshness.ts';
import {
  buildMacroApiResponse,
  buildMacroSnapshotRow,
  fetchMacroAssessment,
  macroAssessmentHttpStatus,
} from '../lib/macro/service.ts';

assert.equal(percentToBasisPoints(3.5), 350);
assert.equal(hyOasToScore(percentToBasisPoints(2.9), 25), 25);
assert.equal(hyOasToScore(percentToBasisPoints(3.5), 25), 18);
assert.equal(hyOasToScore(percentToBasisPoints(5.1), 25), 0);

const quotes = {
  SPY: { regularMarketPrice: 100, regularMarketChangePercent: 0, fiftyDayAverage: 95 },
  '^VIX': { regularMarketPrice: 18, regularMarketChangePercent: 0, fiftyDayAverage: 20 },
};
const curve = computeMacroScore(quotes, {}, {
  dgs10: [{ date: '2026-06-17', value: 4.5 }],
  dgs2: [{ date: '2026-06-17', value: 4.0 }],
});
assert.equal(curve.componentScores.yieldCurveScore, 10);
assert.match(curve.breakdown.find((row) => row.label === '수익률 곡선').rawValue, /DGS10/);

const freshness = evaluateFreshness('2026-06-18T00:00:00.000Z', 300, new Date('2026-06-18T00:06:00.000Z'));
assert.equal(freshness.isStale, true);
const meta = buildFreshnessMeta({
  source: 'test', provider: 'test', delay: 'EOD', observedAt: '2026-06-17T23:00:00.000Z', calculatedAt: '2026-06-18T01:00:00.000Z',
});
assert.equal(meta.asOf, meta.observedAt);
assert.equal(meta.isStale, false);
const missingObservedMeta = buildFreshnessMeta({
  source: 'test', provider: 'test', delay: 'REALTIME', calculatedAt: '2026-06-18T01:00:00.000Z',
});
assert.equal(missingObservedMeta.observedAt, undefined);
assert.equal(missingObservedMeta.asOf, '2026-06-18T01:00:00.000Z');
assert.equal(missingObservedMeta.isStale, true);
assert.match(missingObservedMeta.staleReason, /관측 시각/);

function quote(symbol, price = 100, fiftyDayAverage = 90, change = 1) {
  return {
    symbol,
    regularMarketPrice: price,
    regularMarketChangePercent: change,
    fiftyDayAverage,
  };
}

function history(length = 30, start = 100, dailyStep = 1) {
  return Array.from({ length }, (_, index) => {
    const close = start + index * dailyStep;
    const date = new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10);
    return { date, open: close, high: close, low: close, close, volume: 1_000 };
  });
}

const fullQuotes = [
  quote('^VIX', 14, 20), quote('UUP', 90, 100), quote('TLT', 90, 100),
  quote('HYG'), quote('IEF'), quote('CPER'), quote('GLD'),
  quote('IWM'), quote('RSP'), quote('SPY'),
  quote('^KS11'), quote('^KQ11'), quote('KRW=X', 1_300, 1_350),
];
const fullHistories = {
  HYG: history(30, 100, 1),
  IEF: history(30, 100, 0.1),
  CPER: history(30, 100, 1),
  GLD: history(30, 100, 0.1),
  IWM: history(30, 100, 1),
  RSP: history(30, 100, 0.5),
  SPY: history(30, 100, 0.1),
};

function serviceDependencies(overrides = {}) {
  let kisCalls = 0;
  const dependencies = {
    getYahooQuotes: async () => fullQuotes,
    getYahooDailyPrice: async (symbol) => fullHistories[symbol] || [],
    getHyOas: async () => [{ date: '2026-06-30', value: 250 }],
    get5yBreakeven: async () => [{ date: '2026-06-30', value: 2.2 }],
    getDgs10: async () => [{ date: '2026-06-30', value: 4.5 }],
    getDgs2: async () => [{ date: '2026-06-30', value: 4.0 }],
    getKisIndexQuotes: async () => {
      kisCalls += 1;
      return {
        '^KS11': { symbol: '^KS11', regularMarketPrice: 3_200, regularMarketChangePercent: 2 },
        '^KQ11': { symbol: '^KQ11', regularMarketPrice: 900, regularMarketChangePercent: 1 },
      };
    },
    ...overrides,
  };
  return { dependencies, getKisCalls: () => kisCalls };
}

const usFixture = serviceDependencies();
const usAssessment = await fetchMacroAssessment('US', {
  dependencies: usFixture.dependencies,
  now: new Date('2026-07-01T01:00:00.000Z'),
});
assert.equal(usFixture.getKisCalls(), 0, 'US 매크로 요청은 KIS를 호출하지 않아야 한다');
assert.equal(usAssessment.quality.status, 'VALID');

const apiContract = buildMacroApiResponse(usAssessment);
const snapshotRow = buildMacroSnapshotRow(usAssessment, '2026-07-01');
assert.equal(snapshotRow.macro_score, apiContract.score);
assert.equal(snapshotRow.regime, apiContract.regime);
assert.equal(snapshotRow.raw_json.modelVersion, apiContract.modelVersion);
assert.equal(snapshotRow.raw_json.observedAt, apiContract.observedAt);
assert.deepEqual(snapshotRow.raw_json.quality, apiContract.quality);

const krFixture = serviceDependencies();
const krAssessment = await fetchMacroAssessment('KR', {
  dependencies: krFixture.dependencies,
  now: new Date('2026-07-01T01:00:00.000Z'),
});
assert.equal(krFixture.getKisCalls(), 1, 'KR 매크로 요청은 KIS 지수를 한 번 조회해야 한다');
assert.equal(krAssessment.data['^KS11'].regularMarketPrice, 3_200);
assert.equal(krAssessment.data['^KS11'].source, 'KIS');

const degradedFixture = serviceDependencies({
  getDgs10: async () => [],
  getDgs2: async () => [],
});
const degradedAssessment = await fetchMacroAssessment('US', {
  dependencies: degradedFixture.dependencies,
  now: new Date('2026-07-01T01:00:00.000Z'),
});
assert.equal(degradedAssessment.quality.status, 'DEGRADED');
assert.equal(degradedAssessment.quality.coverage.availableWeight, 85);
assert.ok(
  degradedAssessment.result.macroScore > degradedAssessment.rawScore,
  '부분 결측 점수는 가용 가중치로 정규화해야 한다',
);
assert.notEqual(degradedAssessment.result.regime, 'RISK_OFF');

const blockedFixture = serviceDependencies({
  getYahooQuotes: async () => { throw new Error('Yahoo unavailable'); },
  getYahooDailyPrice: async () => [],
  getHyOas: async () => [],
  get5yBreakeven: async () => [],
  getDgs10: async () => { throw new Error('FRED unavailable'); },
  getDgs2: async () => [],
});
const blockedAssessment = await fetchMacroAssessment('US', {
  dependencies: blockedFixture.dependencies,
  now: new Date('2026-07-01T01:00:00.000Z'),
});
assert.equal(blockedAssessment.quality.status, 'BLOCKED');
assert.equal(blockedAssessment.result.macroScore, 50, '결측 입력을 0점 약세로 표현하지 않아야 한다');
assert.equal(blockedAssessment.result.regime, 'NEUTRAL');
assert.ok(blockedAssessment.quality.coverage.availableWeight < 70);
assert.equal(macroAssessmentHttpStatus(blockedAssessment), 503);
assert.throws(
  () => buildMacroSnapshotRow(blockedAssessment, '2026-07-01'),
  /BLOCKED macro assessment/i,
  'BLOCKED 평가는 스냅샷 행으로 직렬화되지 않아야 한다',
);
assert.equal(macroAssessmentHttpStatus(degradedAssessment), 200);

const historyRoute = readFileSync(
  new URL('../app/api/macro/history/route.ts', import.meta.url),
  'utf8',
);
assert.match(historyRoute, /rejectUnauthenticatedRequest\(request\)/);
assert.match(historyRoute, /getSupabaseAdmin\(\)[\s\S]+\.from\('macro_snapshot'\)/);
assert.doesNotMatch(historyRoute, /supabaseAnon/);

console.log('macro reliability tests passed');
