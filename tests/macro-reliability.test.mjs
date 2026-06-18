import assert from 'node:assert/strict';
import { percentToBasisPoints, hyOasToScore } from '../lib/data/fred.ts';
import { computeMacroScore } from '../lib/macro/compute.ts';
import { evaluateFreshness, buildFreshnessMeta } from '../lib/data/freshness.ts';

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

console.log('macro reliability tests passed');
