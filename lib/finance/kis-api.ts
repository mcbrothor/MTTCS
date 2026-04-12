import axios from 'axios';
import { getKisToken } from './kis-auth';
import type { OHLCData } from '@/types';

interface KisDailyPriceRow {
  xymd?: string;
  open: string;
  high: string;
  low: string;
  clos: string;
  tvol: string;
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
  const KIS_APP_KEY = process.env.KIS_APP_KEY!;
  const KIS_APP_SECRET = process.env.KIS_APP_SECRET!;
  const KIS_BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';

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
