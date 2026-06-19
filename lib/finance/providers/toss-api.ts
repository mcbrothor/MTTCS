import axios from 'axios';
import {
  tossInvestAccountId,
  tossInvestBaseUrl,
  tossInvestClientId,
  tossInvestClientSecret,
  tossInvestHoldingsPath,
  tossInvestProxyUrl,
  tossProxySecret,
} from '../../env';
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

interface TossHoldingResponse {
  result?: unknown;
  data?: unknown;
  holdings?: unknown;
  positions?: unknown;
}

interface TossAccountRow {
  accountNo?: string | number;
  accountSeq?: string | number;
  accountType?: string;
}

interface TossAccountsResponse {
  result?: TossAccountRow[];
}

interface TossHoldingsOptions {
  bypassProxy?: boolean;
}

export interface TossPriceQuote {
  symbol: string;
  timestamp: string | null;
  lastPrice: number;
  currency: string | null;
}

export interface TossHoldingPosition {
  symbol: string;
  name: string | null;
  quantity: number;
  avgPrice: number | null;
  currentPrice: number | null;
  evaluationAmount: number | null;
  purchaseAmount: number | null;
  profitLoss: number | null;
  profitLossRate: number | null;
  currency: string | null;
}

export interface TossHoldingsSnapshot {
  positions: TossHoldingPosition[];
  totalEquity: number | null;
  cash: number | null;
  asOf: string | null;
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
  return Boolean((tossInvestClientId() && tossInvestClientSecret()) || tossInvestProxyUrl());
}

function isTossDirectConfigured() {
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

function tossErrorCode(error: unknown) {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as {
    error?: { code?: string; message?: string } | string;
  } | undefined;
  return typeof data?.error === 'object' ? data.error?.code || null : null;
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

function clearTossTokenCache() {
  tokenCache.cachedToken = null;
  tokenCache.tokenExpiresAt = 0;
  tokenCache.pendingTokenRequest = null;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = typeof value === 'string' ? Number(value.replaceAll(',', '')) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickFirstNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const parsed = parseFiniteNumber(source[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['holdings', 'positions', 'stocks', 'items', 'balances', 'securities', 'output1']) {
    if (Array.isArray(record[key])) return record[key];
  }
  for (const nestedKey of ['result', 'data', 'body']) {
    const nested = firstArray(record[nestedKey]);
    if (nested.length > 0) return nested;
  }
  return [];
}

function summaryObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  for (const key of ['summary', 'account', 'portfolio', 'output2', 'result', 'data']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return { ...summaryObject(nested), ...(nested as Record<string, unknown>) };
    }
  }
  return record;
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

export function normalizeTossHoldings(payload: TossHoldingResponse | unknown): TossHoldingsSnapshot {
  const positions = firstArray(payload)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const rawSymbol = pickFirstString(row, [
        'symbol',
        'ticker',
        'stockCode',
        'stock_code',
        'securityCode',
        'isinCode',
        'pdno',
      ]);
      const symbol = rawSymbol?.replace(/[^0-9A-Za-z.]/g, '').toUpperCase() || null;
      const quantity = pickFirstNumber(row, [
        'quantity',
        'shares',
        'balanceQuantity',
        'holdingQuantity',
        'holdQuantity',
        'qty',
        'hldgQty',
        'hldg_qty',
      ]);
      if (!symbol || quantity === null || quantity <= 0) return null;

      const avgPrice = pickFirstNumber(row, [
        'avgPrice',
        'averagePrice',
        'averagePurchasePrice',
        'purchaseAvgPrice',
        'buyAvgPrice',
        'pchsAvgPric',
        'pchs_avg_pric',
      ]);
      const currentPrice = pickFirstNumber(row, ['currentPrice', 'lastPrice', 'price', 'marketPrice', 'prpr']);
      const evaluationAmount = pickFirstNumber(row, [
        'evaluationAmount',
        'valuationAmount',
        'marketValue',
        'evalAmount',
        'evluAmt',
        'evlu_amt',
      ]);
      const purchaseAmount = pickFirstNumber(row, [
        'purchaseAmount',
        'buyAmount',
        'costBasis',
        'pchsAmt',
        'pchs_amt',
      ]);

      return {
        symbol,
        name: pickFirstString(row, ['name', 'stockName', 'securityName', 'prdtName', 'prdt_name']),
        quantity,
        avgPrice,
        currentPrice,
        evaluationAmount,
        purchaseAmount,
        profitLoss: pickFirstNumber(row, ['profitLoss', 'pnl', 'evaluationProfitLoss', 'evluPflsAmt', 'evlu_pfls_amt']),
        profitLossRate: pickFirstNumber(row, ['profitLossRate', 'pnlRate', 'returnRate', 'evluPflsRt', 'evlu_pfls_rt']),
        currency: pickFirstString(row, ['currency', 'currencyCode', 'crcyCd', 'crcy_cd']),
      };
    })
    .filter((item): item is TossHoldingPosition => item !== null);

  const summary = summaryObject(payload);
  return {
    positions,
    totalEquity: pickFirstNumber(summary, [
      'totalEquity',
      'totalAsset',
      'totalAssets',
      'netAsset',
      'accountEvaluationAmount',
      'totEvluAmt',
      'tot_evlu_amt',
    ]),
    cash: pickFirstNumber(summary, ['cash', 'cashBalance', 'deposit', 'dncaTotAmt', 'dnca_tot_amt']),
    asOf: pickFirstString(summary, ['timestamp', 'asOf', 'baseDate', 'updatedAt']),
  };
}

