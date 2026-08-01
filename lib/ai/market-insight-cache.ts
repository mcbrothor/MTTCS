export interface CacheableMarketInsight {
  isAiGenerated: boolean;
  cachedAt: number;
}

export function cacheTtlForMarketInsight(
  insight: CacheableMarketInsight,
  successTtlMs: number,
  fallbackTtlMs: number,
) {
  return insight.isAiGenerated ? successTtlMs : fallbackTtlMs;
}

export function isMarketInsightCacheFresh(
  insight: CacheableMarketInsight,
  successTtlMs: number,
  fallbackTtlMs: number,
  now = Date.now(),
) {
  return now - insight.cachedAt < cacheTtlForMarketInsight(insight, successTtlMs, fallbackTtlMs);
}
