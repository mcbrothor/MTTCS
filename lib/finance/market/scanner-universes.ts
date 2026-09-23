import { getKisKospiMarketCapRanking } from '../providers/kis-api';
import { rankEligibleKoreaCommonStocks, rankKoreaMarketCapItems, type KoreaRankingItem } from './korea-market-cap-ranking';
import type { ScannerConstituent, ScannerUniverse, ScannerUniverseResponse } from '../../../types/index.ts';
import { NASDAQ_COMPONENTS_URL, NASDAQ_MIN_CONSTITUENTS, parseWikipediaNasdaqConstituents } from './nasdaq-constituents';
import { SP500_COMPONENTS_URL, SP500_MIN_CONSTITUENTS, SP500_MAX_CONSTITUENTS, parseWikipediaSp500Constituents } from './sp500-constituents';

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

const NAVER_REQUEST_TIMEOUT_MS = 15_000;
const NAVER_JSON_PAGE_SIZE = 100;
const NAVER_JSON_EXTRA_PAGES = 2;

async function fetchNaverJsonRanking(market: KoreaMarket, limit: number): Promise<KoreaRankingItem[]> {
  const items = new Map<string, KoreaRankingItem>();
  for (let page = 1; page <= Math.ceil(limit / NAVER_JSON_PAGE_SIZE) + NAVER_JSON_EXTRA_PAGES && items.size < limit; page += 1) {
    const response = await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${NAVER_JSON_PAGE_SIZE}`, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(NAVER_REQUEST_TIMEOUT_MS),
      next: { revalidate: 60 * 30 },
    });
    if (!response.ok) throw new Error(`Naver ${market} JSON page ${page}: HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.stockListCategoryType !== market || !Array.isArray(payload.stocks) || Number(payload.page) !== page) {
      throw new Error(`Naver ${market} JSON market/page/schema mismatch at page ${page}`);
    }
    const previousSize = items.size;
    for (const row of payload.stocks) {
      if (!row || !/^\d{6}$/.test(row.itemCode) || typeof row.stockName !== 'string') continue;
      const marketCap = parseNumberText(String(row.marketValue ?? ''));
      const currentPrice = parseNumberText(String(row.closePrice ?? ''));
      if (!marketCap || marketCap <= 0 || !currentPrice || currentPrice <= 0) continue;
      items.set(row.itemCode, {
        ticker: row.itemCode, name: row.stockName, marketCap: marketCap * 100_000_000,
        currentPrice, source: `Naver Finance ${market} market-cap ranking JSON`,
        priceAsOf: typeof row.localTradedAt === 'string' && Number.isFinite(Date.parse(row.localTradedAt)) ? row.localTradedAt : undefined,
      });
    }
    if (items.size === previousSize) throw new Error(`Naver ${market} JSON page ${page}: no new valid rows`);
    if (payload.stocks.length < NAVER_JSON_PAGE_SIZE) break;
  }
  if (items.size < limit) throw new Error(`Naver ${market} JSON incomplete ranking: ${items.size}/${limit}`);
  return Array.from(items.values()).slice(0, limit);
}

