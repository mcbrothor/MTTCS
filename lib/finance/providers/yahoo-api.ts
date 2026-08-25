import axios from 'axios';
import type { FundamentalSnapshot, OHLCData } from '@/types';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const YAHOO_HTTP_TIMEOUT_MS = 12_000;

export interface YahooRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

let _crumbCache: { crumb: string; cookie: string; fetchedAt: number } | null = null;
let _crumbPromise: Promise<{ crumb: string; cookie: string }> | null = null;
const CRUMB_TTL_MS = 25 * 60 * 1000;

function requestSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeoutSignal]) : timeoutSignal;
}

function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Yahoo request cancelled.', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason || new DOMException('Yahoo request cancelled.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function getYahooCrumb(options: YahooRequestOptions = {}): Promise<{ crumb: string; cookie: string }> {
  if (_crumbCache && Date.now() - _crumbCache.fetchedAt < CRUMB_TTL_MS) {
    return _crumbCache;
  }
  if (_crumbPromise) return waitWithSignal(_crumbPromise, options.signal);

  _crumbPromise = (async () => {
    try {
      const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'manual',
        signal: requestSignal(options.signal, options.timeoutMs ?? YAHOO_HTTP_TIMEOUT_MS),
      });

      const setCookieHeader = cookieRes.headers.get('set-cookie') || '';
      const rawCookies = setCookieHeader.split(/,(?=\s*[^;,]+=)/);
      const cookieString = rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

      const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': BROWSER_UA,
          'Cookie': cookieString,
          'Accept': '*/*',
          'Referer': 'https://finance.yahoo.com/',
        },
        signal: requestSignal(options.signal, options.timeoutMs ?? YAHOO_HTTP_TIMEOUT_MS),
      });

      const crumb = (await crumbRes.text()).trim();
      _crumbCache = { crumb, cookie: cookieString, fetchedAt: Date.now() };
      return _crumbCache;
    } catch (err) {
      if (options.signal?.aborted) throw options.signal.reason || err;
      // Crumb fetch 실패 시 빈 crumb으로 fallback.
      // Yahoo API는 crumb 없이도 일부 엔드포인트에서 동작합니다.
      console.warn('[Yahoo API] Crumb fetch failed, using empty crumb fallback:', err instanceof Error ? err.message : err);
      const fallback = { crumb: '', cookie: '' };
      // 실패한 경우에도 짧은 TTL(5분)로 캐싱하여 반복 실패 시도를 방지
      _crumbCache = { ...fallback, fetchedAt: Date.now() - CRUMB_TTL_MS + 5 * 60 * 1000 };
      return fallback;
    }
  })();

  try {
    return await waitWithSignal(_crumbPromise, options.signal);
  } finally {
    _crumbPromise = null;
  }
}

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

export type YahooChartRange = '1y' | '2y' | '5y' | '10y' | 'max';

export interface YahooAdjustedOHLCData extends OHLCData {
  adjusted: true;
}

export async function getYahooDailyPrice(
  ticker: string,
  options: { range?: YahooChartRange } & YahooRequestOptions = {}
): Promise<OHLCData[]> {
  const { crumb, cookie } = await getYahooCrumb(options);
  const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
    params: {
      range: options.range || '2y',
      interval: '1d',
      includePrePost: false,
      events: 'history',
      crumb,
    },
    headers: {
      'User-Agent': BROWSER_UA,
      'Cookie': cookie,
      'Accept': 'application/json',
      'Referer': 'https://finance.yahoo.com/',
    },
    timeout: options.timeoutMs ?? YAHOO_HTTP_TIMEOUT_MS,
    signal: requestSignal(options.signal, options.timeoutMs ?? YAHOO_HTTP_TIMEOUT_MS),
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

/**
 * Split/dividend-adjusted daily series for signal research and backtests.
 * Execution prices must continue to use `getYahooDailyPrice`; this function
 * deliberately marks every row so callers cannot silently mix the two series.
 */
export async function getYahooAdjustedDailyPrice(
  ticker: string,
  options: { range?: YahooChartRange } = {},
): Promise<YahooAdjustedOHLCData[]> {
  const { crumb, cookie } = await getYahooCrumb();
  const range = options.range || 'max';
  const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
    params: {
      ...(range === 'max'
        ? {
            period1: 0,
            period2: Math.floor(Date.now() / 1000),
          }
        : { range }),
      interval: '1d',
      includePrePost: false,
      events: 'div,splits',
      crumb,
    },
    headers: {
      'User-Agent': BROWSER_UA,
      'Cookie': cookie,
      'Accept': 'application/json',
      'Referer': 'https://finance.yahoo.com/',
    },
  });

  const result = response.data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  const adjustedCloses = result?.indicators?.adjclose?.[0]?.adjclose;
  if (
    !result
    || !quote
    || timestamps.length === 0
    || !Array.isArray(quote.close)
    || !Array.isArray(adjustedCloses)
  ) {
    throw new Error('Yahoo Finance 조정주가 시계열을 확인할 수 없습니다.');
  }

  return timestamps
    .map((timestamp, index) => {
      const rawOpen = Number(quote.open?.[index]);
      const rawHigh = Number(quote.high?.[index]);
      const rawLow = Number(quote.low?.[index]);
      const rawClose = Number(quote.close?.[index]);
      const adjustedClose = Number(adjustedCloses[index]);
      const volume = Number(quote.volume?.[index] ?? 0);
      if (
        !Number.isFinite(rawOpen)
        || !Number.isFinite(rawHigh)
        || !Number.isFinite(rawLow)
        || !Number.isFinite(rawClose)
        || !Number.isFinite(adjustedClose)
        || rawClose <= 0
        || adjustedClose <= 0
      ) {
        return null;
      }
      const factor = adjustedClose / rawClose;
      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: rawOpen * factor,
        high: rawHigh * factor,
        low: rawLow * factor,
        close: adjustedClose,
        volume: Number.isFinite(volume) ? volume : 0,
        adjusted: true as const,
      };
    })
    .filter((row): row is YahooAdjustedOHLCData => row !== null);
}

