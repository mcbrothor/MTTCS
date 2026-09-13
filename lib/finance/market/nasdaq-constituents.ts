import type { ScannerConstituent } from '../../../types/index.ts';

export const NASDAQ_COMPONENTS_URL = 'https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies';
export const NASDAQ_MIN_CONSTITUENTS = 100;
const NASDAQ_MAX_CONSTITUENTS = 150;

function cellText(html: string) {
  return html
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWikipediaNasdaqConstituents(html: string, asOf: string): ScannerConstituent[] {
  const tables = Array.from(html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi));
  const identified = tables.filter((table) => /\bid\s*=\s*["']constituents["']/i.test(table[1]));
  let coverageError: string | null = null;
  for (const table of identified.length ? identified : tables) {
    const rows = Array.from(table[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    let tickerColumn = -1;
    let nameColumn = -1;
    const items = new Map<string, ScannerConstituent>();
    for (const row of rows) {
      const cells = Array.from(row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi))
        .map((cell) => cellText(cell[1]));
      const headerTicker = cells.findIndex((cell) => /^(ticker|symbol)$/i.test(cell));
      const headerName = cells.findIndex((cell) => /^(company|company name)$/i.test(cell));
      if (headerTicker >= 0 && headerName >= 0) {
        tickerColumn = headerTicker;
        nameColumn = headerName;
        continue;
      }
      if (tickerColumn < 0 || nameColumn < 0) continue;
      const ticker = (cells[tickerColumn] || '').toUpperCase().replaceAll('.', '-');
      const name = cells[nameColumn];
      if (!/^[A-Z]{1,6}(?:-[A-Z])?$/.test(ticker) || !name) continue;
      items.set(ticker, {
        rank: 0, ticker, name, exchange: 'NAS', marketCap: null, currency: 'USD',
        currentPrice: null, priceAsOf: asOf, priceSource: 'Wikipedia Nasdaq-100 list',
      });
    }
    if (tickerColumn < 0 || nameColumn < 0) continue;
    if (items.size < NASDAQ_MIN_CONSTITUENTS || items.size > NASDAQ_MAX_CONSTITUENTS) {
      coverageError = `Wikipedia Nasdaq 100 constituent coverage invalid: ${items.size} unique rows (expected ${NASDAQ_MIN_CONSTITUENTS}-${NASDAQ_MAX_CONSTITUENTS}).`;
      continue;
    }
    return Array.from(items.values(), (item, index) => ({ ...item, rank: index + 1 }));
  }
  if (coverageError) throw new Error(coverageError);
  throw new Error('Wikipedia Nasdaq 100 constituent table not found: Ticker and Company headers are required.');
}
