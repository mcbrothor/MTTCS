/**
 * CAN SLIM 풀 펀더멘털 캐시 — Supabase fundamental_cache 테이블 R/W.
 *
 * 기존 fundamental-fetcher.ts의 캐시는 FundamentalSnapshot 4개 필드만 다뤘다.
 * 023 migration으로 확장된 컬럼(분기/연간 EPS 시계열 등)을 직접 다루는 별도 모듈.
 * canslim-data-fetcher.ts가 EDGAR 라이브 호출 전에 이 캐시를 먼저 읽는다.
 *
 * 무료 인프라 가드:
 *   - 7일 freshness window (Supabase free 7일 일시정지 정책에 맞춤)
 *   - 읽기는 가능한 한 단일 IN 쿼리로 묶어 egress 절감
 */

import { supabaseServer } from '@/lib/supabase/server';
import type { CanslimStockData, MarketCode } from '@/types';

const FRESHNESS_DAYS = 7;
const STALE_TOLERATED_DAYS = 30;

export interface CachedCanslimFundamentals {
  ticker: string;
  market: MarketCode;
  data: Partial<CanslimStockData>;
  source: string;
  fetchedAt: string;          // backfilled_at (ISO)
  ageHours: number;
  isFresh: boolean;
  edgarStatus: string | null;
}

interface RawCacheRow {
  ticker: string;
  market: string;
  source: string | null;
  updated_at: string | null;
  backfilled_at: string | null;
  edgar_fetch_status: string | null;
  // 기존 컬럼 (015)
  eps_growth_pct: number | string | null;
  revenue_growth_pct: number | string | null;
  roe_pct: number | string | null;
  debt_to_equity_pct: number | string | null;
  float_shares: number | string | null;
  shares_outstanding: number | string | null;
  // 023 확장
  current_qtr_eps_growth_pct: number | string | null;
  prior_qtr_eps_growth_pct: number | string | null;
  eps_growth_last_3qtrs: (number | string | null)[] | null;
  current_qtr_sales_growth_pct: number | string | null;
  annual_eps_growth_each_year: (number | string | null)[] | null;
  had_negative_eps_in_last_3yr: boolean | null;
  shares_buyback: boolean | null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function arr3(value: unknown): (number | null)[] {
  if (!Array.isArray(value)) return [null, null, null];
  const out = value.slice(0, 3).map(num);
  while (out.length < 3) out.push(null);
  return out;
}

function ageHours(ts: string | null): number {
  if (!ts) return Number.POSITIVE_INFINITY;
  const ms = Date.now() - new Date(ts).getTime();
  return Number.isFinite(ms) ? ms / 3_600_000 : Number.POSITIVE_INFINITY;
}

function rowToCached(row: RawCacheRow): CachedCanslimFundamentals {
  const referenceTs = row.backfilled_at ?? row.updated_at;
  const hours = ageHours(referenceTs);
  const data: Partial<CanslimStockData> = {
    symbol: row.ticker,
    market: row.market as MarketCode,
    currentQtrEpsGrowth: num(row.current_qtr_eps_growth_pct) ?? num(row.eps_growth_pct),
    priorQtrEpsGrowth: num(row.prior_qtr_eps_growth_pct),
    epsGrowthLast3Qtrs: arr3(row.eps_growth_last_3qtrs),
    currentQtrSalesGrowth: num(row.current_qtr_sales_growth_pct) ?? num(row.revenue_growth_pct),
    annualEpsGrowthEachYear: arr3(row.annual_eps_growth_each_year),
    hadNegativeEpsInLast3Yr: row.had_negative_eps_in_last_3yr,
    roe: num(row.roe_pct),
    floatShares: num(row.float_shares),
    sharesBuyback: row.shares_buyback,
  };
  return {
    ticker: row.ticker,
    market: row.market as MarketCode,
    data,
    source: row.source ?? 'fundamental_cache',
    fetchedAt: referenceTs ?? new Date(0).toISOString(),
    ageHours: hours,
    isFresh: hours <= FRESHNESS_DAYS * 24,
    edgarStatus: row.edgar_fetch_status,
  };
}

/**
 * 단일 종목 read-through 캐시 조회.
 * fresh가 아니면 stale row도 반환하되 isFresh=false로 표시 → 호출부가 라이브 fetch 트리거 가능.
 */
export async function readCanslimFundamentalsFromCache(
  ticker: string,
  market: MarketCode
): Promise<CachedCanslimFundamentals | null> {
  try {
    const { data, error } = await supabaseServer
      .from('fundamental_cache')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .eq('market', market)
      .maybeSingle();
    if (error || !data) return null;
    const cached = rowToCached(data as RawCacheRow);
    if (cached.ageHours > STALE_TOLERATED_DAYS * 24) return null;
    return cached;
  } catch {
    return null;
  }
}

/**
 * 다수 종목 일괄 조회 — 배치 스캔 시 N+1 회피.
 */
export async function readCanslimFundamentalsBatch(
  tickers: string[],
  market: MarketCode
): Promise<Map<string, CachedCanslimFundamentals>> {
  const out = new Map<string, CachedCanslimFundamentals>();
  if (tickers.length === 0) return out;
  const upper = Array.from(new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean)));
  try {
    const { data, error } = await supabaseServer
      .from('fundamental_cache')
      .select('*')
      .eq('market', market)
      .in('ticker', upper);
    if (error || !data) return out;
    for (const row of data as RawCacheRow[]) {
      const cached = rowToCached(row);
      if (cached.ageHours <= STALE_TOLERATED_DAYS * 24) out.set(cached.ticker, cached);
    }
  } catch {
    /* swallow */
  }
  return out;
}

