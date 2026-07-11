import assert from 'node:assert/strict';
import { isIsoChartDate, normalizeChartDate, toCompactChartDate } from '../lib/finance/core/chart-time.ts';

assert.equal(normalizeChartDate('20250710'), '2025-07-10');
assert.equal(normalizeChartDate('2025-07-10'), '2025-07-10');
assert.equal(toCompactChartDate('2025-07-10'), '20250710');
assert.equal(isIsoChartDate(normalizeChartDate('20250710')), true);
assert.equal(isIsoChartDate('20250710'), false);
console.log('chart time normalization tests passed');
