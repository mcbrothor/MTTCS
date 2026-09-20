import type { ScannerConstituent } from '../../../types/index.ts';

export const SP500_COMPONENTS_URL = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies';
export const SP500_MIN_CONSTITUENTS = 500;
export const SP500_MAX_CONSTITUENTS = 550;

function cellText(html: string) {
  return html.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

export function parseWikipediaSp500Constituents(html: string, asOf: string): ScannerConstituent[] {
  const table = Array.from(html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi))
    .find((match) => /\bid\s*=\s*["']constituents["']/i.test(match[1]));
  if (!table) throw new Error('Wikipedia S&P 500 constituent table not found.');
  let symbolColumn = -1;
  let securityColumn = -1;
  const items = new Map<string, ScannerConstituent>();
  for (const row of table[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rawCells = Array.from(row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi), (match) => match[1]);
    const cells = rawCells.map(cellText);
    if (cells.includes('Symbol') && cells.includes('Security')) {
      symbolColumn = cells.indexOf('Symbol');
      securityColumn = cells.indexOf('Security');
      continue;
    }
    if (symbolColumn < 0 || securityColumn < 0) continue;
    const ticker = (cells[symbolColumn] || '').toUpperCase().replaceAll('.', '-');
    const name = cells[securityColumn];
    const exchangeDomain = rawCells[symbolColumn]?.match(/\bhref\s*=\s*["']https?:\/\/(?:www\.)?(nyse|nasdaq)\.com\//i)?.[1]?.toLowerCase();
    if (!/^[A-Z]{1,6}(?:-[A-Z])?$/.test(ticker) || !name || !exchangeDomain) continue;
    items.set(ticker, {
      rank: 0, ticker, name, exchange: exchangeDomain === 'nyse' ? 'NYS' : 'NAS',
      marketCap: null, currency: 'USD', currentPrice: null, priceAsOf: asOf,
      priceSource: 'Wikipedia S&P 500 constituent list (membership only)',
    });
  }
  if (symbolColumn < 0 || securityColumn < 0) throw new Error('Wikipedia S&P 500 constituent table requires Symbol and Security headers.');
  if (items.size < SP500_MIN_CONSTITUENTS || items.size > SP500_MAX_CONSTITUENTS) {
    throw new Error(`Wikipedia S&P 500 constituent coverage invalid: ${items.size} unique rows (expected ${SP500_MIN_CONSTITUENTS}-${SP500_MAX_CONSTITUENTS}).`);
  }
  return Array.from(items.values(), (item, index) => ({ ...item, rank: index + 1 }));
}
