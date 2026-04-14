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

function getOneYearAgoString() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
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
    // For domestic, inquire-daily-itemchartprice returns up to 100 days. 
    // We fetch current page, and if we need more, we can fetch previous date ranges.
    const collected: OHLCData[] = [];
    let endDate = getTodayString();
    
    for (let page = 0; page < 3; page++) {
      if (page > 0) await sleep(200);
      
      const pageData = await getDomesticDailyPricePage(ticker, getOneYearAgoString(), endDate);
      if (pageData.length === 0) break;
      
      collected.push(...pageData);
      const merged = sortAndDedupe(collected);
      if (merged.length >= targetBars) {
        return merged.slice(-targetBars);
      }
      
      const oldest = merged[0]?.date;
      if (!oldest) break;
      
      endDate = previousCalendarDate(oldest);
    }
    return sortAndDedupe(collected);
  }
  
  return getOverseasDailyPrice(ticker, exchange, targetBars);
}

export async function getKisKospiMarketCapRanking(limit = 100): Promise<{
  rank: number;
  ticker: string;
  name: string;
  marketCap: number | null;
  currentPrice: number | null;
}[]> {
  const token = await getKisToken();
  const KIS_APP_KEY = kisAppKey();
  const KIS_APP_SECRET = kisAppSecret();
  const KIS_BASE_URL = kisBaseUrl();

  const response = await axios.get(`${KIS_BASE_URL}/uapi/domestic-stock/v1/ranking/market-cap`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: 'FHPST01740000',
      custtype: 'P',
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
    },
  });

  if (response.data.rt_cd !== '0') {
    throw new Error(response.data.msg1 || 'KIS 시가총액 순위 조회 오류');
  }

  const output: KisMarketCapRow[] = response.data.output || response.data.output2 || [];
  return output
    .map((item, index) => {
      const marketCapRaw = item.avls || item.mrkt_whol_avls;
      const marketCap = marketCapRaw ? Number(String(marketCapRaw).replaceAll(',', '')) : null;
      const currentPrice = item.stck_prpr ? Number(String(item.stck_prpr).replaceAll(',', '')) : null;

      return {
        rank: Number(item.data_rank) || index + 1,
        ticker: String(item.mksc_shrn_iscd || '').padStart(6, '0'),
        name: item.hts_kor_isnm || '',
        marketCap: Number.isFinite(marketCap) ? marketCap : null,
        currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      };
    })
    .filter((item) => item.ticker.length === 6 && item.name)
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
