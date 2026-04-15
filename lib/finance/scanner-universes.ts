import { getKisKospiMarketCapRanking } from '@/lib/finance/kis-api';
import { asString, normalizeNasdaqRows, parseNumber } from './scanner-normalizers';
import type { ScannerUniverse, ScannerUniverseResponse } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

type NasdaqRow = Record<string, unknown>;
type KrxRow = Record<string, unknown>;
type KospiRankingItem = {
  ticker: string;
  name: string;
  marketCap: number | null;
  currentPrice: number | null;
  source: string;
};

type KoreaMarket = 'KOSPI' | 'KOSDAQ';

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

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseNumberText(value: string): number | null {
  const numeric = Number(stripHtml(value).replaceAll(',', '').replaceAll('%', '').trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function parseAbbreviatedUsd(value: string): number | null {
  const cleaned = stripHtml(value).replaceAll(',', '').replaceAll('$', '').trim();
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)([TBMK])?$/i);
  if (!match) return null;

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;

  const suffix = match[2]?.toUpperCase();
  if (suffix === 'T') return numeric * 1_000_000_000_000;
  if (suffix === 'B') return numeric * 1_000_000_000;
  if (suffix === 'M') return numeric * 1_000_000;
  if (suffix === 'K') return numeric * 1_000;
  return numeric;
}

