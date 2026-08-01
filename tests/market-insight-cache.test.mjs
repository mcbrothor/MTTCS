import assert from 'node:assert/strict';
import {
  cacheTtlForMarketInsight,
  isMarketInsightCacheFresh,
} from '../lib/ai/market-insight-cache.ts';

const success = { isAiGenerated: true, cachedAt: 1_000 };
const fallback = { isAiGenerated: false, cachedAt: 1_000 };

assert.equal(cacheTtlForMarketInsight(success, 3_600_000, 60_000), 3_600_000);
assert.equal(cacheTtlForMarketInsight(fallback, 3_600_000, 60_000), 60_000);

assert.equal(isMarketInsightCacheFresh(success, 3_600_000, 60_000, 3_600_999), true);
assert.equal(isMarketInsightCacheFresh(success, 3_600_000, 60_000, 3_601_000), false);
assert.equal(isMarketInsightCacheFresh(fallback, 3_600_000, 60_000, 60_999), true);
assert.equal(isMarketInsightCacheFresh(fallback, 3_600_000, 60_000, 61_000), false);

console.log('market insight cache tests passed');
