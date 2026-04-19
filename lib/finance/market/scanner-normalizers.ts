import type { ScannerConstituent } from '../../../types/index.ts';

type NasdaqRow = Record<string, unknown>;

export function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replaceAll(',', '').replaceAll('$', '').replaceAll('%', '').trim();
  if (!cleaned || cleaned === '-' || cleaned.toUpperCase() === 'N/A') return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanNasdaqName(value: string) {
  return value
    .replace(/\s+Common Stock.*$/i, '')
    .replace(/\s+Class [A-Z].*$/i, '')
    .replace(/\s+Ordinary Shares.*$/i, '')
    .replace(/\s+American Depositary Shares.*$/i, '')
    .trim();
}

export function normalizeNasdaqRows(rows: NasdaqRow[], priceAsOf: string | null): ScannerConstituent[] {
  return rows
    .map((row) => {
      const ticker = asString(row.symbol).toUpperCase();
      const name = cleanNasdaqName(asString(row.companyName));
      const marketCap = parseNumber(row.marketCap);
      const currentPrice = parseNumber(row.lastSalePrice);

      return {
        rank: 0,
        ticker,
        exchange: 'NAS',
        name,
        marketCap,
        currency: 'USD' as const,
        currentPrice,
        priceAsOf,
        priceSource: 'Nasdaq delayed quote',
      };
    })
    .filter((item) => item.ticker && item.name && item.marketCap !== null)
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, 100)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