async function fetchNaverLegacyRanking(market: KoreaMarket, limit: number): Promise<KoreaRankingItem[]> {
  const items: KoreaRankingItem[] = [];
  const sosok = market === 'KOSPI' ? '0' : '1';

  for (let page = 1; page <= Math.ceil(limit / 50) && items.length < limit; page += 1) {
    const response = await fetch(`https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`, {
      headers: {
        accept: 'text/html',
        'user-agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(NAVER_REQUEST_TIMEOUT_MS),
      next: { revalidate: 60 * 30 },
    });

    if (!response.ok) break;

    const html = decodeKoreanHtml(await response.arrayBuffer());
    const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    const previousCount = items.length;

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
    if (items.length === previousCount) break;
  }

  return items;
}

async function fetchNaverKoreaMarketCapRanking(market: KoreaMarket, limit = 100): Promise<KoreaRankingItem[]> {
  let legacyFailure = '';
  try {
    const legacy = await fetchNaverLegacyRanking(market, limit);
    if (legacy.length >= limit) return legacy;
    legacyFailure = `legacy HTML incomplete: ${legacy.length}/${limit}`;
  } catch (error) {
    legacyFailure = error instanceof Error ? error.message : String(error);
  }
  try { return await fetchNaverJsonRanking(market, limit); }
  catch (error) {
    throw new Error(`Naver ${market} sources failed. ${legacyFailure}; ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchStockAnalysisSp500(): Promise<ScannerUniverseResponse> {
  try {
  const response = await fetch('https://stockanalysis.com/list/sp-500-stocks/', {
    headers: {
      accept: 'text/html',
      'user-agent': 'Mozilla/5.0',
    },
    next: { revalidate: 60 * 30 },
    signal: AbortSignal.timeout(15_000),
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
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const uniqueCount = new Set(items.map((item) => item.ticker)).size;
  if (uniqueCount < SP500_MIN_CONSTITUENTS || uniqueCount > SP500_MAX_CONSTITUENTS || uniqueCount !== items.length) {
    throw new Error(`StockAnalysis S&P 500 constituent coverage invalid: ${uniqueCount} unique rows.`);
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
  } catch (error) {
    const primaryFailure = error instanceof Error ? error.message : String(error);
    try {
      const response = await fetch(SP500_COMPONENTS_URL, {
        headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15_000),
        next: { revalidate: 60 * 60 * 24 },
      });
      if (!response.ok) throw new Error(`Wikipedia S&P 500 response error (${response.status})`);
      const asOf = new Date().toISOString();
      const items = parseWikipediaSp500Constituents(await response.text(), asOf);
      return {
        universe: 'SP500', label: 'S&P 500', asOf, source: 'Wikipedia S&P 500 constituent list',
        delayNote: 'Constituent membership only; prices and market caps must be fetched separately. List order is not a market-cap ranking.',
        items,
        warnings: [
          `${primaryFailure} Wikipedia fallback was used; prices and market caps are unavailable and list order is not market-cap rank.`,
          'Only explicitly verified NYSE/NASDAQ listings are supported in this fallback; other exchanges (including Cboe BZX) are excluded, so this may not be the full index membership.',
        ],
      };
    } catch (fallbackError) {
      throw new Error(`${primaryFailure}; ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
    }
  }
}

// Russell 1000 — RS Rating 모집단 확장용 (~1,000 종목).
// IBD 정통 RS는 미국 전체 상장 ~7,000을 보지만, 무료 인프라 부담을 줄이기 위해
// S&P500 + NASDAQ100 + Russell 1000 합집합(~1,000~1,200)을 RS 모집단으로 사용한다.
// fetch 실패 시 호출부에서 fallthrough하여 S&P500 + NASDAQ100만 사용한다.
async function fetchStockAnalysisRussell1000(): Promise<ScannerUniverseResponse> {
  const response = await fetch('https://stockanalysis.com/list/russell-1000-stocks/', {
    headers: {
      accept: 'text/html',
      'user-agent': 'Mozilla/5.0',
    },
    next: { revalidate: 60 * 60 * 12 }, // 12시간 캐시 (Russell 1000은 분기 1회 갱신)
  });

  if (!response.ok) {
    throw new Error(`StockAnalysis Russell 1000 response error (${response.status})`);
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
        priceSource: 'StockAnalysis Russell 1000 table',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.ticker && item.name))
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, 1000)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  if (items.length === 0) {
    throw new Error('Russell 1000 constituents could not be parsed.');
  }

  return {
    universe: 'SP500', // 표시는 SP500 universe로 통합 (실제 모집단은 합집합)
    label: 'Russell 1000',
    asOf: new Date().toISOString(),
    source: 'StockAnalysis Russell 1000 table',
    delayNote: 'Russell 1000 market-cap and price data can be delayed.',
    items,
    warnings: items.length < 800 ? [`Only ${items.length} Russell 1000 rows were parsed.`] : [],
  };
}

