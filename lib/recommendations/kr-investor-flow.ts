import axios from 'axios';
import type { SupabaseClient } from '@supabase/supabase-js';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';
import { getKisToken } from '@/lib/finance/providers/kis-auth';
import { selectInvestorFlowBatch } from '@/lib/recommendations/investor-flow-batch';

export type KrInvestorFlowQuality = 'FULL' | 'STALE' | 'MISSING';

export interface KrInvestorFlowDaily {
  ticker: string;
  tradeDate: string;
  foreignNetBuyQty: number;
  institutionNetBuyQty: number;
  foreignNetBuyAmountMkrw: number;
  institutionNetBuyAmountMkrw: number;
  turnoverAmountMkrw: number;
  provider: string;
  quality: Exclude<KrInvestorFlowQuality, 'MISSING'>;
  observedAt: string;
  rawJson: Record<string, string>;
}

export interface KrInvestorFlowFeatures {
  ticker: string;
  asOfDate: string;
  latestTradeDate: string | null;
  provider: string | null;
  quality: KrInvestorFlowQuality;
  foreignNetBuyQty1d: number;
  foreignNetBuyQty3d: number;
  foreignNetBuyQty5d: number;
  institutionNetBuyQty1d: number;
  institutionNetBuyQty3d: number;
  institutionNetBuyQty5d: number;
  foreignNetBuyAmountMkrw1d: number;
  foreignNetBuyAmountMkrw3d: number;
  foreignNetBuyAmountMkrw5d: number;
  institutionNetBuyAmountMkrw1d: number;
  institutionNetBuyAmountMkrw3d: number;
  institutionNetBuyAmountMkrw5d: number;
  foreignNetBuyDays3d: number;
  institutionNetBuyDays3d: number;
  turnoverAmountMkrw5d: number;
  foreignNetBuyRatio5d: number | null;
  institutionNetBuyRatio5d: number | null;
  combinedNetBuyRatio5d: number | null;
}

export interface KrInvestorFlowProvider {
  readonly name: string;
  fetchDaily(ticker: string, asOfDate: string): Promise<KrInvestorFlowDaily[]>;
}

type KisFlowRow = Record<string, unknown>;
type KisRequest = (input: { path: string; trId: string; params: Record<string, string> }) => Promise<unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? '0').replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  const compact = String(value ?? '').replaceAll('-', '');
  return /^\d{8}$/.test(compact)
    ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    : '';
}

export function parseKisInvestorFlowRows(input: {
  ticker: string;
  rows: KisFlowRow[];
  provider: string;
  observedAt?: string;
}): KrInvestorFlowDaily[] {
  const observedAt = input.observedAt || new Date().toISOString();
  const byDate = new Map<string, KrInvestorFlowDaily>();
  for (const row of input.rows) {
    const tradeDate = dateValue(row.stck_bsop_date);
    if (!tradeDate) continue;
    const rawJson = {
      stck_bsop_date: String(row.stck_bsop_date ?? ''),
      frgn_ntby_qty: String(row.frgn_ntby_qty ?? '0'),
      orgn_ntby_qty: String(row.orgn_ntby_qty ?? '0'),
      frgn_ntby_tr_pbmn: String(row.frgn_ntby_tr_pbmn ?? '0'),
      orgn_ntby_tr_pbmn: String(row.orgn_ntby_tr_pbmn ?? '0'),
      acml_tr_pbmn: String(row.acml_tr_pbmn ?? '0'),
      prsn_shnu_tr_pbmn: String(row.prsn_shnu_tr_pbmn ?? '0'),
      frgn_shnu_tr_pbmn: String(row.frgn_shnu_tr_pbmn ?? '0'),
      orgn_shnu_tr_pbmn: String(row.orgn_shnu_tr_pbmn ?? '0'),
    };
    const reportedTurnover = numberValue(row.acml_tr_pbmn);
    const derivedTurnover = numberValue(row.prsn_shnu_tr_pbmn)
      + numberValue(row.frgn_shnu_tr_pbmn)
      + numberValue(row.orgn_shnu_tr_pbmn);
    byDate.set(tradeDate, {
      ticker: input.ticker,
      tradeDate,
      foreignNetBuyQty: numberValue(row.frgn_ntby_qty),
      institutionNetBuyQty: numberValue(row.orgn_ntby_qty),
      foreignNetBuyAmountMkrw: numberValue(row.frgn_ntby_tr_pbmn),
      institutionNetBuyAmountMkrw: numberValue(row.orgn_ntby_tr_pbmn),
      turnoverAmountMkrw: Math.max(0, reportedTurnover || derivedTurnover),
      provider: input.provider,
      quality: 'FULL',
      observedAt,
      rawJson,
    });
  }
  return [...byDate.values()].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

async function defaultKisRequest(input: { path: string; trId: string; params: Record<string, string> }) {
  const token = await getKisToken();
  const response = await axios.get(`${kisBaseUrl()}${input.path}`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: kisAppKey(),
      appsecret: kisAppSecret(),
      tr_id: input.trId,
      custtype: 'P',
    },
    params: input.params,
  });
  if (response.data?.rt_cd !== '0') throw new Error(response.data?.msg1 || 'KIS investor flow request failed.');
  return response.data;
}

