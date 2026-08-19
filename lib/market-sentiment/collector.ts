import axios from 'axios';
import type { SupabaseClient } from '@supabase/supabase-js';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';
import { getKisToken } from '@/lib/finance/providers/kis-auth';
import { waitForKisRequestSlot } from '@/lib/finance/providers/kis-rate-limit';

type KisRow = Record<string, unknown>;
type KisRequest = (input: { path: string; trId: string; params: Record<string, string> }) => Promise<Record<string, unknown>>;

export interface MarketSentimentCollection {
  asOf: string | null;
  provider: string;
  indexRows: number;
  putCall: number | null;
  warnings: string[];
}

function numeric(value: unknown) {
  const parsed = Number(String(value ?? '').replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown) {
  const compact = String(value ?? '').replaceAll('-', '');
  return /^\d{8}$/.test(compact)
    ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    : null;
}

async function defaultKisRequest(input: Parameters<KisRequest>[0]) {
  await waitForKisRequestSlot('rest');
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
    timeout: 15_000,
  });
  if (response.data?.rt_cd !== '0') throw new Error(response.data?.msg1 || 'KIS market sentiment request failed.');
  return response.data as Record<string, unknown>;
}

export function parseKisIndexRows(rows: KisRow[]) {
  const byDate = new Map<string, { tradeDate: string; indexClose: number }>();
  for (const row of rows) {
    const tradeDate = isoDate(row.stck_bsop_date);
    const indexClose = numeric(row.bstp_nmix_prpr);
    if (tradeDate && indexClose !== null && indexClose > 0) byDate.set(tradeDate, { tradeDate, indexClose });
  }
  return [...byDate.values()].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

export function calculatePutCallVolumeRatio(callRows: KisRow[], putRows: KisRow[]) {
  const sumVolume = (rows: KisRow[]) => rows.reduce((sum, row) => sum + Math.max(0, numeric(row.acml_vol) || 0), 0);
  const callVolume = sumVolume(callRows);
  const putVolume = sumVolume(putRows);
  return callVolume > 0 ? putVolume / callVolume : null;
}

export async function getKisKospiIndexHistory(input: {
  request?: KisRequest;
  targetBars?: number;
  endDate?: string;
} = {}) {
  const request = input.request || defaultKisRequest;
  const targetBars = Math.max(126, input.targetBars || 320);
  const startDate = '20200101';
  let cursorDate = (input.endDate || new Date().toISOString().slice(0, 10)).replaceAll('-', '');
  const collected: KisRow[] = [];
  for (let page = 0; page < Math.ceil(targetBars / 50) + 2; page += 1) {
    const body = await request({
      path: '/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice',
      trId: 'FHKUP03500100',
      params: {
        FID_COND_MRKT_DIV_CODE: 'U',
        FID_INPUT_ISCD: '0001',
        FID_INPUT_DATE_1: startDate,
        FID_INPUT_DATE_2: cursorDate,
        FID_PERIOD_DIV_CODE: 'D',
      },
    });
    const output = Array.isArray(body.output2) ? body.output2 as KisRow[] : [];
    if (output.length === 0) break;
    collected.push(...output);
    const parsed = parseKisIndexRows(collected);
    if (parsed.length >= targetBars) return parsed.slice(-targetBars);
    const oldest = parsed[0]?.tradeDate;
    if (!oldest) break;
    const prior = new Date(`${oldest}T00:00:00Z`);
    prior.setUTCDate(prior.getUTCDate() - 1);
    const nextCursor = prior.toISOString().slice(0, 10).replaceAll('-', '');
    if (nextCursor === cursorDate) break;
    cursorDate = nextCursor;
  }
  return parseKisIndexRows(collected).slice(-targetBars);
}

export async function getKisKospiPutCallRatio(request: KisRequest = defaultKisRequest) {
  const list = await request({
    path: '/uapi/domestic-futureoption/v1/quotations/display-board-option-list',
    trId: 'FHPIO056104C0',
    params: { FID_COND_SCR_DIV_CODE: '509', FID_COND_MRKT_DIV_CODE: '', FID_COND_MRKT_CLS_CODE: '' },
  });
  const expiries = Array.isArray(list.output) ? list.output as KisRow[] : [];
  const expiry = String(expiries[0]?.mtrt_yymm || '');
  if (!/^\d{6}$/.test(expiry)) throw new Error('KIS option expiry list is empty.');
  const board = await request({
    path: '/uapi/domestic-futureoption/v1/quotations/display-board-callput',
    trId: 'FHPIF05030100',
    params: {
      FID_COND_MRKT_DIV_CODE: 'O',
      FID_COND_SCR_DIV_CODE: '20503',
      FID_MRKT_CLS_CODE: 'CO',
      FID_MTRT_CNT: expiry,
      FID_MRKT_CLS_CODE1: 'PO',
      FID_COND_MRKT_CLS_CODE: '',
    },
  });
  const callRows = Array.isArray(board.output1) ? board.output1 as KisRow[] : [];
  const putRows = Array.isArray(board.output2) ? board.output2 as KisRow[] : [];
  return { expiry, ratio: calculatePutCallVolumeRatio(callRows, putRows) };
}

export async function refreshMarketSentimentInputs(input: {
  client: SupabaseClient;
  request?: KisRequest;
  endDate?: string;
}): Promise<MarketSentimentCollection> {
  const warnings: string[] = [];
  const indexRows = await getKisKospiIndexHistory({ request: input.request, targetBars: 320, endDate: input.endDate });
  const observedAt = new Date().toISOString();
  if (indexRows.length > 0) {
    const { error } = await input.client.from('market_sentiment_inputs').upsert(indexRows.map((row) => ({
      trade_date: row.tradeDate,
      index_close: row.indexClose,
      provider: 'KIS_INDEX',
      observed_at: observedAt,
      updated_at: observedAt,
    })), { onConflict: 'trade_date' });
    if (error) throw error;
  }
  const asOf = indexRows.at(-1)?.tradeDate || null;
  let putCall: number | null = null;
  if (asOf) {
    try {
      const option = await getKisKospiPutCallRatio(input.request || defaultKisRequest);
      putCall = option.ratio;
      if (putCall === null) warnings.push('KOSPI 옵션 콜 거래량이 0이어서 Put/Call 비율을 저장하지 못했습니다.');
      else {
        const { error } = await input.client.from('market_sentiment_inputs').upsert({
          trade_date: asOf,
          put_call: putCall,
          provider: `KIS_INDEX+KIS_OPTIONS:${option.expiry}`,
          observed_at: observedAt,
          updated_at: observedAt,
        }, { onConflict: 'trade_date' });
        if (error) throw error;
      }
    } catch (error) {
      warnings.push(`Put/Call 수집 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (indexRows.length < 126) warnings.push(`KOSPI 이력이 ${indexRows.length}거래일뿐이라 125일선 계산이 차단됩니다.`);
  warnings.push('VKOSPI 및 10년-5년 국채선물 이력은 검증된 원천 연결 전까지 결측으로 유지합니다.');
  return { asOf, provider: putCall === null ? 'KIS_INDEX' : 'KIS_INDEX+KIS_OPTIONS', indexRows: indexRows.length, putCall, warnings };
}
