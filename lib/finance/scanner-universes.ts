import { getKisKospiMarketCapRanking } from '@/lib/finance/kis-api';
import { normalizeNasdaqRows } from './scanner-normalizers';
import { rankKoreaMarketCapItems, type KoreaRankingItem } from './korea-market-cap-ranking';
import type { ScannerConstituent, ScannerUniverse, ScannerUniverseResponse } from '@/types';

type NasdaqRow = Record<string, unknown>;
type KoreaMarket = 'KOSPI' | 'KOSDAQ';

export { normalizeNasdaqRows } from './scanner-normalizers';

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

async function fetchNaverKoreaMarketCapRanking(market: KoreaMarket, limit = 100): Promise<KoreaRankingItem[]> {
  const items: KoreaRankingItem[] = [];
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
        source: `Naver Finance ${market} market-cap ranking`,
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
    throw new Error(`StockAnalysis S&P 500 response error (${response.status})`);
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
    throw new Error('S&P 500 constituents could not be parsed.');
  }

  return {
    universe: 'SP500',
    label: 'S&P 500',
    asOf: new Date().toISOString(),
    source: 'StockAnalysis S&P 500 table',
    delayNote: 'S&P 500 market-cap and price data can be delayed.',
    items,
    warnings: items.length < 500 ? [`Only ${items.length} S&P 500 rows were parsed.`] : [],
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
    throw new Error(`Nasdaq response error (${response.status})`);
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
    throw new Error('Nasdaq 100 constituents could not be parsed.');
  }

  return {
    universe: 'NASDAQ100',
    label: 'NASDAQ 100',
    asOf: new Date().toISOString(),
    source: 'Nasdaq official Nasdaq-100 list API',
    delayNote: 'Nasdaq quote data can be delayed.',
    items,
    warnings: items.length < 100 ? [`Only ${items.length} Nasdaq rows were parsed.`] : [],
  };
}

function toKoreaConstituents(ranking: ReturnType<typeof rankKoreaMarketCapItems>, exchange: 'KOSPI' | 'KOSDAQ'): ScannerConstituent[] {
  return ranking.map((item) => ({
    rank: item.rank,
    ticker: item.ticker,
    exchange,
    name: item.name,
    marketCap: item.marketCap,
    currency: 'KRW',
    currentPrice: item.currentPrice,
    priceAsOf: new Date().toISOString(),
    priceSource: item.source,
  }));
}

async function fetchKospi100(): Promise<ScannerUniverseResponse> {
  const warnings: string[] = [];
  let ranking: KoreaRankingItem[] = [];

  try {
    ranking = (await getKisKospiMarketCapRanking(100)).map((item) => ({
      ...item,
      source: 'KIS KOSPI market-cap ranking',
    }));
  } catch (error) {
    warnings.push(error instanceof Error ? `KIS market-cap ranking failed: ${error.message}` : 'KIS market-cap ranking failed.');
  }

  if (ranking.length < 100) {
    const naverRanking = await fetchNaverKoreaMarketCapRanking('KOSPI', 100);
    const byTicker = new Map(ranking.map((item) => [item.ticker, item]));
    for (const item of naverRanking) {
      if (!byTicker.has(item.ticker)) byTicker.set(item.ticker, item);
    }
    ranking = Array.from(byTicker.values());
    warnings.push(`KIS returned ${ranking.length} rows before fallback merge; Naver Finance was used to complete the top-100 list.`);
  }

  const ranked = rankKoreaMarketCapItems(ranking, 100);
  const items = toKoreaConstituents(ranked, 'KOSPI');

  if (items.length === 0) {
    throw new Error('KOSPI market-cap top 100 could not be loaded.');
  }

  return {
    universe: 'KOSPI100',
    label: 'KOSPI 시가총액 상위 100',
    asOf: new Date().toISOString(),
    source: items.some((item) => item.priceSource.includes('Naver'))
      ? 'KIS KOSPI market-cap ranking + Naver Finance fallback'
      : 'KIS KOSPI market-cap ranking',
    delayNote: 'KOSPI 시가총액 순위와 현재가는 KIS/Naver 기준이며 지연될 수 있습니다.',
    items,
    warnings,
  };
}

async function fetchKosdaq100(): Promise<ScannerUniverseResponse> {
  const ranking = await fetchNaverKoreaMarketCapRanking('KOSDAQ', 100);
  const ranked = rankKoreaMarketCapItems(ranking, 100);
  const items = toKoreaConstituents(ranked, 'KOSDAQ');

  if (items.length === 0) {
    throw new Error('KOSDAQ market-cap top 100 could not be loaded.');
  }

  return {
    universe: 'KOSDAQ100',
    label: 'KOSDAQ 시가총액 상위 100',
    asOf: new Date().toISOString(),
    source: 'Naver Finance KOSDAQ market-cap ranking',
    delayNote: 'KOSDAQ 시가총액 순위와 현재가는 Naver Finance 기준이며 지연될 수 있습니다.',
    items,
    warnings: items.length < 100 ? [`Only ${items.length} KOSDAQ rows were parsed.`] : [],
  };
}

export async function getScannerUniverse(universe: ScannerUniverse): Promise<ScannerUniverseResponse> {
  if (universe === 'NASDAQ100') return fetchNasdaq100();
  if (universe === 'SP500') return fetchStockAnalysisSp500();
  if (universe === 'KOSPI100') return fetchKospi100();
  if (universe === 'KOSDAQ100') return fetchKosdaq100();
  throw new Error('Unsupported scanner universe.');
}
