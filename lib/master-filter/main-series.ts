import type { OHLCData } from '@/types';

export const MIN_MAIN_SERIES_BARS = 200;

export interface SelectedMainSeries {
  symbol: string;
  data: OHLCData[];
  fallbackUsed: boolean;
}

export function selectMainSeries(
  candidates: readonly string[],
  seriesEntries: ReadonlyArray<readonly [string, OHLCData[]]>,
  minimumBars = MIN_MAIN_SERIES_BARS,
): SelectedMainSeries | null {
  const seriesBySymbol = new Map<string, OHLCData[]>();
  for (const [symbol, data] of seriesEntries) {
    const current = seriesBySymbol.get(symbol);
    if (!current || data.length > current.length) seriesBySymbol.set(symbol, data);
  }

  for (const [index, symbol] of candidates.entries()) {
    const data = seriesBySymbol.get(symbol) || [];
    if (data.length >= minimumBars) {
      return { symbol, data, fallbackUsed: index > 0 };
    }
  }

  return null;
}
