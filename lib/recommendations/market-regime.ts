import { BENCHMARK_BY_UNIVERSE } from './config';
import type { RecommendationCategory, RecommendationMarket } from './types';

export type RecommendationMarketState = 'GREEN' | 'YELLOW' | 'RED';
export type RecommendationMarketStateKey = RecommendationCategory;
export type RecommendationMarketStateLookupKey = RecommendationMarketStateKey | RecommendationMarket;
export type RecommendationMarketRegimeStatus = 'READY' | 'DEGRADED' | 'BLOCKED';
export type RecommendationMarketRegimeQuality = 'FULL' | 'DEGRADED' | 'MISSING' | 'INVALID';

export interface RecommendationMarketRegimeSpec {
  category: RecommendationCategory;
  market: RecommendationMarket;
  benchmarkSymbol: (typeof BENCHMARK_BY_UNIVERSE)[RecommendationCategory];
  stateKey: RecommendationMarketStateKey;
  legacyMarketStateKey: RecommendationMarket;
  allowLegacyMarketFallback: boolean;
}

export type RecommendationMarketStateInput =
  | RecommendationMarketState
  | Lowercase<RecommendationMarketState>
  | { state?: unknown }
  | null
  | undefined;

export type RecommendationMarketStateInputs = Partial<
  Record<RecommendationMarketStateLookupKey, RecommendationMarketStateInput>
>;

export type RecommendationMarketRegimeReason =
  | 'EXACT_CATEGORY_STATE'
  | 'COMPATIBLE_MARKET_FALLBACK'
  | 'CATEGORY_STATE_REQUIRED'
  | 'INVALID_CATEGORY_STATE'
  | 'INVALID_MARKET_STATE'
  | 'STATE_MISSING';

export interface RecommendationMarketRegimeResolution extends RecommendationMarketRegimeSpec {
  status: RecommendationMarketRegimeStatus;
  quality: RecommendationMarketRegimeQuality;
  effectiveState: RecommendationMarketState;
  observedState: RecommendationMarketState | null;
  sourceKey: RecommendationMarketStateLookupKey | null;
  failClosed: boolean;
  canSelect: boolean;
  reason: RecommendationMarketRegimeReason;
}

/**
 * Category state keys are deliberately distinct even when two categories share a country.
 * The legacy market fallback is compatible only when its current snapshot benchmark matches
 * the category benchmark: US uses SPY/S&P 500 and KR uses KOSPI 200.
 */
export const CATEGORY_MARKET_REGIME = {
  NASDAQ100: {
    category: 'NASDAQ100',
    market: 'US',
    benchmarkSymbol: BENCHMARK_BY_UNIVERSE.NASDAQ100,
    stateKey: 'NASDAQ100',
    legacyMarketStateKey: 'US',
    allowLegacyMarketFallback: false,
  },
  SP500: {
    category: 'SP500',
    market: 'US',
    benchmarkSymbol: BENCHMARK_BY_UNIVERSE.SP500,
    stateKey: 'SP500',
    legacyMarketStateKey: 'US',
    allowLegacyMarketFallback: true,
  },
  KOSPI200: {
    category: 'KOSPI200',
    market: 'KR',
    benchmarkSymbol: BENCHMARK_BY_UNIVERSE.KOSPI200,
    stateKey: 'KOSPI200',
    legacyMarketStateKey: 'KR',
    allowLegacyMarketFallback: true,
  },
  KOSDAQ150: {
    category: 'KOSDAQ150',
    market: 'KR',
    benchmarkSymbol: BENCHMARK_BY_UNIVERSE.KOSDAQ150,
    stateKey: 'KOSDAQ150',
    legacyMarketStateKey: 'KR',
    allowLegacyMarketFallback: false,
  },
} as const satisfies Record<RecommendationCategory, RecommendationMarketRegimeSpec>;

function stateValue(input: RecommendationMarketStateInput): RecommendationMarketState | null {
  const value = typeof input === 'string'
    ? input
    : input && typeof input === 'object'
      ? input.state
      : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized === 'GREEN' || normalized === 'YELLOW' || normalized === 'RED'
    ? normalized
    : null;
}

function isPresent(input: RecommendationMarketStateInput) {
  return input !== null && input !== undefined;
}

function blockedResolution(
  spec: RecommendationMarketRegimeSpec,
  input: {
    quality: Extract<RecommendationMarketRegimeQuality, 'DEGRADED' | 'MISSING' | 'INVALID'>;
    observedState?: RecommendationMarketState | null;
    sourceKey?: RecommendationMarketStateLookupKey | null;
    reason: Extract<
      RecommendationMarketRegimeReason,
      'CATEGORY_STATE_REQUIRED' | 'INVALID_CATEGORY_STATE' | 'INVALID_MARKET_STATE' | 'STATE_MISSING'
    >;
  },
): RecommendationMarketRegimeResolution {
  return {
    ...spec,
    status: 'BLOCKED',
    quality: input.quality,
    effectiveState: 'RED',
    observedState: input.observedState ?? null,
    sourceKey: input.sourceKey ?? null,
    failClosed: true,
    canSelect: false,
    reason: input.reason,
  };
}

export function resolveCategoryMarketRegime(input: {
  category: RecommendationCategory;
  states: RecommendationMarketStateInputs;
}): RecommendationMarketRegimeResolution {
  const spec = CATEGORY_MARKET_REGIME[input.category];
  const categoryInput = input.states[spec.stateKey];
  const categoryState = stateValue(categoryInput);

  if (categoryState) {
    return {
      ...spec,
      status: 'READY',
      quality: 'FULL',
      effectiveState: categoryState,
      observedState: categoryState,
      sourceKey: spec.stateKey,
      failClosed: false,
      canSelect: true,
      reason: 'EXACT_CATEGORY_STATE',
    };
  }
  if (isPresent(categoryInput)) {
    return blockedResolution(spec, {
      quality: 'INVALID',
      sourceKey: spec.stateKey,
      reason: 'INVALID_CATEGORY_STATE',
    });
  }

  const marketInput = input.states[spec.legacyMarketStateKey];
  const marketState = stateValue(marketInput);
  if (marketState && spec.allowLegacyMarketFallback) {
    return {
      ...spec,
      status: 'DEGRADED',
      quality: 'DEGRADED',
      effectiveState: marketState,
      observedState: marketState,
      sourceKey: spec.legacyMarketStateKey,
      failClosed: false,
      canSelect: true,
      reason: 'COMPATIBLE_MARKET_FALLBACK',
    };
  }
  if (marketState) {
    return blockedResolution(spec, {
      quality: 'DEGRADED',
      observedState: marketState,
      sourceKey: spec.legacyMarketStateKey,
      reason: 'CATEGORY_STATE_REQUIRED',
    });
  }
  if (isPresent(marketInput)) {
    return blockedResolution(spec, {
      quality: 'INVALID',
      sourceKey: spec.legacyMarketStateKey,
      reason: 'INVALID_MARKET_STATE',
    });
  }
  return blockedResolution(spec, {
    quality: 'MISSING',
    reason: 'STATE_MISSING',
  });
}

export function resolveAllCategoryMarketRegimes(states: RecommendationMarketStateInputs) {
  return Object.fromEntries(
    (Object.keys(CATEGORY_MARKET_REGIME) as RecommendationCategory[])
      .map((category) => [category, resolveCategoryMarketRegime({ category, states })]),
  ) as Record<RecommendationCategory, RecommendationMarketRegimeResolution>;
}
