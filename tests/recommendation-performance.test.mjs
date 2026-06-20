import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const core = jiti('../lib/recommendations/core.ts');
const prices = jiti('../lib/recommendations/prices.ts');

function bars(start, count, base = 100) {
  const rows = [];
  const date = new Date(`${start}T00:00:00Z`);
  while (rows.length < count) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      const close = base + rows.length;
      rows.push({
        date: date.toISOString().slice(0, 10),
        open: close,
        high: close + 2,
        low: close - 2,
        close,
        volume: 1_000_000,
        qualityStatus: 'FULL',
      });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return rows;
}

assert.equal(prices.normalizeRecommendationBarDate('20260619'), '2026-06-19');
assert.equal(prices.normalizeRecommendationBarDate('2026-06-19'), '2026-06-19');

{
  const rows = bars('2026-06-19', 4);
  assert.equal(core.resolveFirstTradableIndex('2026-06-19T12:00:00.000Z', 'KR', rows), 1, 'KR 21:00 publication enters next session');
  assert.equal(core.resolveFirstTradableIndex('2026-06-19T12:00:00.000Z', 'US', rows), 0, 'US 08:00 ET publication enters same session');
}

{
  const stock = bars('2026-06-19', 8, 100);
  const benchmark = bars('2026-06-19', 8, 200);
  const result = core.calculateRecommendationPerformance({
    generatedAt: '2026-06-19T12:00:00.000Z',
    market: 'US',
    horizon: 'D5',
    bars: stock,
    benchmarkBars: benchmark,
  });
  assert.equal(result.status, 'MATURED');
  assert.equal(result.entryDate, '2026-06-19');
  assert.equal(result.evaluationDate, '2026-06-26');
  assert.equal(result.sessionCount, 5);
  assert.equal(result.returnPct, 5);
  assert.equal(result.benchmarkReturnPct, 2.5);
  assert.equal(result.excessReturnPct, 2.5);
  assert.equal(result.mfePct, 7);
  assert.equal(result.maePct, -2);
}

{
  const result = core.calculateRecommendationPerformance({
    generatedAt: '2026-06-19T12:00:00.000Z',
    market: 'US',
    horizon: 'D20',
    bars: bars('2026-06-19', 10),
    benchmarkBars: bars('2026-06-19', 10, 200),
  });
  assert.equal(result.status, 'PENDING');
  assert.equal(result.sessionCount, 9);
}

{
  const stock = bars('2026-06-12', 5, 100);
  const benchmark = bars('2026-06-12', 5, 200);
  const input = {
    generatedAt: '2026-06-12T12:29:59.312Z',
    market: 'US',
    bars: stock,
    benchmarkBars: benchmark,
  };
  const live = core.calculateRecommendationPerformance({ ...input, horizon: 'LIVE' });
  const d5 = core.calculateRecommendationPerformance({ ...input, horizon: 'D5' });

  assert.equal(live.status, 'MATURED', 'LIVE uses the latest available close before D5 matures');
  assert.equal(live.sessionCount, 4);
  assert.equal(live.evaluationDate, '2026-06-18');
  assert.equal(d5.status, 'PENDING', 'D5 requires five complete sessions after entry');
  assert.equal(d5.sessionCount, 4);
}

{
  const marked = core.markPriceAnomalies([
    { date: '2026-01-02', open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { date: '2026-01-05', open: 50, high: 51, low: 49, close: 50, volume: 1 },
  ]);
  assert.equal(marked[1].qualityStatus, 'ANOMALY');
}

{
  const rows = Array.from({ length: 30 }, (_, index) => ({
    pickId: `pick-${index}`,
    publicationId: `pub-${Math.floor(index / 5)}`,
    market: 'US',
    horizon: 'D20',
    source: 'momentum',
    sector: index < 4 ? 'Technology' : 'Other',
    rank: (index % 10) + 1,
    confidence: 0.8,
    entryGapPct: null,
    returnPct: -10 - (index % 2),
    benchmarkReturnPct: 2,
    excessReturnPct: -12 - (index % 2),
    mfePct: 1,
    maePct: -12,
    qualityStatus: 'FULL',
    runDate: `2026-05-${String((index % 10) + 1).padStart(2, '0')}`,
  }));
  const findings = core.buildDiagnosticFindings(rows);
  assert.ok(findings.some((finding) => finding.causeCode === 'SIGNAL_SOURCE' && finding.findingStatus === 'CONFIRMED'));
}

{
  const findings = core.buildDiagnosticFindings([{
    pickId: 'bad-price', publicationId: 'pub', market: 'KR', horizon: 'D5', source: 'leader', sector: null,
    rank: 1, confidence: 0.8, entryGapPct: null, returnPct: -50, benchmarkReturnPct: 1, excessReturnPct: -51,
    mfePct: 0, maePct: -51, qualityStatus: 'ANOMALY', runDate: '2026-06-19',
  }]);
  assert.deepEqual(findings.map((finding) => finding.causeCode), ['DATA_QUALITY']);
  assert.equal(findings[0].findingStatus, 'HYPOTHESIS');
}

{
  const findings = core.buildDiagnosticFindings([{
    pickId: 'not-open-yet', publicationId: 'pub', market: 'KR', horizon: 'D5', source: 'leader', sector: null,
    rank: 1, confidence: 0.8, entryGapPct: null, returnPct: null, benchmarkReturnPct: null, excessReturnPct: null,
    mfePct: null, maePct: null, qualityStatus: 'MISSING', performanceStatus: 'PENDING', runDate: '2026-06-19',
  }]);
  assert.equal(findings.length, 0, 'pending recommendations are not data-quality failures');
}

console.log('recommendation performance tests passed');