async function fetchStockAnalysisNasdaq100(): Promise<ScannerUniverseResponse> {
  const response = await fetch('https://stockanalysis.com/list/nasdaq-100-stocks/', {
    headers: {
      accept: 'text/html',
      'user-agent': 'Mozilla/5.0',
    },
    next: { revalidate: 60 * 30 },
  });

  if (!response.ok) {
    throw new Error(`StockAnalysis Nasdaq 100 response error (${response.status})`);
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
        priceSource: 'StockAnalysis Nasdaq 100 table',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.ticker && item.name))
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, 100)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  if (new Set(items.map((item) => item.ticker)).size < NASDAQ_MIN_CONSTITUENTS) {
    throw new Error(`StockAnalysis Nasdaq 100 constituent coverage invalid: ${items.length} rows (expected at least ${NASDAQ_MIN_CONSTITUENTS}).`);
  }

  return {
    universe: 'NASDAQ100',
    label: 'NASDAQ 100',
    asOf: new Date().toISOString(),
    source: 'StockAnalysis Nasdaq 100 table',
    delayNote: 'Nasdaq 100 market-cap and price data can be delayed.',
    items,
    warnings: items.length < 100 ? [`Only ${items.length} Nasdaq rows were parsed.`] : [],
  };
}

async function fetchWikipediaNasdaq100(): Promise<ScannerUniverseResponse> {
  const response = await fetch(NASDAQ_COMPONENTS_URL, {
    headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' },
    next: { revalidate: 60 * 60 * 24 }, // 24시간 안정적 캐시
  });

  if (!response.ok) {
    throw new Error(`Wikipedia Nasdaq 100 response error (${response.status})`);
  }

  const html = await response.text();
  const items = parseWikipediaNasdaqConstituents(html, new Date().toISOString());

  return {
    universe: 'NASDAQ100',
    label: 'NASDAQ 100',
    asOf: new Date().toISOString(),
    source: 'Wikipedia Nasdaq-100 table',
    delayNote: 'Prices and market caps will be fetched dynamically.',
    items,
    warnings: items.length < 100 ? [`Only ${items.length} Nasdaq rows were parsed.`] : [],
  };
}

async function fetchNasdaq100(): Promise<ScannerUniverseResponse> {
  try {
    return await fetchStockAnalysisNasdaq100();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'StockAnalysis Nasdaq 100 fetch failed.';
    let fallback: ScannerUniverseResponse;
    try {
      fallback = await fetchWikipediaNasdaq100();
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`Nasdaq 100 sources failed. Primary: ${message} Fallback: ${fallbackMessage}`);
    }
    return {
      ...fallback,
      warnings: [`${message} Wikipedia fallback was used; market caps may be unavailable.`, ...fallback.warnings],
    };
  }
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
    priceAsOf: item.priceAsOf ?? new Date().toISOString(),
    priceSource: item.source,
  }));
}

async function fetchKospi200(): Promise<ScannerUniverseResponse> {
  const warnings: string[] = [];
  let ranking: KoreaRankingItem[] = [];

  try {
    ranking = await fetchNaverKoreaMarketCapRanking('KOSPI', 300);
  } catch (error) {
    warnings.push(error instanceof Error ? `Naver Finance market-cap ranking failed: ${error.message}` : 'Naver Finance market-cap ranking failed.');
  }

  if (ranking.length < 200) {
    try {
      const naverCount = ranking.length;
      const kisRanking = (await getKisKospiMarketCapRanking(200)).map((item) => ({
        ...item,
        source: 'KIS KOSPI market-cap ranking fallback',
      }));
      const byTicker = new Map(ranking.map((item) => [item.ticker, item]));
      for (const item of kisRanking) {
        if (!byTicker.has(item.ticker)) byTicker.set(item.ticker, item);
      }
      ranking = Array.from(byTicker.values());
      warnings.push(`Naver returned ${naverCount} rows; KIS fallback produced ${byTicker.size} merged rows.`);
    } catch (error) {
      warnings.push(error instanceof Error ? `KIS market-cap ranking fallback failed: ${error.message}` : 'KIS market-cap ranking fallback failed.');
    }
  }

  const ranked = rankEligibleKoreaCommonStocks(ranking, 200);
  const items = toKoreaConstituents(ranked, 'KOSPI');

  if (items.length === 0) {
    throw new Error(`KOSPI market-cap top 200 could not be loaded. ${warnings.join(' ')}`);
  }
  if (items.length < 200) warnings.push(`Incomplete KOSPI market-cap input universe: ${items.length}/200 eligible stocks; downstream coverage gates must remain enforced.`);

  return {
    universe: 'KOSPI200',
    label: 'KOSPI 시가총액 상위 200',
    asOf: new Date().toISOString(),
    source: items.some((item) => item.priceSource.includes('KIS'))
      ? 'Naver Finance KOSPI market-cap ranking + KIS fallback'
      : 'Naver Finance KOSPI market-cap ranking',
    delayNote: 'KOSPI 시가총액 순위와 현재가는 Naver Finance 기준이며 지연될 수 있습니다.',
    items,
    warnings,
  };
}

