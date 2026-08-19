import type { AllocationRecommendation } from '@/types';

export const HAA_OFFENSIVE_UNIVERSE = ['SPY', 'IWM', 'VEA', 'VWO', 'VNQ', 'DBC'] as const;
export const HAA_DEFENSIVE_UNIVERSE = ['TLT', 'HYG', 'LQD', 'IEF', 'EMB', 'BNDX', 'BWX'] as const;
export const HAA_CANARY = 'TIP' as const;
export const HAA_CASH = 'BIL' as const;
const MODEL_VERSION = 'haa-v1';

export interface MonthlyPrice {
  date: string;
  close: number;
}

export function calculateHaaMomentum(prices: MonthlyPrice[]) {
  const sorted = [...prices].filter((row) => row.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 13) return null;
  const latest = sorted.at(-1)!.close;
  const returns = [1, 3, 6, 12].map((months) => (latest / sorted[sorted.length - 1 - months].close) - 1);
  return returns.reduce((sum, value) => sum + value, 0) / returns.length;
}

function nextMonthEnd(asOf: string) {
  const date = new Date(`${asOf.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0)).toISOString().slice(0, 10);
}

export function calculateHaaAllocation(input: {
  monthlyPrices: Record<string, MonthlyPrice[]>;
  asOf: string;
  provider: string;
  accountValue?: number | null;
  currentWeightsPct?: Record<string, number | null | undefined>;
}): AllocationRecommendation {
  const allTickers = [...HAA_OFFENSIVE_UNIVERSE, ...HAA_DEFENSIVE_UNIVERSE, HAA_CANARY, HAA_CASH];
  const momentum = Object.fromEntries(allTickers.map((ticker) => [ticker, calculateHaaMomentum(input.monthlyPrices[ticker] || [])]));
  const missing = allTickers.filter((ticker) => momentum[ticker] === null);
  const warnings = missing.length > 0 ? [`13개월 미만 데이터: ${missing.join(', ')}`] : [];
  const canary = momentum[HAA_CANARY];
  if (canary === null || momentum[HAA_CASH] === null) {
    return {
      asOf: input.asOf,
      provider: input.provider,
      quality: 'BLOCKED',
      modelVersion: MODEL_VERSION,
      warnings,
      strategy: 'HAA',
      regime: 'BLOCKED',
      canaryTicker: HAA_CANARY,
      canaryMomentum: canary,
      accountValue: input.accountValue ?? null,
      targets: [],
      nextReviewAt: nextMonthEnd(input.asOf),
      autoOrder: false,
    };
  }

  const selected = canary > 0
    ? HAA_OFFENSIVE_UNIVERSE
      .filter((ticker) => momentum[ticker] !== null)
      .sort((a, b) => (momentum[b] ?? -Infinity) - (momentum[a] ?? -Infinity))
      .slice(0, 4)
    : HAA_DEFENSIVE_UNIVERSE
      .filter((ticker) => momentum[ticker] !== null && (momentum[ticker] as number) > (momentum[HAA_CASH] as number))
      .sort((a, b) => (momentum[b] ?? -Infinity) - (momentum[a] ?? -Infinity))
      .slice(0, 3);
  const targets = selected.length > 0 ? selected : [HAA_CASH];
  const targetWeightPct = 100 / targets.length;
  const accountValue = input.accountValue ?? null;

  return {
    asOf: input.asOf,
    provider: input.provider,
    quality: missing.length === 0 ? 'FULL' : 'DEGRADED',
    modelVersion: MODEL_VERSION,
    warnings,
    strategy: 'HAA',
    regime: canary > 0 ? 'RISK_ON' : 'RISK_OFF',
    canaryTicker: HAA_CANARY,
    canaryMomentum: Math.round(canary * 10_000) / 100,
    accountValue,
    targets: targets.map((ticker) => {
      const currentWeightPct = input.currentWeightsPct?.[ticker] ?? null;
      const targetAmount = accountValue === null ? null : accountValue * targetWeightPct / 100;
      const currentAmount = accountValue === null || currentWeightPct === null ? null : accountValue * currentWeightPct / 100;
      return {
        ticker,
        sleeve: ticker === HAA_CASH ? 'CASH' : HAA_OFFENSIVE_UNIVERSE.includes(ticker as typeof HAA_OFFENSIVE_UNIVERSE[number]) ? 'OFFENSIVE' : 'DEFENSIVE',
        momentum: momentum[ticker] === null ? null : Math.round((momentum[ticker] as number) * 10_000) / 100,
        targetWeightPct: Math.round(targetWeightPct * 100) / 100,
        currentWeightPct,
        targetAmount,
        changeAmount: targetAmount === null || currentAmount === null ? null : targetAmount - currentAmount,
      };
    }),
    nextReviewAt: nextMonthEnd(input.asOf),
    autoOrder: false,
  };
}
