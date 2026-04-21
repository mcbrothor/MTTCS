import type { OHLCData } from '../../../types/index.ts';
import { average, round } from './_shared.ts';

export function calculateMovingAverage(data: OHLCData[], period: number): number | null {
  if (data.length < period) return null;
  return round(average(data.slice(-period).map((d) => d.close)));
}

export function calculateATR(data: OHLCData[], period: number = 20): number {
  if (data.length < period + 1) return 0;

  const trueRanges = data.map((d, i) => {
    if (i === 0) return d.high - d.low;
    const prevClose = data[i - 1].close;
    return Math.max(
      d.high - d.low,
      Math.abs(d.high - prevClose),
      Math.abs(d.low - prevClose)
    );
  });

  return round(average(trueRanges.slice(-period)));
}

export function calculateAvgVolume(data: OHLCData[], period: number = 20): {
  avgDollarVolume: number;
  passesFilter: boolean;
} {
  if (data.length < period) return { avgDollarVolume: 0, passesFilter: false };

  const avgDollarVolume = average(data.slice(-period).map((d) => d.close * d.volume));
  return { avgDollarVolume: round(avgDollarVolume, 0), passesFilter: avgDollarVolume >= 10_000_000 };
}

export function calculateEntryPrice(data: OHLCData[], period: number = 50): number {
  if (data.length < period) return 0;
  return round(Math.max(...data.slice(-period).map((d) => d.high)));
}

export function recentSwingLow(data: OHLCData[], lookback = 20): number | null {
  if (data.length === 0) return null;
  const slice = data.slice(-lookback);
  if (slice.length === 0) return null;
  return round(Math.min(...slice.map((d) => d.low)));
}