async function fetchKosdaq150(): Promise<ScannerUniverseResponse> {
  const ranking = await fetchNaverKoreaMarketCapRanking('KOSDAQ', 200);
  const ranked = rankEligibleKoreaCommonStocks(ranking, 150);
  const items = toKoreaConstituents(ranked, 'KOSDAQ');

  if (items.length === 0) {
    throw new Error('KOSDAQ market-cap top 150 could not be loaded.');
  }

  return {
    universe: 'KOSDAQ150',
    label: 'KOSDAQ 시가총액 상위 150',
    asOf: new Date().toISOString(),
    source: 'Naver Finance KOSDAQ market-cap ranking',
    delayNote: 'KOSDAQ 시가총액 순위와 현재가는 Naver Finance 기준이며 지연될 수 있습니다.',
    items,
    warnings: items.length < 150 ? [`Only ${items.length} KOSDAQ rows were parsed.`] : [],
  };
}


export async function getKoreaMarketCapConstituents(market: KoreaMarket, limit: number): Promise<ScannerConstituent[]> {
  const ranking = await fetchNaverKoreaMarketCapRanking(market, Math.ceil(limit * 1.35));
  const ranked = rankEligibleKoreaCommonStocks(ranking, limit);
  return toKoreaConstituents(ranked, market);
}

export async function getStandardScannerUniverse(market: 'KR' | 'US'): Promise<ScannerConstituent[]> {
  if (market === 'KR') {
    const [kospi, kosdaq] = await Promise.all([
      getKoreaMarketCapConstituents('KOSPI', 200),
      getKoreaMarketCapConstituents('KOSDAQ', 150),
    ]);
    const byTicker = new Map<string, ScannerConstituent>();
    for (const item of [...kospi, ...kosdaq]) {
      if (!byTicker.has(item.ticker)) byTicker.set(item.ticker, { ...item, rank: byTicker.size + 1 });
    }
    return Array.from(byTicker.values());
  }

  // RS 모집단 확장: S&P 500 + NASDAQ 100 + Russell 1000 합집합 (~1,000~1,200 종목).
  // Russell 1000 fetch가 실패하면 자동으로 S&P 500 + NASDAQ 100(~530)으로 폴백.
  // 우선순위: S&P 500 → NASDAQ 100 → Russell 1000 (S&P 500 메타데이터 우선)
  const [sp500Result, nasdaq100Result, russell1000Result] = await Promise.allSettled([
    fetchStockAnalysisSp500(),
    fetchNasdaq100(),
    fetchStockAnalysisRussell1000(),
  ]);

  const byTicker = new Map<string, ScannerConstituent>();

  if (sp500Result.status === 'fulfilled') {
    for (const item of sp500Result.value.items) {
      byTicker.set(item.ticker, item);
    }
  }

  if (nasdaq100Result.status === 'fulfilled') {
    for (const item of nasdaq100Result.value.items) {
      if (!byTicker.has(item.ticker)) {
        byTicker.set(item.ticker, item);
      }
    }
  }

  if (russell1000Result.status === 'fulfilled') {
    for (const item of russell1000Result.value.items) {
      if (!byTicker.has(item.ticker)) {
        byTicker.set(item.ticker, item);
      }
    }
  }

  return Array.from(byTicker.values()).map((item, index) => ({ ...item, rank: index + 1 }));
}



export async function getScannerUniverse(universe: ScannerUniverse): Promise<ScannerUniverseResponse> {
  if (universe === 'NASDAQ100') return fetchNasdaq100();
  if (universe === 'SP500') return fetchStockAnalysisSp500();
  if (universe === 'KOSPI200') return fetchKospi200();
  if (universe === 'KOSDAQ150') return fetchKosdaq150();
  throw new Error('Unsupported scanner universe.');
}