export async function getYahooFundamentals(ticker: string): Promise<FundamentalSnapshot | null> {
  try {
    const { crumb, cookie } = await getYahooCrumb();
    const response = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`, {
      params: {
        modules: 'financialData,defaultKeyStatistics,earningsTrend,price,assetProfile',
        ...(crumb ? { crumb } : {}),
      },
      headers: {
        'User-Agent': BROWSER_UA,
        ...(cookie ? { 'Cookie': cookie } : {}),
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
      },
    });

    const result = response.data?.quoteSummary?.result?.[0];
    if (!result) return null;

    const financialData = result.financialData || {};
    const defaultKeyStatistics = result.defaultKeyStatistics || {};
    const price = result.price || {};
    const assetProfile = result.assetProfile || {};
    const trend =
      result.earningsTrend?.trend?.find((item: { period?: string }) => item.period === '+1q') ||
      result.earningsTrend?.trend?.[0] ||
      {};

    return {
      marketCap: rawNumber(price.marketCap),
      epsGrowthPct: toPct(rawNumber(defaultKeyStatistics.earningsQuarterlyGrowth) ?? rawNumber(trend.growth)),
      revenueGrowthPct: toPct(rawNumber(financialData.revenueGrowth)),
      roePct: toPct(rawNumber(financialData.returnOnEquity)),
      debtToEquityPct: rawNumber(financialData.debtToEquity),
      floatShares: rawNumber(defaultKeyStatistics.floatShares),
      sharesOutstanding: rawNumber(defaultKeyStatistics.sharesOutstanding),
      sector: typeof assetProfile.sector === 'string' ? assetProfile.sector : null,
      industry: typeof assetProfile.industry === 'string' ? assetProfile.industry : null,
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

  const { crumb, cookie } = await getYahooCrumb().catch(() => ({ crumb: '', cookie: '' }));

  const promises = symbols.map(async (symbol) => {
    try {
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params: {
          range: '50d',
          interval: '1d',
          ...(crumb ? { crumb } : {}),
        },
        headers: {
          'User-Agent': BROWSER_UA,
          ...(cookie ? { 'Cookie': cookie } : {}),
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com/',
        },
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) return null;

      const meta = result.meta;
      const closes: number[] = result.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter((c: unknown): c is number => typeof c === 'number' && c > 0);

      const currentPrice = Number.isFinite(meta.regularMarketPrice) && meta.regularMarketPrice > 0
        ? meta.regularMarketPrice
        : (validCloses.length > 0 ? validCloses[validCloses.length - 1] : 0);
      let prevClose: number;
      if (validCloses.length > 1) {
        const lastValid = validCloses[validCloses.length - 1];
        const secondLast = validCloses[validCloses.length - 2];
        // 장중(인트라데이)이면 lastValid가 전일 종가, 장 마감 후이면 currentPrice === lastValid 이므로 전전일 사용
        const isIntraday = Math.abs(currentPrice - lastValid) > 0.01;
        prevClose = isIntraday ? lastValid : secondLast;
      } else if (validCloses.length === 1) {
        prevClose = validCloses[0];
      } else {
        prevClose = currentPrice;
      }
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
