import type { OHLCData } from '@/types';

export function roundPriceMetric(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hasFinitePrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function calculateChangePercent(data: OHLCData[]) {
  const latest = data.at(-1);
  const previous = data.at(-2);

  if (!latest || !previous || !hasFinitePrice(latest.close) || !hasFinitePrice(previous.close) || previous.close <= 0) {
    return null;
  }

  return roundPriceMetric(((latest.close - previous.close) / previous.close) * 100);
}

export function calculateAdrPct(data: OHLCData[], period = 20, minBars = 5) {
  const bars = data
    .slice(-period)
    .filter((bar) => hasFinitePrice(bar.high) && hasFinitePrice(bar.low) && bar.high >= bar.low);

  if (bars.length < minBars) return null;

  const averageRange = bars.reduce((sum, bar) => sum + (bar.high - bar.low), 0) / bars.length;
  const averageMidpoint = bars.reduce((sum, bar) => sum + (bar.high + bar.low) / 2, 0) / bars.length;

  if (!Number.isFinite(averageMidpoint) || averageMidpoint <= 0) return null;

  return roundPriceMetric((averageRange / averageMidpoint) * 100);
}

export function calculatePriceMetrics(data: OHLCData[]) {
  return {
    changePercent: calculateChangePercent(data),
    adrPct: calculateAdrPct(data),
  };
}
