import axios from 'axios';
import { tossInvestBaseUrl, tossInvestClientId, tossInvestClientSecret } from '../../env';
import type { OHLCData } from '../../../types';

interface TossTokenCache {
  cachedToken: string | null;
  tokenExpiresAt: number;
  pendingTokenRequest: Promise<string> | null;
}

interface TossTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number | string;
}

interface TossCandleRow {
  timestamp?: string;
  openPrice?: number | string;
  highPrice?: number | string;
  lowPrice?: number | string;
  closePrice?: number | string;
  volume?: number | string;
}

interface TossCandleResponse {
  result?: {
    candles?: TossCandleRow[];
    nextBefore?: string | null;
  };
}

interface TossPriceRow {
  symbol?: string;
  timestamp?: string | null;
  lastPrice?: number | string;
  currency?: string;
}

interface TossPricesResponse {
  result?: TossPriceRow[];
}

export interface TossPriceQuote {
  symbol: string;
  timestamp: string | null;
  lastPrice: number;
  currency: string | null;
}

const TOKEN_EXPIRY_SAFETY_MS = 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;
const TOSS_CANDLE_PAGE_SIZE = 200;
const TOSS_CANDLE_PAGE_DELAY_MS = 220;
const TOSS_MARKET_DATA_DELAY_MS = 120;

declare global {
  var __mtnTossTokenCache: TossTokenCache | undefined;
}

const tokenCache = globalThis.__mtnTossTokenCache ?? {
  cachedToken: null,
  tokenExpiresAt: 0,
  pendingTokenRequest: null,
};

globalThis.__mtnTossTokenCache = tokenCache;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function isTossInvestConfigured() {
  return Boolean(tossInvestClientId() && tossInvestClientSecret());
}

function getCredentials() {
  const clientId = tossInvestClientId();
  const clientSecret = tossInvestClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('Toss Securities Open API credentials are not configured.');
  }
  return { clientId, clientSecret };
}

function tokenExpiresAt(payload: TossTokenResponse, now: number) {
  const expiresInSeconds = Number(payload.expires_in);
  if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    return now + expiresInSeconds * 1000 - TOKEN_EXPIRY_SAFETY_MS;
  }
  return now + DEFAULT_TOKEN_TTL_MS;
}

function tossErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : fallback;

  const data = error.response?.data as {
    error?: { code?: string; message?: string } | string;
    error_description?: string;
  } | undefined;

  if (typeof data?.error === 'object' && data.error?.message) {
    return data.error.code ? `${data.error.code}: ${data.error.message}` : data.error.message;
  }
  if (typeof data?.error === 'string') {
    return data.error_description ? `${data.error}: ${data.error_description}` : data.error;
  }
  return error.message || fallback;
}

async function getTossToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache.cachedToken && now < tokenCache.tokenExpiresAt) {
    return tokenCache.cachedToken;
  }

  if (tokenCache.pendingTokenRequest) {
    return tokenCache.pendingTokenRequest;
  }

  tokenCache.pendingTokenRequest = (async () => {
    const { clientId, clientSecret } = getCredentials();
    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);

    try {
      const response = await axios.post(`${trimTrailingSlash(tossInvestBaseUrl())}/oauth2/token`, body, {
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      });

      const payload = response.data as TossTokenResponse;
      if (!payload.access_token) {
        throw new Error('Toss Securities token response did not include access_token.');
      }

      tokenCache.cachedToken = payload.access_token;
      tokenCache.tokenExpiresAt = tokenExpiresAt(payload, Date.now());
      return tokenCache.cachedToken;
    } catch (error) {
      throw new Error(`Toss Securities authentication failed: ${tossErrorMessage(error, 'unknown auth error')}`);
    }
  })();

  try {
    return await tokenCache.pendingTokenRequest;
  } finally {
    tokenCache.pendingTokenRequest = null;
  }
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = typeof value === 'string' ? Number(value.replaceAll(',', '')) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestampDate(timestamp: string | undefined) {
  if (!timestamp) return null;
  const datePart = timestamp.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (datePart) return datePart.replaceAll('-', '');

  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function sortAndDedupe(data: OHLCData[]) {
  const byDate = new Map<string, OHLCData>();
  for (const bar of data) {
    if (bar.date && Number.isFinite(bar.close)) byDate.set(bar.date.replaceAll('-', ''), { ...bar, date: bar.date.replaceAll('-', '') });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeTossCandles(candles: TossCandleRow[]): OHLCData[] {
  return candles
    .map((item) => {
      const date = normalizeTimestampDate(item.timestamp);
      const open = parseFiniteNumber(item.openPrice);
      const high = parseFiniteNumber(item.highPrice);
      const low = parseFiniteNumber(item.lowPrice);
      const close = parseFiniteNumber(item.closePrice);
      const volume = parseFiniteNumber(item.volume);
      if (!date || open === null || high === null || low === null || close === null || volume === null) return null;
      return { date, open, high, low, close, volume };
    })
    .filter((item): item is OHLCData =>
      item !== null &&
      Number.isFinite(item.open) &&
      Number.isFinite(item.high) &&
      Number.isFinite(item.low) &&
      Number.isFinite(item.close) &&
      Number.isFinite(item.volume) &&
      item.close > 0
    );
}

export async function getTossDailyPrice(symbol: string, targetBars = 260): Promise<OHLCData[]> {
  const token = await getTossToken();
  const collected: OHLCData[] = [];
  let before: string | undefined;
  const maxPages = Math.ceil(targetBars / TOSS_CANDLE_PAGE_SIZE) + 2;

  for (let page = 0; page < maxPages; page += 1) {
    if (page > 0) await sleep(TOSS_CANDLE_PAGE_DELAY_MS);

    const count = Math.min(TOSS_CANDLE_PAGE_SIZE, Math.max(1, targetBars - collected.length));
    const response = await axios.get(`${trimTrailingSlash(tossInvestBaseUrl())}/api/v1/candles`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      params: {
        symbol,
        interval: '1d',
        count,
        adjusted: true,
        ...(before ? { before } : {}),
      },
    });

    const payload = response.data as TossCandleResponse;
    const pageData = normalizeTossCandles(payload.result?.candles || []);
    if (pageData.length === 0) break;

    collected.push(...pageData);
    const merged = sortAndDedupe(collected);
    if (merged.length >= targetBars) return merged.slice(-targetBars);

    const nextBefore = payload.result?.nextBefore || undefined;
    if (!nextBefore || nextBefore === before) break;
    before = nextBefore;
  }

  return sortAndDedupe(collected);
}

export async function getTossPrices(symbols: string[]): Promise<TossPriceQuote[]> {
  const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
  if (uniqueSymbols.length === 0) return [];

  const token = await getTossToken();
  const results: TossPriceQuote[] = [];

  for (let index = 0; index < uniqueSymbols.length; index += 200) {
    if (index > 0) await sleep(TOSS_MARKET_DATA_DELAY_MS);
    const chunk = uniqueSymbols.slice(index, index + 200);
    const response = await axios.get(`${trimTrailingSlash(tossInvestBaseUrl())}/api/v1/prices`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      params: {
        symbols: chunk.join(','),
      },
    });

    const payload = response.data as TossPricesResponse;
    for (const row of payload.result || []) {
      const lastPrice = parseFiniteNumber(row.lastPrice);
      if (!row.symbol || lastPrice === null) continue;
      results.push({
        symbol: row.symbol,
        timestamp: row.timestamp || null,
        lastPrice,
        currency: row.currency || null,
      });
    }
  }

  return results;
}