function retryable(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status || 0;
  return status === 429 || status >= 500;
}

async function requestWithRetry(request: KisRequest, input: Parameters<KisRequest>[0]) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request(input);
    } catch (error) {
      if (attempt >= 2 || !retryable(error)) throw error;
      await sleep(250 * (attempt + 1));
    }
  }
}

function outputRows(response: unknown) {
  const body = response as { output?: KisFlowRow[]; output2?: KisFlowRow[] };
  if (Array.isArray(body.output)) return body.output;
  if (Array.isArray(body.output2)) return body.output2;
  return [];
}

export function createKisKrInvestorFlowProvider(request: KisRequest = defaultKisRequest): KrInvestorFlowProvider {
  return {
    name: 'KIS_INQUIRE_INVESTOR',
    async fetchDaily(ticker, asOfDate) {
      const common = { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: ticker };
      try {
        const response = await requestWithRetry(request, {
          path: '/uapi/domestic-stock/v1/quotations/inquire-investor',
          trId: 'FHKST01010900',
          params: common,
        });
        const rows = parseKisInvestorFlowRows({ ticker, rows: outputRows(response), provider: 'KIS_INQUIRE_INVESTOR' });
        if (rows.length > 0) return rows;
      } catch {
        // The daily endpoint below is the documented fallback.
      }

      const response = await requestWithRetry(request, {
        path: '/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily',
        trId: 'FHPTJ04160001',
        params: {
          ...common,
          FID_INPUT_DATE_1: (() => {
            const start = new Date(`${asOfDate}T00:00:00Z`);
            start.setUTCDate(start.getUTCDate() - 45);
            return start.toISOString().slice(0, 10).replaceAll('-', '');
          })(),
          FID_INPUT_DATE_2: asOfDate.replaceAll('-', ''),
        },
      });
      return parseKisInvestorFlowRows({ ticker, rows: outputRows(response), provider: 'KIS_INVESTOR_TRADE_DAILY' });
    },
  };
}

function sum(rows: KrInvestorFlowDaily[], key: keyof KrInvestorFlowDaily, count: number) {
  return rows.slice(-count).reduce((total, row) => total + Number(row[key] || 0), 0);
}

