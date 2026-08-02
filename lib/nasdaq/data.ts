import type { OHLCData } from '@/types';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import {
  getYahooAdjustedDailyPrice,
  getYahooDailyPrice,
  getYahooQuotes,
  type YahooChartRange,
} from '@/lib/finance/providers/yahoo-api';
import { NASDAQ_PRODUCT_CODES, NASDAQ_PRODUCTS } from './policy';
import type {
  NasdaqPriceBar,
  NasdaqProductCode,
  NasdaqSeriesKind,
} from './types';

export interface NasdaqPriceDataset {
  product: NasdaqProductCode;
  series: NasdaqSeriesKind;
  bars: NasdaqPriceBar[];
  provider: 'KIS' | 'Yahoo Finance' | 'Unavailable';
  fallbackUsed: boolean;
  warnings: string[];
}

const RANGE_BARS: Record<YahooChartRange, number> = {
  '1y': 252,
  '2y': 504,
  '5y': 1_260,
  '10y': 2_520,
  max: 5_000,
};

export function isNasdaqProductCode(value: string | null | undefined): value is NasdaqProductCode {
  return Boolean(value && NASDAQ_PRODUCT_CODES.includes(value as NasdaqProductCode));
}

export function isNasdaqTacticalProduct(
  value: string | null | undefined,
): value is 'QLD' | 'TQQQ' {
  return value === 'QLD' || value === 'TQQQ';
}

function normalize(
  product: NasdaqProductCode,
  series: NasdaqSeriesKind,
  rows: readonly OHLCData[],
) {
  const byDate = new Map<string, NasdaqPriceBar>();
  for (const row of rows) {
    const date = row.date.slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || ![row.open, row.high, row.low, row.close].every(Number.isFinite)
      || row.close <= 0
    ) continue;
    byDate.set(date, {
      date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: Number.isFinite(row.volume) ? row.volume : 0,
      product,
      series,
    });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export async function loadNasdaqExecutionHistory(
  product: NasdaqProductCode,
  options: {
    range?: YahooChartRange;
    targetBars?: number;
    minimumBars?: number;
  } = {},
): Promise<NasdaqPriceDataset> {
  const definition = NASDAQ_PRODUCTS[product];
  const range = options.range ?? '2y';
  const targetBars = Math.max(options.targetBars ?? RANGE_BARS[range], 252);
  const minimumBars = Math.max(options.minimumBars ?? Math.min(targetBars, 252), 1);
  const warnings: string[] = [];
  try {
    const kis = normalize(
      product,
      'EXECUTION',
      await getMarketDailyPrice(definition.code, definition.kisExchange, targetBars),
    );
    if (kis.length >= minimumBars) {
      return {
        product,
        series: 'EXECUTION',
        bars: kis.slice(-targetBars),
        provider: 'KIS',
        fallbackUsed: false,
        warnings,
      };
    }
    warnings.push(`KIS ${product} OHLC가 ${minimumBars}봉 미만이라 Yahoo를 사용했습니다.`);
  } catch (error) {
    warnings.push(
      `KIS ${product} 조회 실패: ${error instanceof Error ? error.message : 'provider error'}`,
    );
  }
  const yahoo = normalize(
    product,
    'EXECUTION',
    await getYahooDailyPrice(definition.yahooTicker, { range }),
  );
  return {
    product,
    series: 'EXECUTION',
    bars: yahoo.slice(-targetBars),
    provider: 'Yahoo Finance',
    fallbackUsed: true,
    warnings,
  };
}

export async function loadNasdaqAdjustedHistory(
  product: NasdaqProductCode,
  options: { range?: YahooChartRange; targetBars?: number } = {},
): Promise<NasdaqPriceDataset> {
  const range = options.range ?? '10y';
  const targetBars = Math.max(options.targetBars ?? RANGE_BARS[range], 252);
  const rows = normalize(
    product,
    'ADJUSTED',
    await getYahooAdjustedDailyPrice(NASDAQ_PRODUCTS[product].yahooTicker, { range }),
  );
  return {
    product,
    series: 'ADJUSTED',
    bars: rows.slice(-targetBars),
    provider: 'Yahoo Finance',
    fallbackUsed: false,
    warnings: [],
  };
}

export async function loadUsdKrwRate() {
  const quotes = await getYahooQuotes(['KRW=X']);
  const rate = Number(quotes[0]?.regularMarketPrice || 0);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
