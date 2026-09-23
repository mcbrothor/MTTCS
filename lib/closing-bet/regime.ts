import type { ClosingBar } from './types';

const MAX_ESTIMATED_BARS = 2;
const MAX_ESTIMATED_VOLUME_SHARE = 0.02;

export interface ClosingRegimeBenchmark {
  lateReturnPct: number;
  vwap: number;
  estimatedTurnoverBars: number;
}

export function calculateClosingRegimeBenchmark(bars: ClosingBar[], lateTime: string): ClosingRegimeBenchmark | null {
  const late = bars.find((bar) => bar.time === lateTime);
  const latest = bars.at(-1);
  const volume = bars.reduce((sum, bar) => sum + bar.volume, 0);
  if (!late || !latest || volume <= 0) return null;

  const estimated = bars.filter((bar) => bar.turnover === null && bar.volume > 0);
  const estimatedVolume = estimated.reduce((sum, bar) => sum + bar.volume, 0);
  if (estimated.length > MAX_ESTIMATED_BARS || estimatedVolume / volume > MAX_ESTIMATED_VOLUME_SHARE) return null;

  const turnover = bars.reduce((sum, bar) => {
    if (bar.turnover !== null) return sum + bar.turnover;
    if (bar.volume === 0) return sum;
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    return sum + typicalPrice * bar.volume;
  }, 0);
  if (turnover <= 0) return null;

  return {
    lateReturnPct: (latest.close / late.open - 1) * 100,
    vwap: turnover / volume,
    estimatedTurnoverBars: estimated.length,
  };
}