function decodeKoreanHtml(buffer: ArrayBuffer) {
  try {
    return new TextDecoder('euc-kr').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function fetchNaverKoreaMarketCapRanking(market: KoreaMarket, limit = 100): Promise<KospiRankingItem[]> {
  const items: KospiRankingItem[] = [];
  const sosok = market === 'KOSPI' ? '0' : '1';

  for (let page = 1; page <= 4 && items.length < limit; page += 1) {
    const response = await fetch(`https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`, {
      headers: {
        accept: 'text/html',
        'user-agent': 'Mozilla/5.0',
      },
      next: { revalidate: 60 * 30 },
    });

    if (!response.ok) break;

    const html = decodeKoreanHtml(await response.arrayBuffer());
    const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

    for (const match of rowMatches) {
      const row = match[1] || '';
      const link = row.match(/<a[^>]+href="\/item\/main\.naver\?code=(\d{6})"[^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;

      const numberCells = Array.from(row.matchAll(/<td[^>]*class="number"[^>]*>([\s\S]*?)<\/td>/gi)).map((cell) => cell[1] || '');
      const currentPrice = parseNumberText(numberCells[0] || '');
      const marketCapHundredMillion = parseNumberText(numberCells[4] || '');

      items.push({
        ticker: link[1],
        name: stripHtml(link[2]),
        marketCap: marketCapHundredMillion === null ? null : marketCapHundredMillion * 100_000_000,
        currentPrice,
        source: `Naver Finance ${market} market-cap fallback`,
      });

      if (items.length >= limit) break;
    }
  }

  return items;
}

async function fetchStockAnalysisSp500(): Promise<ScannerUniverseResponse> {
  const response = await fetch('https://stockanalysis.com/list/sp-500-stocks/', {
    headers: {
      accept: 'text/html',
      'user-agent': 'Mozilla/5.0',
    },
    next: { revalidate: 60 * 30 },
  });

  if (!response.ok) {
    throw new Error(`StockAnalysis S&P 500 응답 오류 (${response.status})`);
  }

  const html = await response.text();
  const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  const items = rows
    .map((match) => {
      const row = match[1] || '';
      const symbolMatch = row.match(/<a[^>]+href="\/stocks\/([^/]+)\/"[^>]*>([\s\S]*?)<\/a>/i);
      if (!symbolMatch) return null;

      const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((cell) => stripHtml(cell[1] || ''));
      const rawTicker = stripHtml(symbolMatch[2]).toUpperCase();
      const ticker = rawTicker.replace('.', '-');
      const name = cells[2] || ticker;
      const marketCap = parseAbbreviatedUsd(cells[3] || '');
      const currentPrice = parseNumberText(cells[4] || '');

      return {
        rank: 0,
        ticker,
        exchange: 'NAS',
        name,
        marketCap,
        currency: 'USD' as const,
        currentPrice,
        priceAsOf: new Date().toISOString(),
        priceSource: 'StockAnalysis S&P 500 table',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.ticker && item.name))
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, 500)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  if (items.length === 0) {
    throw new Error('S&P 500 구성종목을 파싱하지 못했습니다.');
  }

  return {
    universe: 'SP500',
    label: 'S&P 500',
    asOf: new Date().toISOString(),
    source: 'StockAnalysis S&P 500 table',
    delayNote: 'S&P 500 현재가와 시가총액은 StockAnalysis 표 기준이며 지연될 수 있습니다.',
    items,
    warnings: items.length < 500 ? [`S&P 500 응답에서 ${items.length}개 종목만 확인되었습니다.`] : [],
  };
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

  let kisRanking: Awaited<ReturnType<typeof getKisKospiMarketCapRanking>> = [];

  try {
    kisRanking = await getKisKospiMarketCapRanking(100);
  } catch (error) {
    warnings.push(error instanceof Error ? `KIS 시가총액 순위 조회 실패: ${error.message}` : 'KIS 시가총액 순위 조회 실패');
  }

  let ranking: KospiRankingItem[] = kisRanking.map((item) => ({ ...item, source: 'KIS market-cap ranking' }));

  if (ranking.length < 100) {
    const naverRanking = await fetchNaverKoreaMarketCapRanking('KOSPI', 100);
    const byTicker = new Map(ranking.map((item) => [item.ticker, item]));
    for (const item of naverRanking) {
      if (!byTicker.has(item.ticker)) byTicker.set(item.ticker, item);
    }
    ranking = Array.from(byTicker.values())
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
      .slice(0, 100);
    warnings.push(`KIS 시가총액 순위가 ${kisRanking.length}개만 반환되어 Naver Finance 시가총액 페이지로 100개까지 보강했습니다.`);
  }

  const rankByTicker = new Map(ranking.map((item) => [item.ticker, item]));
  const baseItems = krxItems && krxItems.length > 0
    ? krxItems
    : ranking.map((item) => ({ ticker: item.ticker, name: item.name, marketCap: item.marketCap }));

  if (!krxItems) {
    source = ranking.some((item) => item.source.includes('Naver'))
      ? 'KIS market-cap ranking + Naver Finance market-cap fallback'
      : 'KIS market-cap ranking fallback';
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
        priceSource: ranked?.source || 'KRX constituent list',
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

async function fetchKosdaq100(): Promise<ScannerUniverseResponse> {
  const warnings: string[] = ['KRX KOSDAQ 100 공식 구성종목 조회는 세션 제한이 있어 Naver Finance KOSDAQ 시가총액 상위 100개를 fallback으로 표시합니다.'];
  const ranking = await fetchNaverKoreaMarketCapRanking('KOSDAQ', 100);

  const items = ranking
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, 100)
    .map((item, index) => ({
      rank: index + 1,
      ticker: item.ticker,
      exchange: 'KOSDAQ',
      name: item.name,
      marketCap: item.marketCap,
      currency: 'KRW' as const,
      currentPrice: item.currentPrice,
      priceAsOf: new Date().toISOString(),
      priceSource: item.source,
    }));

  if (items.length === 0) {
    throw new Error('KOSDAQ 100 종목군을 불러오지 못했습니다.');
  }

  if (items.length < 100) {
    warnings.push(`Naver Finance KOSDAQ 시가총액 페이지에서 ${items.length}개 종목만 확인되었습니다.`);
  }

  return {
    universe: 'KOSDAQ100',
    label: 'KOSDAQ 시가총액 상위 100',
    asOf: new Date().toISOString(),
    source: 'Naver Finance KOSDAQ market-cap fallback',
    delayNote: 'KOSDAQ 현재가와 시가총액은 Naver Finance 시가총액 페이지 기준이며 지연될 수 있습니다.',
    items,
    warnings,
  };
}

export async function getScannerUniverse(universe: ScannerUniverse): Promise<ScannerUniverseResponse> {
  if (universe === 'NASDAQ100') return fetchNasdaq100();
  if (universe === 'SP500') return fetchStockAnalysisSp500();
  if (universe === 'KOSPI100') return fetchKospi100();
  if (universe === 'KOSDAQ100') return fetchKosdaq100();
  throw new Error('지원하지 않는 종목군입니다.');
}