/**
 * EDGAR 백필 결과 upsert.
 * 부분 데이터(parse 실패, 값 없음)도 status를 남겨 다음 cron 실행이 재시도 여부를 알 수 있게 한다.
 */
export interface BackfillUpsertInput {
  ticker: string;
  market: MarketCode;
  source: string;
  status: 'OK' | 'NO_CIK' | 'FETCH_FAIL' | 'PARSE_FAIL' | 'EMPTY';
  errorMessage?: string | null;
  data?: Partial<CanslimStockData>;
  /** 추가 필드(기존 015 컬럼) — 가능하면 같이 채운다 */
  epsGrowthPct?: number | null;
  revenueGrowthPct?: number | null;
  roePct?: number | null;
  debtToEquityPct?: number | null;
  floatShares?: number | null;
  sharesOutstanding?: number | null;
  edgarLastFiled?: string | null;
}

export async function upsertCanslimFundamentals(input: BackfillUpsertInput) {
  const nowIso = new Date().toISOString();
  const data = input.data ?? {};
  const row = {
    ticker: input.ticker.toUpperCase(),
    market: input.market,
    source: input.source,
    updated_at: nowIso,
    backfilled_at: nowIso,
    edgar_fetch_status: input.status,
    edgar_error_message: input.errorMessage ?? null,
    edgar_last_filed: input.edgarLastFiled ?? null,
    // 기존 015 컬럼
    eps_growth_pct: input.epsGrowthPct ?? data.currentQtrEpsGrowth ?? null,
    revenue_growth_pct: input.revenueGrowthPct ?? data.currentQtrSalesGrowth ?? null,
    roe_pct: input.roePct ?? data.roe ?? null,
    debt_to_equity_pct: input.debtToEquityPct ?? null,
    float_shares: input.floatShares ?? data.floatShares ?? null,
    shares_outstanding: input.sharesOutstanding ?? null,
    // 023 확장
    current_qtr_eps_growth_pct: data.currentQtrEpsGrowth ?? null,
    prior_qtr_eps_growth_pct: data.priorQtrEpsGrowth ?? null,
    eps_growth_last_3qtrs: data.epsGrowthLast3Qtrs ?? null,
    current_qtr_sales_growth_pct: data.currentQtrSalesGrowth ?? null,
    annual_eps_growth_each_year: data.annualEpsGrowthEachYear ?? null,
    had_negative_eps_in_last_3yr: data.hadNegativeEpsInLast3Yr ?? null,
    shares_buyback: data.sharesBuyback ?? null,
  };
  const { error } = await supabaseServer
    .from('fundamental_cache')
    .upsert(row, { onConflict: 'ticker,market' });
  if (error) throw error;
  return row;
}

/**
 * Backfill cron의 cursor 조회/갱신.
 */
export interface BackfillProgress {
  wave: string;
  market: MarketCode;
  cursorOffset: number;
  universeSize: number;
  lastRunAt: string | null;
  lastRunProcessed: number;
  lastRunFailed: number;
  lastRunSkipped: number;
  lastError: string | null;
}

export async function getBackfillProgress(wave: string): Promise<BackfillProgress | null> {
  const { data, error } = await supabaseServer
    .from('fundamentals_backfill_progress')
    .select('*')
    .eq('wave', wave)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    wave: String(row.wave),
    market: row.market as MarketCode,
    cursorOffset: Number(row.cursor_offset ?? 0),
    universeSize: Number(row.universe_size ?? 0),
    lastRunAt: (row.last_run_at as string | null) ?? null,
    lastRunProcessed: Number(row.last_run_processed ?? 0),
    lastRunFailed: Number(row.last_run_failed ?? 0),
    lastRunSkipped: Number(row.last_run_skipped ?? 0),
    lastError: (row.last_error as string | null) ?? null,
  };
}

export async function updateBackfillProgress(input: {
  wave: string;
  market: MarketCode;
  cursorOffset: number;
  universeSize: number;
  processed: number;
  failed: number;
  skipped: number;
  error?: string | null;
}) {
  const { error } = await supabaseServer
    .from('fundamentals_backfill_progress')
    .upsert({
      wave: input.wave,
      market: input.market,
      cursor_offset: input.cursorOffset,
      universe_size: input.universeSize,
      last_run_at: new Date().toISOString(),
      last_run_processed: input.processed,
      last_run_failed: input.failed,
      last_run_skipped: input.skipped,
      last_error: input.error ?? null,
    }, { onConflict: 'wave' });
  if (error) throw error;
}

export const CANSLIM_FUNDAMENTAL_FRESHNESS_DAYS = FRESHNESS_DAYS;
