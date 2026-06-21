import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { toDailyScannerSnapshot } = jiti('../lib/scanner/daily-snapshot.ts');

const snapshot = toDailyScannerSnapshot({
  id: 'run-1',
  run_date: '2026-06-20',
  status: 'failed',
  completed_at: null,
  updated_at: '2026-06-20T09:00:00Z',
  error_summary: 'Top5 enrichment failed',
}, [{
  source: 'momentum',
  universe: 'NASDAQ100',
  ticker: 'NVDA',
  exchange: 'NAS',
  name: 'NVIDIA',
  score: '92.5',
  grade: 'EXPLOSIVE',
  source_rank: 1,
  price: '130.25',
  price_as_of: '2026-06-20',
  reason: 'EXPLOSIVE',
  raw_metrics: { rvol: 3.2 },
  raw: { currentVolume: 1000 },
}]);

assert.equal(snapshot.run.status, 'failed');
assert.equal(snapshot.run.warning, 'Top5 enrichment failed');
assert.equal(snapshot.candidates[0].score, 92.5);
assert.equal(snapshot.candidates[0].price, 130.25);
assert.equal(snapshot.candidates[0].metrics.rvol, 3.2);

console.log('daily scanner snapshot tests passed');
