import axios from 'axios';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';
import { getKisToken } from '@/lib/finance/providers/kis-auth';
import { waitForKisRequestSlot } from '@/lib/finance/providers/kis-rate-limit';
import { CLOSING_POLICY } from './config';
import type { ClosingBar, ClosingFlow, ClosingQuote } from './types';

type KisBody = Record<string, unknown>;
type KisRow = Record<string, unknown>;
export type ClosingKisRequest = (path: string, trId: string, params: Record<string, string>) => Promise<KisBody>;
export interface ClosingSession { isOpen: boolean; open: string; close: string }

const QUOTATIONS = '/uapi/domestic-stock/v1/quotations/';
const MAX_DAILY_PAGES = 6;
const MAX_MINUTE_PAGES = 8;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const STATUS_FIELDS = ['temp_stop_yn', 'mrkt_warn_cls_code', 'short_over_yn', 'sltr_yn', 'mang_issu_cls_code'] as const;

function record(value: unknown): KisRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as KisRow : {};
}

function rows(value: unknown): KisRow[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function dateString(value: unknown): string {
  const compact = String(value ?? '').replaceAll('-', '');
  if (!/^\d{8}$/.test(compact)) return '';
  const result = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const timestamp = Date.parse(`${result}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === result ? result : '';
}

function timeString(value: unknown): string {
  const compact = String(value ?? '').replaceAll(':', '');
  if (!/^\d{6}$/.test(compact)) return '';
  const hour = Number(compact.slice(0, 2));
  const minute = Number(compact.slice(2, 4));
  const second = Number(compact.slice(4, 6));
  return hour < 24 && minute < 60 && second < 60 ? `${compact.slice(0, 2)}:${compact.slice(2, 4)}:${compact.slice(4, 6)}` : '';
}

function requireDate(date: string): string {
  const normalized = dateString(date);
  if (!normalized) throw new Error('CLOSING_KIS_INVALID_DATE');
  return normalized;
}

function requireTicker(ticker: string): string {
  if (!/^\d{6}$/.test(ticker)) throw new Error('CLOSING_KIS_INVALID_TICKER');
  return ticker;
}

function kstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * MINUTE_MS).toISOString().slice(0, 10);
}

function previousDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

function common(ticker: string): Record<string, string> {
  return { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: requireTicker(ticker) };
}

function parseBar(row: KisRow, minute: boolean): ClosingBar | null {
  const date = dateString(row.stck_bsop_date);
  const time = minute ? timeString(row.stck_cntg_hour) : undefined;
  const open = positive(row.stck_oprc);
  const high = positive(row.stck_hgpr);
  const low = positive(row.stck_lwpr);
  const close = positive(minute ? row.stck_prpr : row.stck_clpr);
  const volume = number(minute ? row.cntg_vol : row.acml_vol);
  if (!date || (minute && !time) || open === null || high === null || low === null || close === null || volume === null || volume < 0) return null;
  if (low > high || open < low || open > high || close < low || close > high) return null;
  const turnover = number(row.acml_tr_pbmn);
  return { date, ...(time ? { time } : {}), open, high, low, close, volume, turnover: turnover !== null && turnover >= 0 ? turnover : null };
}

function safeFailure(error: unknown): Error {
  if (error instanceof Error && /^CLOSING_KIS_[A-Z_]+$/.test(error.message)) return error;
  return new Error('CLOSING_KIS_REQUEST_FAILED');
}

export async function closingKisRequest(path: string, trId: string, params: Record<string, string>): Promise<KisBody> {
  if (!path.startsWith(QUOTATIONS) || !/^[A-Z0-9]+$/.test(trId)) throw new Error('CLOSING_KIS_INVALID_REQUEST');
  try {
    const token = await getKisToken({ signal: AbortSignal.timeout(CLOSING_POLICY.tokenTimeoutMs) });
    await waitForKisRequestSlot('rest', { signal: AbortSignal.timeout(CLOSING_POLICY.queueTimeoutMs) });
    const signal = AbortSignal.timeout(CLOSING_POLICY.requestTimeoutMs);
    const response = await axios.get(`${kisBaseUrl()}${path}`, {
      headers: { authorization: `Bearer ${token}`, appkey: kisAppKey(), appsecret: kisAppSecret(), tr_id: trId, custtype: 'P', 'content-type': 'application/json; charset=utf-8' },
      params, signal, timeout: CLOSING_POLICY.requestTimeoutMs,
    });
    const body = record(response.data);
    if (body.rt_cd !== '0') throw new Error(body.msg_cd === 'EGW00201' ? 'CLOSING_KIS_REQUEST_FAILED' : 'CLOSING_KIS_PROVIDER_ERROR');
    return body;
  } catch (error) {
    throw safeFailure(error);
  }
}

export function createClosingKisClient(input: {
  request?: ClosingKisRequest;
  now?: () => Date;
  sessionOverrides?: () => string | undefined;
} = {}) {
  const transport = input.request ?? closingKisRequest;
  const request: ClosingKisRequest = async (path, trId, params) => {
    for (let attempt = 0; ; attempt++) {
      try { return await transport(path, trId, params); }
      catch (error) {
        if (attempt >= 1 || !(error instanceof Error) || error.message !== 'CLOSING_KIS_REQUEST_FAILED') throw error;
        await new Promise((resolve) => setTimeout(resolve, CLOSING_POLICY.retryDelayMs));
      }
    }
  };
  const now = input.now ?? (() => new Date());
  const overrideJson = input.sessionOverrides ?? (() => process.env.CLOSING_BET_SESSION_OVERRIDES_JSON);
  const holidayCache = new Map<string, ClosingSession>();

  function configuredSession(date: string): ClosingSession | null {
    const json = overrideJson();
    if (!json) return null;
    let value: KisRow;
    try { value = record(JSON.parse(json)); } catch { throw new Error('CLOSING_KIS_INVALID_SESSION_OVERRIDE'); }
    if (!Object.hasOwn(value, date)) return null;
    const session = record(value[date]);
    const open = timeString(session.open ?? CLOSING_POLICY.open);
    const close = timeString(session.close ?? CLOSING_POLICY.close);
    if (typeof session.isOpen !== 'boolean' || !open || !close || open >= close) throw new Error('CLOSING_KIS_INVALID_SESSION_OVERRIDE');
    return { isOpen: session.isOpen, open, close };
  }

  async function getClosingSession(date: string): Promise<ClosingSession> {
    date = requireDate(date);
    const override = configuredSession(date);
    if (override) return override;
    const cacheKey = `${kstDate(now())}:${date}`;
    const cached = holidayCache.get(cacheKey);
    if (cached) return cached;
    const body = await request(`${QUOTATIONS}chk-holiday`, 'CTCA0903R', { BASS_DT: date.replaceAll('-', ''), CTX_AREA_FK: '', CTX_AREA_NK: '' });
    const calendarRows = Array.isArray(body.output) ? rows(body.output) : [record(body.output)];
    for (const row of calendarRows) {
      const day = dateString(row.bass_dt);
      if (!day || (row.opnd_yn !== 'Y' && row.opnd_yn !== 'N')) continue;
      holidayCache.set(`${kstDate(now())}:${day}`, { isOpen: row.opnd_yn === 'Y', open: CLOSING_POLICY.open, close: CLOSING_POLICY.close });
    }
    const result = holidayCache.get(cacheKey);
    if (!result) throw new Error('CLOSING_KIS_SESSION_UNAVAILABLE');
    return result;
  }

  async function getClosingDaily(ticker: string, endDate: string, count = 100): Promise<ClosingBar[]> {
    endDate = requireDate(endDate);
    if (endDate > kstDate(now())) throw new Error('CLOSING_KIS_FUTURE_DATE');
    if (!Number.isInteger(count) || count < 1 || count > 600) throw new Error('CLOSING_KIS_INVALID_COUNT');
    const found = new Map<string, ClosingBar>();
    let cursor = endDate;
    for (let page = 0; page < MAX_DAILY_PAGES && found.size < count; page++) {
      const start = new Date(Date.parse(`${cursor}T00:00:00Z`) - count * 3 * DAY_MS).toISOString().slice(0, 10);
      const body = await request(`${QUOTATIONS}inquire-daily-itemchartprice`, 'FHKST03010100', { ...common(ticker), FID_INPUT_DATE_1: start.replaceAll('-', ''), FID_INPUT_DATE_2: cursor.replaceAll('-', ''), FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '1' });
      const pageBars = rows(body.output2).map((row) => parseBar(row, false)).filter((bar): bar is ClosingBar => Boolean(bar && bar.date <= cursor && bar.date <= endDate));
      if (!pageBars.length) break;
      for (const bar of pageBars) if (!found.has(bar.date)) found.set(bar.date, bar);
      const oldest = pageBars.map((bar) => bar.date).sort()[0];
      const next = previousDate(oldest);
      if (next >= cursor) break;
      cursor = next;
    }
    return [...found.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-count);
  }

  async function getClosingMinutes(ticker: string, date: string, cutoff = CLOSING_POLICY.cutoff as string): Promise<ClosingBar[]> {
    date = requireDate(date);
    const cutoffTime = timeString(cutoff);
    if (!cutoffTime) throw new Error('CLOSING_KIS_INVALID_TIME');
    if (date > kstDate(now())) throw new Error('CLOSING_KIS_FUTURE_DATE');
    const session = configuredSession(date) ?? { isOpen: true, open: CLOSING_POLICY.open, close: CLOSING_POLICY.close };
    if (!session.isOpen) return [];
    const asOfMs = Math.min(Date.parse(`${date}T${cutoffTime}+09:00`), now().getTime());
    const openMs = Date.parse(`${date}T${session.open}+09:00`);
    if (asOfMs <= openMs) return [];
    let cursorMs = Math.min(asOfMs, Date.parse(`${date}T${session.close}+09:00`));
    const found = new Map<string, ClosingBar>();
    for (let page = 0; page < MAX_MINUTE_PAGES; page++) {
      const cursor = new Date(cursorMs + 9 * 60 * MINUTE_MS).toISOString().slice(11, 19);
      const body = await request(`${QUOTATIONS}inquire-time-dailychartprice`, 'FHKST03010230', { ...common(ticker), FID_INPUT_DATE_1: date.replaceAll('-', ''), FID_INPUT_HOUR_1: cursor.replaceAll(':', ''), FID_PW_DATA_INCU_YN: 'Y', FID_FAKE_TICK_INCU_YN: 'N' });
      // output1 contains the current quote even for historical requests; never use it.
      const pageBars = rows(body.output2).map((row) => parseBar(row, true)).filter((bar): bar is ClosingBar => Boolean(bar && bar.date === date && bar.time && bar.time <= cursor && bar.time >= session.open && bar.time <= session.close));
      if (!pageBars.length) break;
      for (const bar of pageBars) if (!found.has(bar.time!)) found.set(bar.time!, bar);
      const oldest = pageBars.map((bar) => bar.time!).sort()[0];
      const oldestMs = Date.parse(`${date}T${oldest}+09:00`);
      if (oldestMs <= openMs) break;
      const nextMs = oldestMs - MINUTE_MS;
      if (nextMs >= cursorMs) break;
      cursorMs = nextMs;
    }
    const bars = [...found.values()].sort((a, b) => a.time!.localeCompare(b.time!));
    return bars.map((bar, index) => {
      const previous = bars[index - 1];
      const baseline = previous ? previous.turnover : bar.time === session.open ? 0 : null;
      const amount = bar.turnover !== null && baseline !== null ? bar.turnover - baseline : null;
      // Cumulative amount must be differenced, then checked against this minute's actual traded prices.
      const valid = amount !== null && amount >= 0 && (bar.volume === 0 ? amount === 0 : amount >= bar.low * bar.volume && amount <= bar.high * bar.volume);
      return { ...bar, turnover: valid ? amount : null };
    }).filter((bar) => Date.parse(`${date}T${bar.time}+09:00`) + MINUTE_MS <= asOfMs);
  }

  async function getClosingQuote(ticker: string): Promise<ClosingQuote> {
    const body = await request(`${QUOTATIONS}inquire-price`, 'FHKST01010100', common(ticker));
    const row = record(body.output);
    const price = positive(row.stck_prpr);
    const open = positive(row.stck_oprc);
    const high = positive(row.stck_hgpr);
    const low = positive(row.stck_lwpr);
    const volume = number(row.acml_vol);
    const turnover = number(row.acml_tr_pbmn);
    const absoluteChange = number(row.prdy_vrss);
    const sign = String(row.prdy_vrss_sign ?? '');
    const signedChange = absoluteChange === null ? null : ['4', '5'].includes(sign) ? -Math.abs(absoluteChange) : ['1', '2'].includes(sign) ? Math.abs(absoluteChange) : sign === '3' ? 0 : null;
    const previousClose = positive(row.stck_prdy_clpr) ?? (price !== null && signedChange !== null ? price - signedChange : null);
    if (price === null || open === null || high === null || low === null || previousClose === null || previousClose <= 0 || volume === null || volume < 0 || turnover === null || turnover < 0) throw new Error('CLOSING_KIS_QUOTE_INVALID');
    const blockedReasons: string[] = [];
    const flags: Array<[string, string]> = [['temp_stop_yn', '거래정지'], ['short_over_yn', '단기과열'], ['sltr_yn', '정리매매'], ['mang_issu_cls_code', '관리종목']];
    for (const [key, label] of flags) if (Object.hasOwn(row, key) && !['N', '0', '00', ''].includes(String(row[key]))) blockedReasons.push(label);
    if (Object.hasOwn(row, 'mrkt_warn_cls_code') && !['0', '00', ''].includes(String(row.mrkt_warn_cls_code))) blockedReasons.push('시장경고');
    const receivedAt = now().toISOString();
    const sourceTime = timeString(row.stck_cntg_hour);
    const sourceDate = dateString(row.stck_bsop_date);
    const observedAt = sourceTime && sourceDate ? new Date(`${sourceDate}T${sourceTime}+09:00`).toISOString() : receivedAt;
    return { price, open, high, low, previousClose, volume, turnover, observedAt, receivedAt, sector: String(row.bstp_kor_isnm ?? '').trim() || null, blockedReasons, statusKnown: STATUS_FIELDS.every((key) => Object.hasOwn(row, key) && String(row[key]).trim() !== ''), ask: null, bid: null, askVolume: null, bidVolume: null, expectedPrice: null, executionStrength: null };
  }

  async function getClosingOrderbook(ticker: string): Promise<Partial<ClosingQuote>> {
    const [bookResult, strengthResult] = await Promise.allSettled([
      request(`${QUOTATIONS}inquire-asking-price-exp-ccn`, 'FHKST01010200', common(ticker)),
      request(`${QUOTATIONS}inquire-ccnl`, 'FHKST01010300', common(ticker)),
    ]);
    if (bookResult.status === 'rejected') throw safeFailure(bookResult.reason);
    const book = record(bookResult.value.output1);
    const expected = record(bookResult.value.output2);
    const strengthRows = strengthResult.status === 'fulfilled' ? rows(strengthResult.value.output) : [];
    const strength = strengthRows.find((row) => positive(row.tday_rltv) !== null);
    return { ask: positive(book.askp1), bid: positive(book.bidp1), askVolume: number(book.askp_rsqn1), bidVolume: number(book.bidp_rsqn1), expectedPrice: positive(expected.antc_cnpr), executionStrength: strength ? positive(strength.tday_rltv) : null };
  }

  async function getClosingFlow(ticker: string, date: string, asOf: string): Promise<ClosingFlow> {
    date = requireDate(date);
    const limit = Date.parse(asOf);
    if (!Number.isFinite(limit) || kstDate(new Date(limit)) !== date) throw new Error('CLOSING_KIS_INVALID_ASOF');
    const missing: ClosingFlow = { foreignNet: null, institutionNet: null, unit: 'SHARES', asOf: null, kind: 'MISSING', venue: 'UNKNOWN' };
    if (date > kstDate(now())) return missing;
    if (date === kstDate(now())) {
      try {
        const estimate = await request(`${QUOTATIONS}investor-trend-estimate`, 'HHPTJ04160200', { MKSC_SHRN_ISCD: requireTicker(ticker) });
        const header = record(estimate.output1);
        const candidates = rows(estimate.output2).flatMap((row) => {
          const sourceDate = dateString(row.stck_bsop_date ?? row.bsop_date ?? header.stck_bsop_date ?? header.bsop_date);
          const sourceTime = timeString(row.stck_cntg_hour ?? row.bsop_hour ?? row.bsop_hour_gb);
          const sourceAt = sourceDate && sourceTime ? Date.parse(`${sourceDate}T${sourceTime}+09:00`) : NaN;
          const foreignNet = number(row.frgn_fake_ntby_qty);
          const institutionNet = number(row.orgn_fake_ntby_qty);
          if (sourceDate !== date || !Number.isFinite(sourceAt) || sourceAt > limit || sourceAt > now().getTime() || (foreignNet === null && institutionNet === null)) return [];
          return [{ foreignNet, institutionNet, unit: 'SHARES' as const, asOf: new Date(sourceAt).toISOString(), kind: 'ESTIMATE' as const, venue: 'UNKNOWN' as const }];
        }).sort((a, b) => b.asOf.localeCompare(a.asOf));
        if (candidates[0]) return candidates[0];
      } catch {
        // An unavailable or undated estimate cannot substitute for an observed intraday signal.
      }
    }
    try {
      const body = await request(`${QUOTATIONS}inquire-investor`, 'FHKST01010900', common(ticker));
      const prior = rows(body.output).filter((row) => {
        const day = dateString(row.stck_bsop_date);
        return day && day < date && day <= previousDate(date);
      }).sort((a, b) => String(b.stck_bsop_date).localeCompare(String(a.stck_bsop_date)))[0];
      if (!prior) return missing;
      const foreignNet = number(prior.frgn_ntby_qty);
      const institutionNet = number(prior.orgn_ntby_qty);
      if (foreignNet === null && institutionNet === null) return missing;
      return { foreignNet, institutionNet, unit: 'SHARES', asOf: `${dateString(prior.stck_bsop_date)}T23:59:59+09:00`, kind: 'PREVIOUS_CONFIRMED', venue: 'KRX' };
    } catch {
      return missing;
    }
  }

  return { getClosingDaily, getClosingMinutes, getClosingQuote, getClosingOrderbook, getClosingFlow, getClosingSession };
}

const defaultClient = createClosingKisClient();
export const { getClosingDaily, getClosingMinutes, getClosingQuote, getClosingOrderbook, getClosingFlow, getClosingSession } = defaultClient;