async function getTossAccounts(token: string): Promise<TossAccountRow[]> {
  const response = await axios.get(`${trimTrailingSlash(tossInvestBaseUrl())}/api/v1/accounts`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  });
  const payload = response.data as TossAccountsResponse;
  return Array.isArray(payload.result) ? payload.result : [];
}

function accountCandidates(accounts: TossAccountRow[], configuredAccountId: string | null) {
  const candidates: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== 'string' && typeof value !== 'number') return;
    const normalized = String(value).trim();
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  add(configuredAccountId);
  for (const account of accounts) add(account.accountSeq);
  for (const account of accounts) add(account.accountNo);
  return candidates;
}

async function requestTossHoldings(token: string, accountId: string, market: 'US' | 'KR') {
  const path = tossInvestHoldingsPath();
  const response = await axios.get(`${trimTrailingSlash(tossInvestBaseUrl())}${path.startsWith('/') ? path : `/${path}`}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'x-tossinvest-account': accountId,
    },
    params: {
      market,
    },
  });

  return normalizeTossHoldings(response.data);
}

async function getTossHoldingsFromProxy(market: 'US' | 'KR') {
  const proxyUrl = tossInvestProxyUrl();
  if (!proxyUrl) return null;

  const url = new URL(proxyUrl);
  url.searchParams.set('market', market);
  const response = await axios.get(url.toString(), {
    headers: {
      accept: 'application/json',
      ...(tossProxySecret() ? { authorization: `Bearer ${tossProxySecret()}` } : {}),
    },
  });
  const payload = response.data as { data?: unknown };
  return normalizeTossHoldings(payload.data ?? payload);
}

export async function getTossHoldings(market: 'US' | 'KR', options: TossHoldingsOptions = {}): Promise<TossHoldingsSnapshot> {
  if (!options.bypassProxy) {
    const proxySnapshot = await getTossHoldingsFromProxy(market);
    if (proxySnapshot) return proxySnapshot;
  }

  if (!isTossDirectConfigured()) {
    throw new Error('Toss Securities Open API credentials are not configured.');
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getTossToken();
    const accountId = tossInvestAccountId();
    const accounts = await getTossAccounts(token).catch(() => []);
    const candidates = accountCandidates(accounts, accountId);

    if (candidates.length === 0) {
      throw new Error('Toss Securities holdings requires an account from /api/v1/accounts or TOSS_INVEST_ACCOUNT_ID.');
    }

    for (const candidate of candidates) {
      try {
        return await requestTossHoldings(token, candidate, market);
      } catch (error) {
        lastError = error;
        const code = tossErrorCode(error);
        if (code === 'account-not-found') continue;
        if (code === 'invalid-token' && attempt === 0) {
          clearTossTokenCache();
          break;
        }
        attempt = 2;
        break;
      }
    }
  }

  if (lastError) {
    throw new Error(`Toss Securities holdings failed: ${tossErrorMessage(lastError, 'unknown holdings error')}`);
  }
  throw new Error('Toss Securities holdings failed: no account candidates were available.');
}
