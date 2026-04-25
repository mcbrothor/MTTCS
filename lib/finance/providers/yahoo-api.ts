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
      'user-agent': 'MTN/4.0',
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
    .map((timestamp, index) => {
      const o = quote.open?.[index];
      const h = quote.high?.[index];
      const l = quote.low?.[index];
      const c = quote.close?.[index];
      const v = quote.volume?.[index];
      
      if (o === null || h === null || l === null || c === null) return null;

      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: Number(o),
        high: Number(h),
        low: Number(l),
        close: Number(c),
        volume: Number(v),
      };
    })
    .filter((row): row is OHLCData =>
      row !== null &&
      Number.isFinite(row.open) &&
      Number.isFinite(row.high) &&
      Number.isFinite(row.low) &&
      Number.isFinite(row.close) &&
      Number.isFinite(row.volume) &&
      row.close > 0
    );
}

export async function getYahooFundamentals(ticker: string): Promise<FundamentalSnapshot | null> {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`, {
      params: {
        modules: 'financialData,defaultKeyStatistics,earningsTrend',
      },
      headers: {
        'user-agent': 'MTN/4.0',
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
      floatShares: rawNumber(defaultKeyStatistics.floatShares),
      sharesOutstanding: rawNumber(defaultKeyStatistics.sharesOutstanding),
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

export interface YahooSecurityProfile {
  symbol: string;
  name: string | null;
  exchangeName: string | null;
  currency: string | null;
  source: string;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function getYahooSearchProfile(ticker: string): Promise<YahooSecurityProfile | null> {
  try {
    const url = new URL('https://query2.finance.yahoo.com/v1/finance/search');
    url.searchParams.set('q', ticker);
    url.searchParams.set('quotesCount', '8');
    url.searchParams.set('newsCount', '0');

    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { quotes?: unknown[] };
    const quotes: unknown[] = payload.quotes || [];
    const normalizedTicker = ticker.toUpperCase();
    const exact = quotes.find((quote) => {
      if (!quote || typeof quote !== 'object') return false;
      const symbol = firstString((quote as { symbol?: unknown }).symbol);
      return symbol?.toUpperCase() === normalizedTicker;
    });
    const firstEquity = quotes.find((quote) => {
      if (!quote || typeof quote !== 'object') return false;
      const type = firstString((quote as { quoteType?: unknown }).quoteType);
      return type === 'EQUITY' || type === 'ETF';
    });
    const quote = (exact || firstEquity || quotes[0]) as Record<string, unknown> | undefined;
    if (!quote) return null;

    return {
      symbol: firstString(quote.symbol) || ticker,
      name: firstString(quote.longname, quote.shortname, quote.name),
      exchangeName: firstString(quote.exchange, quote.exchDisp),
      currency: null,
      source: 'Yahoo Finance search',
    };
  } catch {
    return null;
  }
}

export async function getYahooSecurityProfile(ticker: string): Promise<YahooSecurityProfile | null> {
  const searchProfile = await getYahooSearchProfile(ticker);
  if (searchProfile?.name) return searchProfile;

  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`, {
      params: {
        modules: 'price',
      },
      headers: {
        'user-agent': 'MTN/4.0',
      },
    });

    const price = response.data?.quoteSummary?.result?.[0]?.price;
    if (price) {
      return {
        symbol: firstString(price.symbol) || ticker,
        name: firstString(price.longName, price.shortName, price.displayName),
        exchangeName: firstString(price.exchangeName, price.fullExchangeName),
        currency: firstString(price.currency),
        source: 'Yahoo Finance quoteSummary',
      };
    }
  } catch {
    // Fall through to the chart endpoint, which is often available when quoteSummary is sparse.
  }

  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
      params: {
        range: '1d',
        interval: '1d',
      },
      headers: {
        'user-agent': 'MTN/4.0',
      },
    });

    const meta = response.data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const chartProfile = {
      symbol: firstString(meta.symbol) || ticker,
      name: firstString(meta.longName, meta.shortName),
      exchangeName: firstString(meta.exchangeName, meta.fullExchangeName),
      currency: firstString(meta.currency),
      source: 'Yahoo Finance chart',
    };

    return chartProfile.name ? chartProfile : searchProfile;
  } catch {
    return null;
  }
}

export async function getYahooQuotes(symbols: string[]): Promise<YahooQuote[]> {
  if (!symbols || symbols.length === 0) return [];

  const promises = symbols.map(async (symbol) => {
    try {
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params: {
          range: '50d',
          interval: '1d',
        },
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) return null;

      const meta = result.meta;
      const closes: number[] = result.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter((c: unknown): c is number => typeof c === 'number' && c > 0);

      const currentPrice = meta.regularMarketPrice || (validCloses.length > 0 ? validCloses[validCloses.length - 1] : 0);
      const prevClose = meta.previousClose || (validCloses.length > 1 ? validCloses[validCloses.length - 2] : currentPrice);
      const changePct = prevClose && prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

      const fiftyDayAverage = validCloses.length > 0
        ? validCloses.reduce((a: number, b: number) => a + b, 0) / validCloses.length
        : currentPrice;

      return {
        symbol: meta.symbol || symbol,
        regularMarketPrice: currentPrice,
        regularMarketChangePercent: changePct,
        fiftyDayAverage,
      } as YahooQuote;
    } catch {
      // Individual symbol failure
      return null;
    }
  });

  const results = await Promise.allSettled(promises);
  return results
    .filter((r): r is PromiseFulfilledResult<YahooQuote> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}
