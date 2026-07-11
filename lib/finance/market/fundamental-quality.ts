import type { FundamentalSnapshot } from '@/types';

export function hasCoreFundamentalCoverage(snapshot: FundamentalSnapshot | null) {
  return Boolean(snapshot
    && snapshot.epsGrowthPct !== null
    && snapshot.revenueGrowthPct !== null
    && snapshot.roePct !== null);
}

export function mergeFundamentalFallback(
  current: FundamentalSnapshot | null,
  fallback: FundamentalSnapshot | null,
): FundamentalSnapshot | null {
  if (!current) return fallback;
  if (!fallback) return current;
  return {
    ...fallback,
    ...current,
    marketCap: current.marketCap ?? fallback.marketCap ?? null,
    epsGrowthPct: current.epsGrowthPct ?? fallback.epsGrowthPct,
    revenueGrowthPct: current.revenueGrowthPct ?? fallback.revenueGrowthPct,
    roePct: current.roePct ?? fallback.roePct,
    debtToEquityPct: current.debtToEquityPct ?? fallback.debtToEquityPct,
    floatShares: current.floatShares ?? fallback.floatShares ?? null,
    sharesOutstanding: current.sharesOutstanding ?? fallback.sharesOutstanding ?? null,
    sector: current.sector ?? fallback.sector ?? null,
    industry: current.industry ?? fallback.industry ?? null,
    source: `${current.source} + ${fallback.source} cache fallback`,
  };
}
