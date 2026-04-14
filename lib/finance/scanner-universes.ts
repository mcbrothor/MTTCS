import { getKisKospiMarketCapRanking } from '@/lib/finance/kis-api';
import { asString, normalizeNasdaqRows, parseNumber } from './scanner-normalizers';
import type { ScannerUniverse, ScannerUniverseResponse } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

type NasdaqRow = Record<string, unknown>;
type KrxRow = Record<string, unknown>;

export { normalizeNasdaqRows } from './scanner-normalizers';

function krxValue(row: KrxRow, keys: string[]) {
  for (const key of keys) {
    const value = asString(row[key]);
    if (value) return value;
  }
  return '';
}

function normalizeKrxRows(rows: KrxRow[]): { ticker: string; name: string; marketCap: number | null }[] {
  return rows
    .map((row) => ({
      ticker: krxValue(row, ['ISU_SRT_CD', 'isuSrtCd', '종목코드', 'ISU_CD']).padStart(6, '0'),
      name: krxValue(row, ['ISU_ABBRV', 'ISU_NM', 'isuAbbrv', '종목명']),
      marketCap: parseNumber(row.MKT_CAP || row.MKTCAP || row['시가총액']),
    }))
    .filter((item) => /^\d{6}$/.test(item.ticker) && item.name);
}

async function fetchNasdaq100(): Promise<ScannerUniverseResponse> {
  const response = await fetch('https://api.nasdaq.com/api/quote/list-type/nasdaq100?assetclass=stocks&limit=100', {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0',
    },
    next: { revalidate: 60 * 30 },
  });

  if (!response.ok) {
    throw new Error(`Nasdaq 응답 오류 (${response.status})`);
  }

  const payload = await response.json() as {
    data?: {
      date?: string;
      data?: {
        rows?: NasdaqRow[];
      };
    };
  };
  const rows = payload.data?.data?.rows || [];
  const priceAsOf = payload.data?.date || new Date().toISOString();
  const items = normalizeNasdaqRows(rows, priceAsOf);

  if (items.length === 0) {
    throw new Error('Nasdaq 100 구성종목을 파싱하지 못했습니다.');
  }

  return {
    universe: 'NASDAQ100',
    label: 'NASDAQ 100',
    asOf: new Date().toISOString(),
    source: 'Nasdaq official Nasdaq-100 list API',
    delayNote: 'Nasdaq 현재가 데이터는 지연될 수 있습니다.',
    items,
    warnings: items.length < 100 ? [`Nasdaq 응답에서 ${items.length}개 종목만 확인되었습니다.`] : [],
  };
}

async function fetchKrxKospi100Constituents(): Promise<{ items: { ticker: string; name: string; marketCap: number | null }[]; source: string }> {
  const body = new URLSearchParams({
    bld: 'dbms/MDC/STAT/standard/MDCSTAT00601',
    locale: 'ko_KR',
    indIdx: '1',
    indIdx2: '028',
    csvxls_isNo: 'false',
  });

  const response = await fetch('https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer: 'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0301020506',
      'user-agent': 'Mozilla/5.0',
      'x-requested-with': 'XMLHttpRequest',
    },
    body,
    next: { revalidate: DAY_MS / 1000 },
  });

  const text = await response.text();
  if (!response.ok || text.includes('LOGOUT')) {
    throw new Error('KRX 구성종목 API가 세션을 요구해 KIS fallback을 사용합니다.');
  }

  const payload = JSON.parse(text) as Record<string, unknown>;
  const rows = (payload.output || payload.block1 || payload.data || []) as KrxRow[];
  const items = normalizeKrxRows(Array.isArray(rows) ? rows : []);
  if (items.length === 0) {
    throw new Error('KRX KOSPI 100 구성종목을 파싱하지 못했습니다.');
  }

  return { items, source: 'KRX KOSPI 100 constituents' };
}

async function fetchKospi100(): Promise<ScannerUniverseResponse> {
  const warnings: string[] = [];
  let krxItems: { ticker: string; name: string; marketCap: number | null }[] | null = null;
  let source = 'KRX KOSPI 100 constituents + KIS market-cap ranking';

  try {
    const krx = await fetchKrxKospi100Constituents();
    krxItems = krx.items;
    source = `${krx.source} + KIS market-cap ranking`;
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'KRX 구성종목 조회 실패로 KIS fallback을 사용합니다.');
  }

  const ranking = await getKisKospiMarketCapRanking(100);
  const rankByTicker = new Map(ranking.map((item) => [item.ticker, item]));
  const baseItems = krxItems && krxItems.length > 0
    ? krxItems
    : ranking.map((item) => ({ ticker: item.ticker, name: item.name, marketCap: item.marketCap }));

  if (!krxItems) {
    source = 'KIS market-cap ranking fallback';
    warnings.push('KRX 공식 구성종목을 확인하지 못해 KOSPI 시장 시가총액 상위 100개를 fallback으로 표시합니다.');
  }

  const items = baseItems
    .map((item) => {
      const ranked = rankByTicker.get(item.ticker);
      return {
        rank: 0,
        ticker: item.ticker,
        exchange: 'KOSPI',
        name: item.name || ranked?.name || item.ticker,
        marketCap: ranked?.marketCap ?? item.marketCap ?? null,
        currency: 'KRW' as const,
        currentPrice: ranked?.currentPrice ?? null,
        priceAsOf: new Date().toISOString(),
        priceSource: ranked ? 'KIS market-cap ranking' : 'KRX constituent list',
      };
    })
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, 100)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  if (items.length === 0) {
    throw new Error('KOSPI 100 종목군을 불러오지 못했습니다.');
  }

  return {
    universe: 'KOSPI100',
    label: krxItems ? 'KOSPI 100' : 'KOSPI 시가총액 상위 100',
    asOf: new Date().toISOString(),
    source,
    delayNote: krxItems ? 'KRX 데이터는 공식적으로 약 20분 지연될 수 있습니다.' : 'KRX 공식 구성종목 조회가 막혀 KIS 시가총액 순위를 fallback으로 사용했습니다.',
    items,
    warnings,
  };
}

export async function getScannerUniverse(universe: ScannerUniverse): Promise<ScannerUniverseResponse> {
  if (universe === 'NASDAQ100') return fetchNasdaq100();
  if (universe === 'KOSPI100') return fetchKospi100();
  throw new Error('지원하지 않는 종목군입니다.');
}