export function buildKrInvestorFlowFeatures(input: {
  ticker: string;
  asOfDate: string;
  recommendationAt?: string;
  rows: KrInvestorFlowDaily[];
  benchmarkTradeDates?: string[];
}): KrInvestorFlowFeatures {
  const rows = input.rows
    .filter((row) => row.ticker === input.ticker
      && row.tradeDate <= input.asOfDate
      && (!input.recommendationAt || row.observedAt <= input.recommendationAt))
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const latest = rows.at(-1);
  const benchmarkDates = [...new Set(input.benchmarkTradeDates || [])]
    .filter((date) => date <= input.asOfDate)
    .sort();
  const latestBenchmarkIndex = benchmarkDates.length - 1;
  const flowBenchmarkIndex = latest ? benchmarkDates.indexOf(latest.tradeDate) : -1;
  const stale = Boolean(latest && benchmarkDates.length > 0 && (flowBenchmarkIndex < 0 || latestBenchmarkIndex - flowBenchmarkIndex > 1));
  const turnover5d = sum(rows, 'turnoverAmountMkrw', 5);
  const foreignAmount5d = sum(rows, 'foreignNetBuyAmountMkrw', 5);
  const institutionAmount5d = sum(rows, 'institutionNetBuyAmountMkrw', 5);
  const ratio = (value: number) => turnover5d > 0 ? (value / turnover5d) * 100 : null;

  return {
    ticker: input.ticker,
    asOfDate: input.asOfDate,
    latestTradeDate: latest?.tradeDate || null,
    provider: latest?.provider || null,
    quality: !latest ? 'MISSING' : stale ? 'STALE' : 'FULL',
    foreignNetBuyQty1d: sum(rows, 'foreignNetBuyQty', 1),
    foreignNetBuyQty3d: sum(rows, 'foreignNetBuyQty', 3),
    foreignNetBuyQty5d: sum(rows, 'foreignNetBuyQty', 5),
    institutionNetBuyQty1d: sum(rows, 'institutionNetBuyQty', 1),
    institutionNetBuyQty3d: sum(rows, 'institutionNetBuyQty', 3),
    institutionNetBuyQty5d: sum(rows, 'institutionNetBuyQty', 5),
    foreignNetBuyAmountMkrw1d: sum(rows, 'foreignNetBuyAmountMkrw', 1),
    foreignNetBuyAmountMkrw3d: sum(rows, 'foreignNetBuyAmountMkrw', 3),
    foreignNetBuyAmountMkrw5d: foreignAmount5d,
    institutionNetBuyAmountMkrw1d: sum(rows, 'institutionNetBuyAmountMkrw', 1),
    institutionNetBuyAmountMkrw3d: sum(rows, 'institutionNetBuyAmountMkrw', 3),
    institutionNetBuyAmountMkrw5d: institutionAmount5d,
    foreignNetBuyDays3d: rows.slice(-3).filter((row) => row.foreignNetBuyAmountMkrw > 0).length,
    institutionNetBuyDays3d: rows.slice(-3).filter((row) => row.institutionNetBuyAmountMkrw > 0).length,
    turnoverAmountMkrw5d: turnover5d,
    foreignNetBuyRatio5d: ratio(foreignAmount5d),
    institutionNetBuyRatio5d: ratio(institutionAmount5d),
    combinedNetBuyRatio5d: ratio(foreignAmount5d + institutionAmount5d),
  };
}

export async function collectKrInvestorFlows(input: {
  tickers: string[];
  asOfDate: string;
  provider?: KrInvestorFlowProvider;
  concurrency?: number;
  intervalMs?: number;
  batchSize?: number;
  cursor?: number;
}) {
  const provider = input.provider || createKisKrInvestorFlowProvider();
  const { allTickers, cursor, tickers, nextCursor } = selectInvestorFlowBatch(input);
  const results = new Map<string, KrInvestorFlowDaily[]>();
  const errors = new Map<string, string>();
  let index = 0;
  let nextStartAt = 0;
  const reserve = async () => {
    const wait = Math.max(0, nextStartAt - Date.now());
    nextStartAt = Math.max(nextStartAt, Date.now()) + (input.intervalMs ?? 250);
    if (wait > 0) await sleep(wait);
  };
  const worker = async () => {
    while (index < tickers.length) {
      const ticker = tickers[index++];
      await reserve();
      try {
        results.set(ticker, await provider.fetchDaily(ticker, input.asOfDate));
      } catch (error) {
        errors.set(ticker, error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 2, tickers.length) }, worker));
  return {
    provider: provider.name,
    tickers,
    results,
    errors,
    cursor,
    nextCursor,
    totalTickers: allTickers.length,
  };
}

export async function upsertKrInvestorFlowDaily(client: SupabaseClient, rows: KrInvestorFlowDaily[]) {
  if (rows.length === 0) return 0;
  const payload = rows.map((row) => ({
    ticker: row.ticker,
    trade_date: row.tradeDate,
    foreign_net_buy_qty: row.foreignNetBuyQty,
    institution_net_buy_qty: row.institutionNetBuyQty,
    foreign_net_buy_amount_mkrw: row.foreignNetBuyAmountMkrw,
    institution_net_buy_amount_mkrw: row.institutionNetBuyAmountMkrw,
    turnover_amount_mkrw: row.turnoverAmountMkrw,
    provider: row.provider,
    quality: row.quality,
    observed_at: row.observedAt,
    raw_json: row.rawJson,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await client.from('kr_investor_flow_daily').upsert(payload, { onConflict: 'ticker,trade_date,provider' });
  if (error) throw error;
  return rows.length;
}
