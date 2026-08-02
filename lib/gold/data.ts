import type { OHLCData } from '@/types';
import { getBroadDollarIndex, getDfii10, type FredObservation } from '@/lib/data/fred';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import {
  getYahooDailyPrice,
  getYahooQuotes,
  type YahooChartRange,
} from '@/lib/finance/providers/yahoo-api';
import {
  GOLD_PRODUCT_CODES,
  GOLD_PRODUCT_DEFINITIONS,
  type GoldProductCode,
  type GoldProductDefinition,
} from './api-contract';

export interface GoldProviderAttempt {
  provider: 'KIS' | 'Yahoo Finance' | 'FRED';
  status: 'SUCCESS' | 'FAILED' | 'INSUFFICIENT';
  rows: number;
  message: string | null;
}

export interface GoldPriceDataset {
  product: GoldProductDefinition;
  bars: OHLCData[];
  provider: 'KIS' | 'Yahoo Finance' | 'Unavailable';
  fallbackUsed: boolean;
  warnings: string[];
  attempts: GoldProviderAttempt[];
}

export interface GoldMacroDataset {
  realYield: FredObservation[];
  broadDollar: FredObservation[];
  complete: boolean;
  warnings: string[];
  attempts: GoldProviderAttempt[];
}

const RANGE_BARS: Record<YahooChartRange, number> = {
  '1y': 252,
  '2y': 504,
  '5y': 1_260,
  '10y': 2_520,
  max: 2_520,
};

function normalizeBars(rows: OHLCData[]) {
  const byDate = new Map<string, OHLCData>();
  for (const row of rows) {
    if (
      !row.date ||
      !Number.isFinite(row.open) ||
      !Number.isFinite(row.high) ||
      !Number.isFinite(row.low) ||
      !Number.isFinite(row.close) ||
      row.close <= 0
    ) {
      continue;
    }
    byDate.set(row.date.slice(0, 10), {
      ...row,
      date: row.date.slice(0, 10),
      volume: Number.isFinite(row.volume) ? row.volume : 0,
    });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 공급자 오류';
}

export function isGoldProductCode(value: string | null | undefined): value is GoldProductCode {
  return Boolean(value && GOLD_PRODUCT_CODES.includes(value as GoldProductCode));
}

export function requireGoldProduct(value: string | null | undefined, fallback?: GoldProductCode) {
  if (!value && fallback) return fallback;
  if (!isGoldProductCode(value)) {
    throw new Error(`지원하지 않는 금 상품입니다: ${value || '(empty)'}`);
  }
  return value;
}

export async function loadGoldProductHistory(
  productCode: GoldProductCode,
  options: {
    range?: YahooChartRange;
    targetBars?: number;
    minimumBars?: number;
  } = {},
): Promise<GoldPriceDataset> {
  const product = GOLD_PRODUCT_DEFINITIONS[productCode];
  const range = options.range || '2y';
  const targetBars = Math.max(options.targetBars || RANGE_BARS[range], 200);
  const minimumBars = Math.max(options.minimumBars || Math.min(targetBars, 200), 1);
  const attempts: GoldProviderAttempt[] = [];
  const warnings: string[] = [];

  try {
    const kisRows = normalizeBars(
      await getMarketDailyPrice(product.code, product.kisExchange, targetBars),
    );
    if (kisRows.length >= minimumBars) {
      attempts.push({ provider: 'KIS', status: 'SUCCESS', rows: kisRows.length, message: null });
      return {
        product,
        bars: kisRows.slice(-targetBars),
        provider: 'KIS',
        fallbackUsed: false,
        warnings,
        attempts,
      };
    }
    attempts.push({
      provider: 'KIS',
      status: 'INSUFFICIENT',
      rows: kisRows.length,
      message: `${minimumBars}봉 미만`,
    });
    warnings.push(`KIS ${product.code} 가격이 ${minimumBars}봉 미만이라 Yahoo를 사용했습니다.`);
  } catch (error) {
    attempts.push({
      provider: 'KIS',
      status: 'FAILED',
      rows: 0,
      message: errorMessage(error),
    });
    warnings.push(`KIS ${product.code} 가격 조회 실패로 Yahoo를 사용했습니다.`);
  }

  const yahooRows = normalizeBars(
    await getYahooDailyPrice(product.yahooTicker, { range }),
  );
  attempts.push({
    provider: 'Yahoo Finance',
    status: yahooRows.length >= minimumBars ? 'SUCCESS' : 'INSUFFICIENT',
    rows: yahooRows.length,
    message: yahooRows.length >= minimumBars ? null : `${minimumBars}봉 미만`,
  });

  return {
    product,
    bars: yahooRows.slice(-targetBars),
    provider: 'Yahoo Finance',
    fallbackUsed: true,
    warnings,
    attempts,
  };
}

export async function loadGoldMacroSeries(): Promise<GoldMacroDataset> {
  const [realYield, broadDollar] = await Promise.all([
    getDfii10(260),
    getBroadDollarIndex(260),
  ]);
  const warnings: string[] = [];
  const attempts: GoldProviderAttempt[] = [
    {
      provider: 'FRED',
      status: realYield.length >= 20 ? 'SUCCESS' : 'INSUFFICIENT',
      rows: realYield.length,
      message: realYield.length >= 20 ? null : 'DFII10 20개 관측치 미만',
    },
    {
      provider: 'FRED',
      status: broadDollar.length >= 20 ? 'SUCCESS' : 'INSUFFICIENT',
      rows: broadDollar.length,
      message: broadDollar.length >= 20 ? null : 'DTWEXBGS 20개 관측치 미만',
    },
  ];
  if (realYield.length < 20) warnings.push('FRED DFII10 관측치가 부족합니다.');
  if (broadDollar.length < 20) warnings.push('FRED DTWEXBGS 관측치가 부족합니다.');
  return {
    realYield,
    broadDollar,
    complete: realYield.length >= 20 && broadDollar.length >= 20,
    warnings,
    attempts,
  };
}

export async function loadUsdKrwRate() {
  const quotes = await getYahooQuotes(['KRW=X']);
  const rate = Number(quotes[0]?.regularMarketPrice || 0);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
