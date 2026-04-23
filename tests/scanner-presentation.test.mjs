import assert from 'node:assert/strict';
import {
  formatScannerRs,
  getScannerMomentumSeries,
  getScannerRsBand,
  getScannerSepaSummary,
  getScannerTrendDots,
} from '../lib/scanner-presentation.ts';

const result = {
  ticker: 'NVDA',
  rsRating: 96,
  rsRank: 3,
  rsUniverseSize: 100,
  distanceFromMa50Pct: 4.2,
  return12m: 72,
  return9m: 58,
  return6m: 41,
  return3m: 18,
  eightWeekReturnPct: 9,
  sepaCriteria: [
    { id: 'price_vs_ma50', status: 'pass' },
    { id: 'price_vs_ma150', status: 'pass' },
    { id: 'price_vs_ma200', status: 'warning' },
    { id: 'ma_alignment', status: 'pass' },
  ],
  sepaEvidence: {
    summary: {
      corePassed: 6,
      coreTotal: 7,
    },
    criteria: [
      { id: 'rs_rating', status: 'fail', isCore: true },
      { id: 'within_52w_high', status: 'fail', isCore: true },
      { id: 'price_vs_ma50', status: 'pass', isCore: true },
    ],
  },
};

{
  const band = getScannerRsBand(result);
  assert.equal(band.label, 'RS Elite');
  assert.equal(band.tone, 'elite');
}

{
  assert.equal(formatScannerRs(result), '96 #3/100');
}

{
  const dots = getScannerTrendDots(result);
  assert.deepEqual(dots.map((dot) => dot.active), [true, true, true, true]);
}

{
  const summary = getScannerSepaSummary(result);
  assert.equal(summary.label, 'SEPA 6/7');
  assert.deepEqual(summary.failedLabels, ['RS', '52W High']);
}

{
  const series = getScannerMomentumSeries(result);
  assert.equal(series.points.length, 5);
  assert.deepEqual(series.points.map((point) => point.label), ['12M', '9M', '6M', '3M', '8W']);
}

console.log('scanner presentation tests passed');
