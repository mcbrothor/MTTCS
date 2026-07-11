import assert from 'node:assert/strict';
import { hasCoreFundamentalCoverage, mergeFundamentalFallback } from '../lib/finance/market/fundamental-quality.ts';

const partial = { epsGrowthPct: 30, revenueGrowthPct: 18, roePct: null, debtToEquityPct: null, source: 'cache' };
const complete = { epsGrowthPct: 30, revenueGrowthPct: 20, roePct: 18, debtToEquityPct: 35, source: 'SEC EDGAR' };
assert.equal(hasCoreFundamentalCoverage(partial), false);
assert.equal(hasCoreFundamentalCoverage(complete), true);
const merged = mergeFundamentalFallback({ ...complete, revenueGrowthPct: null }, partial);
assert.equal(merged.revenueGrowthPct, 18, 'A partial fresh response should retain a usable recent cache value.');
assert.equal(merged.epsGrowthPct, 30);
console.log('fundamental fetcher tests passed');
