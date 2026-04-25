import axios from 'axios';
import { getKisToken } from './kis-auth';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';
import type { OHLCData } from '@/types';

/** 지정 ms만큼 대기합니다. KIS API 초당 20건 제한 대응용. */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface KisDailyPriceRow {
  xymd?: string;
  open: string;
  high: string;
  low: string;
  clos: string;
  tvol: string;
}

interface KisDomesticDailyPriceRow {
  stck_bsop_date?: string;
  stck_oprc: string;
  stck_hgpr: string;
  stck_lwpr: string;
  stck_clpr: string;
  acml_vol: string;
}

interface KisMarketCapRow {
  data_rank?: string;
  mksc_shrn_iscd?: string;
  hts_kor_isnm?: string;
  stck_prpr?: string;
  acml_vol?: string;
  avls?: string;
  mrkt_whol_avls?: string;
  ctx_area_fk100?: string;
  ctx_area_nk100?: string;
}

interface KisMarketCapRankingRow {
  rank: number;
  ticker: string;
  name: string;
  marketCap: number | null;
  currentPrice: number | null;
}

const KIS_PAGE_SIZE = 100;
const DEFAULT_TARGET_BARS = 260;

function normalizeDate(date: string) {
  return date.replaceAll('-', '');
}

function previousCalendarDate(yyyymmdd: string) {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6)) - 1;
  const day = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function sortAndDedupe(data: OHLCData[]) {
  const byDate = new Map<string, OHLCData>();
  for (const bar of data) {
    if (Number.isFinite(bar.close) && bar.date) {
      byDate.set(normalizeDate(bar.date), { ...bar, date: normalizeDate(bar.date) });
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getOverseasDailyPricePage(
  ticker: string,
  exchange: string,
  baseDate = ''
): Promise<OHLCData[]> {
  const token = await getKisToken();
  const KIS_APP_KEY = kisAppKey();
  const KIS_APP_SECRET = kisAppSecret();
  const KIS_BASE_URL = kisBaseUrl();

  const isVirtual = KIS_BASE_URL.includes('openapivts');
  const tr_id = isVirtual ? 'VHJFS76240000' : 'HHDFS76240000';

  const response = await axios.get(`${KIS_BASE_URL}/uapi/overseas-price/v1/quotations/dailyprice`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id,
      custtype: 'P',
    },
    params: {
      EXCD: exchange,
      SYMB: ticker,
      GUBN: '0',
      BYMD: baseDate,
      MODP: '1',
    },
  });

  if (response.data.rt_cd !== '0') {
    throw new Error(response.data.msg1 || 'KIS 해외주식 일봉 조회 오류');
  }

  const output2: KisDailyPriceRow[] = response.data.output2 || [];

  return output2
    .filter((item) => item.xymd)
    .map((item) => ({
      date: normalizeDate(item.xymd || ''),
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.clos),
      volume: Number(item.tvol),
    }))
    .filter((item) =>
      Number.isFinite(item.open) &&
      Number.isFinite(item.high) &&
      Number.isFinite(item.low) &&
      Number.isFinite(item.close) &&
      Number.isFinite(item.volume)
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getOverseasDailyPrice(
  ticker: string,
  exchange: string = 'NAS',
  targetBars: number = DEFAULT_TARGET_BARS
): Promise<OHLCData[]> {
  const maxPages = Math.ceil(targetBars / KIS_PAGE_SIZE) + 2;
  const collected: OHLCData[] = [];
  let baseDate = '';

  for (let page = 0; page < maxPages; page += 1) {
    // KIS API 초당 20건 제한 대응: 페이지 간 200ms 딜레이
    if (page > 0) await sleep(200);

    const pageData = await getOverseasDailyPricePage(ticker, exchange, baseDate);
    if (pageData.length === 0) break;

    collected.push(...pageData);
    const merged = sortAndDedupe(collected);

    if (merged.length >= targetBars) {
      return merged.slice(-targetBars);
    }

    const oldest = merged[0]?.date;
    if (!oldest) break;

    const nextBaseDate = previousCalendarDate(oldest);
    if (nextBaseDate === baseDate) break;
    baseDate = nextBaseDate;

    if (pageData.length < KIS_PAGE_SIZE && merged.length < targetBars) break;
  }

  return sortAndDedupe(collected);
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function getDomesticDailyPricePage(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<OHLCData[]> {
  const token = await getKisToken();
  const KIS_APP_KEY = kisAppKey();
  const KIS_APP_SECRET = kisAppSecret();
  const KIS_BASE_URL = kisBaseUrl();

  const isVirtual = KIS_BASE_URL.includes('openapivts');
  const tr_id = isVirtual ? 'FHKST03010100' : 'FHKST03010100';

  const response = await axios.get(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id,
      custtype: 'P',
    },
    params: {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: ticker,
      FID_INPUT_DATE_1: startDate,
      FID_INPUT_DATE_2: endDate,
      FID_PERIOD_DIV_CODE: 'D',
      FID_ORG_ADJ_PRC: '0',
    },
  });

  if (response.data.rt_cd !== '0') {
    throw new Error(response.data.msg1 || 'KIS 국내주식 일봉 조회 오류');
  }

  const output2: KisDomesticDailyPriceRow[] = response.data.output2 || [];
  return output2
    .filter((item): item is KisDomesticDailyPriceRow & { stck_bsop_date: string } => Boolean(item.stck_bsop_date))
    .map((item) => ({
      date: item.stck_bsop_date,
      open: Number(item.stck_oprc),
      high: Number(item.stck_hgpr),
      low: Number(item.stck_lwpr),
      close: Number(item.stck_clpr),
      volume: Number(item.acml_vol),
    }))
    .filter((item) =>
      Number.isFinite(item.open) &&
      Number.isFinite(item.high) &&
      Number.isFinite(item.low) &&
      Number.isFinite(item.close) &&
      Number.isFinite(item.volume)
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getMarketDailyPrice(
  ticker: string,
  exchange: string,
  targetBars: number = DEFAULT_TARGET_BARS
): Promise<OHLCData[]> {
  if (exchange === 'KOSPI' || exchange === 'KOSDAQ') {
    const collected: OHLCData[] = [];
    let endDate = getTodayString();
    // 200일 이평선 추세 및 52주 고점 계산을 위해 필요한 최소 데이터(약 260~300거래일)를 확보합니다.
    const startDate = '20200101'; // 과거 데이터부터 역순으로 추적
    
    // 타겟 데이터(300개)를 확보할 때까지 루프를 돕니다. (보통 3페이지면 완료)
    for (let page = 0; page < 6; page++) {
      if (page > 0) await sleep(200);
      
      const pageData = await getDomesticDailyPricePage(ticker, startDate, endDate);
      if (pageData.length === 0) break;
      
      collected.push(...pageData);
      const merged = sortAndDedupe(collected);
      
      if (merged.length >= targetBars) {
        return merged.slice(-targetBars);
      }
      
      const oldest = merged[0]?.date;
      if (!oldest) break;
      
      // 다음 페이지를 위해 현재 가장 오래된 데이터의 직전 날짜를 endDate로 설정
      const nextEndDate = previousCalendarDate(oldest);
      if (nextEndDate === endDate) break;
      endDate = nextEndDate;
      
      // 더 이상 가져올 과거 데이터가 없는 경우 (KIS API 특성상 100개 미만 반환 시)
      if (pageData.length < 100 && merged.length < targetBars) break;
    }
    return sortAndDedupe(collected);
  }
  
  return getOverseasDailyPrice(ticker, exchange, targetBars);
}

/** 국내 주식 현재가 시세를 조회합니다 (FHKST01010100) */
export async function getKisDomesticPrice(ticker: string): Promise<number | null> {
  try {
    const token = await getKisToken();
    const KIS_APP_KEY = kisAppKey();
    const KIS_APP_SECRET = kisAppSecret();
    const KIS_BASE_URL = kisBaseUrl();

    const response = await axios.get(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
        tr_id: 'FHKST01010100',
        custtype: 'P',
      },
      params: {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: ticker,
      },
    });

    if (response.data.rt_cd !== '0') {
      console.error(`KIS 현재가 조회 실패 (${ticker}):`, response.data.msg1);
      return null;
    }

    return Number(response.data.output?.stck_prpr) || null;
  } catch (error) {
    console.error(`KIS API 호출 오류 (${ticker}):`, error);
    return null;
  }
}

function normalizeKisMarketCapRows(rows: KisMarketCapRow[], rankOffset = 0): KisMarketCapRankingRow[] {
  return rows
    .map((item, index) => {
      const marketCapRaw = item.avls || item.mrkt_whol_avls;
      const marketCap = marketCapRaw ? Number(String(marketCapRaw).replaceAll(',', '')) : null;
      const currentPrice = item.stck_prpr ? Number(String(item.stck_prpr).replaceAll(',', '')) : null;

      return {
        rank: Number(item.data_rank) || rankOffset + index + 1,
        ticker: String(item.mksc_shrn_iscd || '').padStart(6, '0'),
        name: item.hts_kor_isnm || '',
        marketCap: Number.isFinite(marketCap) ? marketCap : null,
        currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      };
    })
    .filter((item) => /^\d{6}$/.test(item.ticker) && item.name);
}

export async function getKisKospiMarketCapRanking(limit = 100): Promise<KisMarketCapRankingRow[]> {
  const token = await getKisToken();
  const KIS_APP_KEY = kisAppKey();
  const KIS_APP_SECRET = kisAppSecret();
  const KIS_BASE_URL = kisBaseUrl();
  const rows: KisMarketCapRankingRow[] = [];
  let ctxAreaFk100 = '';
  let ctxAreaNk100 = '';
  let trCont = '';

  for (let page = 0; page < 6 && rows.length < limit; page += 1) {
    if (page > 0) await sleep(200);

    const response = await axios.get(`${KIS_BASE_URL}/uapi/domestic-stock/v1/ranking/market-cap`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
        tr_id: 'FHPST01740000',
        custtype: 'P',
        tr_cont: trCont,
      },
      params: {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_COND_SCR_DIV_CODE: '20174',
        FID_DIV_CLS_CODE: '0',
        FID_INPUT_ISCD: '0000',
        FID_TRGT_CLS_CODE: '0',
        FID_TRGT_EXLS_CLS_CODE: '0',
        FID_INPUT_PRICE_1: '',
        FID_INPUT_PRICE_2: '',
        FID_VOL_CNT: '',
        CTX_AREA_FK100: ctxAreaFk100,
        CTX_AREA_NK100: ctxAreaNk100,
      },
    });

    if (response.data.rt_cd !== '0') {
      throw new Error(response.data.msg1 || 'KIS 시가총액 순위 조회 오류');
    }

    const output: KisMarketCapRow[] = response.data.output || response.data.output2 || [];
    const nextRows = normalizeKisMarketCapRows(output, rows.length);
    if (nextRows.length === 0) break;

    rows.push(...nextRows);

    ctxAreaFk100 = String(response.data.ctx_area_fk100 || output.at(-1)?.ctx_area_fk100 || '');
    ctxAreaNk100 = String(response.data.ctx_area_nk100 || output.at(-1)?.ctx_area_nk100 || '');
    const responseTrCont = String(response.headers?.tr_cont || response.headers?.['tr_cont'] || '').trim();

    const hasNextPage =
      responseTrCont === 'M' ||
      responseTrCont === 'N' ||
      Boolean(ctxAreaNk100 && rows.length < limit && nextRows.length >= 30);

    if (!hasNextPage || responseTrCont === 'F') break;
    trCont = 'N';
  }

  return Array.from(new Map(rows.map((item) => [item.ticker, item])).values())
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

// ─── 외국인 순매수 (시장별 투자자 매매동향) ────────────────────────────────

export interface KisForeignNetBuyRow {
  date: string;          // YYYYMMDD
  netBuyAmount: number;  // 외국인 순매수 금액 (백만원, 양수=순매수, 음수=순매도)
  netBuyVolume: number;  // 외국인 순매수 수량 (주)
}

/**
 * 시장별 외국인 투자자 순매수 동향 조회
 * KIS TR: FHKST01010400 (국내주식 일별주가)
 *
 * 주의: KIS API는 시장 전체 외국인 순매수를 직접 제공하지 않으므로,
 * KOSPI/KOSDAQ 지수 ETF(069500.KS / 122630.KS)의 외국인 거래동향을
 * 시장 전체 방향의 proxy로 사용합니다.
 *
 * 실패 시 빈 배열 반환 (non-throwing).
 */
export async function getKisMarketForeignNetBuy(
  market: 'KOSPI' | 'KOSDAQ',
  days = 20
): Promise<KisForeignNetBuyRow[]> {
  try {
    const token = await getKisToken();
    const KIS_APP_KEY = kisAppKey();
    const KIS_APP_SECRET = kisAppSecret();
    const KIS_BASE_URL = kisBaseUrl();

    // KOSPI: 069500(KODEX 200) / KOSDAQ: 229200(KODEX 코스닥150)
    const proxyTicker = market === 'KOSPI' ? '069500' : '229200';

    const today = getTodayString();
    const startDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() - days * 2); // 주말 포함 여유분
      return d.toISOString().slice(0, 10).replace(/-/g, '');
    })();

    const response = await axios.get(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${token}`,
          appkey: KIS_APP_KEY,
          appsecret: KIS_APP_SECRET,
          tr_id: 'FHKST03010100',
          custtype: 'P',
        },
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: proxyTicker,
          FID_INPUT_DATE_1: startDate,
          FID_INPUT_DATE_2: today,
          FID_PERIOD_DIV_CODE: 'D',
          FID_ORG_ADJ_PRC: '0',
        },
      }
    );

    if (response.data.rt_cd !== '0') {
      console.warn(`KIS 외국인 순매수 조회 실패 (${proxyTicker}):`, response.data.msg1);
      return [];
    }

    const output: Record<string, string>[] = response.data.output2 ?? [];
    return output
      .filter((row) => row.stck_bsop_date && row.frgn_ntby_qty)
      .map((row) => ({
        date: row.stck_bsop_date,
        netBuyAmount: Number(row.frgn_ntby_tr_pbmn ?? 0),
        netBuyVolume: Number(row.frgn_ntby_qty ?? 0),
      }))
      .slice(0, days);
  } catch (err) {
    console.warn('KIS 외국인 순매수 조회 오류:', err instanceof Error ? err.message : err);
    return [];
  }
}
