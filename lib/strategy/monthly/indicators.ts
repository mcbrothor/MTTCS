import type { MonthlyBar, MonthlyAssetDefinition } from './types';

function validBars(bars: MonthlyBar[], asOf?: string) {
  return bars
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0 && (!asOf || bar.date <= asOf))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function alignedPairs(assetBars: MonthlyBar[], benchmarkBars: MonthlyBar[], asOf?: string) {
  const benchmarkByDate = new Map(validBars(benchmarkBars, asOf).map((bar) => [bar.date, bar]));
  return validBars(assetBars, asOf).flatMap((asset) => {
    const benchmark = benchmarkByDate.get(asset.date);
    return benchmark ? [{ asset, benchmark }] : [];
  });
}

export function movingAverage(bars: MonthlyBar[], period: number, asOf?: string): number | null {
  const filtered = validBars(bars, asOf);
  if (filtered.length < period) return null;
  const window = filtered.slice(-period);
  return window.reduce((sum, bar) => sum + bar.close, 0) / period;
}

export function closeAt(bars: MonthlyBar[], asOf?: string): number | null {
  return validBars(bars, asOf).at(-1)?.close ?? null;
}

export function relativeMomentum(
  assetBars: MonthlyBar[],
  benchmarkBars: MonthlyBar[],
  lookback: number,
  asOf?: string,
): number | null {
  const pairs = alignedPairs(assetBars, benchmarkBars, asOf);
  if (pairs.length < lookback + 1) return null;
  const current = pairs.at(-1)!;
  const prior = pairs[pairs.length - lookback - 1];
  const currentRatio = current.asset.close / current.benchmark.close;
  const priorRatio = prior.asset.close / prior.benchmark.close;
  if (!Number.isFinite(currentRatio) || !Number.isFinite(priorRatio) || priorRatio <= 0) return null;
  return (currentRatio / priorRatio - 1) * 100;
}

export function absoluteMomentumSkip(
  bars: MonthlyBar[],
  lookback: number,
  skip: number,
  asOf?: string,
): number | null {
  const filtered = validBars(bars, asOf);
  if (filtered.length < lookback + 1 || skip >= lookback) return null;
  const end = filtered[filtered.length - skip - 1]?.close;
  const start = filtered[filtered.length - lookback - 1]?.close;
  if (!end || !start) return null;
  return (end / start - 1) * 100;
}

export function drawdownPct(bars: MonthlyBar[], lookback: number, asOf?: string): number | null {
  const filtered = validBars(bars, asOf);
  if (filtered.length === 0) return null;
  const window = filtered.slice(-lookback);
  const peak = Math.max(...window.map((bar) => bar.close));
  return peak > 0 ? (window.at(-1)!.close / peak - 1) * 100 : null;
}

export function calculateClusterBalancedBreadth(input: {
  universe: readonly MonthlyAssetDefinition[];
  barsByTicker: Record<string, MonthlyBar[]>;
  lookback: number;
  asOf: string;
}): { breadth: number | null; available: number; requested: number; unavailableTickers: string[] } {
  const groupVotes = new Map<string, number[]>();
  const unavailableTickers: string[] = [];
  for (const asset of input.universe) {
    const bars = input.barsByTicker[asset.ticker] || [];
    const last = validBars(bars, input.asOf).at(-1);
    const average = movingAverage(bars, input.lookback, input.asOf);
    if (!last || last.date !== input.asOf || average === null) {
      unavailableTickers.push(asset.ticker);
      continue;
    }
    const votes = groupVotes.get(asset.group) || [];
    votes.push(last.close > average ? 1 : 0);
    groupVotes.set(asset.group, votes);
  }
  const requested = input.universe.length;
  const available = requested - unavailableTickers.length;
  if (available === 0) return { breadth: null, available, requested, unavailableTickers };
  const groupScores = [...groupVotes.values()].map((votes) => votes.reduce((sum, vote) => sum + vote, 0) / votes.length);
  return {
    breadth: groupScores.reduce((sum, score) => sum + score, 0) / groupScores.length * 100,
    available,
    requested,
    unavailableTickers,
  };
}
