import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import type { OHLCData } from '@/types';

const MASTER_FILTER_MINIMUM_BARS = 200;
const MASTER_FILTER_TARGET_BARS = 260;

export interface MasterFilterPriceDependencies {
  getYahooDailyPrice(symbol: string): Promise<OHLCData[]>;
  getMarketDailyPrice(symbol: string, exchange: string, targetBars?: number): Promise<OHLCData[]>;
}

const defaultDependencies: MasterFilterPriceDependencies = {
  getYahooDailyPrice,
  getMarketDailyPrice,
};

function kisSymbolForYahooSymbol(symbol: string) {
  return /^(\d{6})\.KS$/.exec(symbol)?.[1] ?? null;
}

export async function getMasterFilterDailyPrice(
  symbol: string,
  dependencies: MasterFilterPriceDependencies = defaultDependencies,
): Promise<OHLCData[]> {
  let yahooHistory: OHLCData[] = [];
  try {
    yahooHistory = await dependencies.getYahooDailyPrice(symbol);
  } catch {
    // A provider failure is recoverable for Korean exchange-traded symbols.
  }

  if (yahooHistory.length >= MASTER_FILTER_MINIMUM_BARS) return yahooHistory;

  const kisSymbol = kisSymbolForYahooSymbol(symbol);
  if (!kisSymbol) return yahooHistory;

  try {
    const kisHistory = await dependencies.getMarketDailyPrice(kisSymbol, 'KOSPI', MASTER_FILTER_TARGET_BARS);
    return kisHistory.length > yahooHistory.length ? kisHistory : yahooHistory;
  } catch {
    return yahooHistory;
  }
}

export function selectFreshestSufficientHistory(
  symbols: string[],
  prices: ReadonlyMap<string, OHLCData[]>,
  minimumBars = MASTER_FILTER_MINIMUM_BARS,
) {
  return symbols
    .filter((symbol) => (prices.get(symbol)?.length ?? 0) >= minimumBars)
    .sort((left, right) => {
      const leftDate = prices.get(left)?.at(-1)?.date ?? '';
      const rightDate = prices.get(right)?.at(-1)?.date ?? '';
      return rightDate.localeCompare(leftDate);
    })[0];
}
