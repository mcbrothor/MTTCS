import axios from 'axios';
import type { FundamentalSnapshot, OHLCData } from '@/types';

function rawNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value && 'raw' in value) {
    const raw = (value as { raw?: unknown }).raw;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }
  return null;
}

function toPct(value: number | null) {
  if (value === null) return null;
  return Number((value * 100).toFixed(2));
}

export async function getYahooDailyPrice(ticker: string): Promise<OHLCData[]> {
  const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
    params: {
      range: '2y',
      interval: '1d',
      includePrePost: false,
      events: 'history',
    },
    headers: {
      'user-agent': 'MTTCS/3.0',
    },
  });

  const result = response.data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];

  // 응답 구조 방어 검증 (Yahoo 비공식 API 구조 변경 대비)
  if (!response.data?.chart) {
    throw new Error('Yahoo Finance 응답에 chart 필드가 없습니다. API 구조가 변경되었을 수 있습니다.');
  }
  if (!result || !quote || timestamps.length === 0) {
    throw new Error('Yahoo Finance에서 가격 데이터를 찾을 수 없습니다.');
  }
  if (!Array.isArray(quote.close) || !Array.isArray(quote.open)) {
    throw new Error('Yahoo Finance 가격 quote 구조가 예상과 다릅니다. API 변경을 확인하세요.');
  }

  return timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: Number(quote.open?.[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      close: Number(quote.close?.[index]),
      volume: Number(quote.volume?.[index]),
    }))
    .filter((row) =>
      Number.isFinite(row.open) &&
      Number.isFinite(row.high) &&
      Number.isFinite(row.low) &&
      Number.isFinite(row.close) &&
      Number.isFinite(row.volume)
    );
}

export async function getYahooFundamentals(ticker: string): Promise<FundamentalSnapshot | null> {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`, {
      params: {
        modules: 'financialData,defaultKeyStatistics,earningsTrend',
      },
      headers: {
        'user-agent': 'MTTCS/3.0',
      },
    });

    const result = response.data?.quoteSummary?.result?.[0];
    if (!result) return null;

    const financialData = result.financialData || {};
    const defaultKeyStatistics = result.defaultKeyStatistics || {};
    const trend =
      result.earningsTrend?.trend?.find((item: { period?: string }) => item.period === '+1q') ||
      result.earningsTrend?.trend?.[0] ||
      {};

    return {
      epsGrowthPct: toPct(rawNumber(defaultKeyStatistics.earningsQuarterlyGrowth) ?? rawNumber(trend.growth)),
      revenueGrowthPct: toPct(rawNumber(financialData.revenueGrowth)),
      roePct: toPct(rawNumber(financialData.returnOnEquity)),
      debtToEquityPct: rawNumber(financialData.debtToEquity),
      source: 'Yahoo Finance quoteSummary',
    };
  } catch {
    return null;
  }
}

export interface YahooQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  fiftyDayAverage: number;
}

export async function getYahooQuotes(symbols: string[]): Promise<YahooQuote[]> {
  if (!symbols || symbols.length === 0) return [];

  try {
    const response = await axios.get('https://query1.finance.yahoo.com/v7/finance/quote', {
      params: {
        symbols: symbols.join(','),
      },
      headers: {
        'user-agent': 'MTTCS/3.0',
      },
    });

    const result = response.data?.quoteResponse?.result || [];
    
    return result.map((item: any) => ({
      symbol: item.symbol,
      regularMarketPrice: item.regularMarketPrice || 0,
      regularMarketChangePercent: item.regularMarketChangePercent || 0,
      fiftyDayAverage: item.fiftyDayAverage || 0,
    }));
  } catch (error) {
    console.error('Yahoo Finance Quotes API Error:', error);
    return [];
  }
}

