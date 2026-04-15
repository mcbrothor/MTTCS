import axios from 'axios';
import type { FundamentalSnapshot } from '@/types';

interface SecTickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SecFactUnit {
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  val?: number;
}

interface SecCompanyFacts {
  facts?: {
    ['us-gaap']?: Record<string, {
      units?: Record<string, SecFactUnit[]>;
    }>;
  };
}

let tickerMapCache: Map<string, string> | null = null;
let tickerMapFetchedAt = 0;
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;

function secHeaders() {
  return {
    'user-agent': process.env.SEC_USER_AGENT || 'MTN/4.0 contact@mtn.local',
    accept: 'application/json',
  };
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function pctChange(latest: number | null, previous: number | null) {
  if (latest === null || previous === null || previous === 0) return null;
  return round(((latest - previous) / Math.abs(previous)) * 100);
}

function padCik(cik: string) {
  return cik.padStart(10, '0');
}

async function getTickerMap() {
  const now = Date.now();
  if (tickerMapCache && now - tickerMapFetchedAt < TICKER_MAP_TTL_MS) return tickerMapCache;

  const response = await axios.get<Record<string, SecTickerRow>>('https://www.sec.gov/files/company_tickers.json', {
    headers: secHeaders(),
    timeout: 10_000,
  });

  const map = new Map<string, string>();
  for (const row of Object.values(response.data || {})) {
    if (row?.ticker && row?.cik_str) {
      map.set(row.ticker.toUpperCase(), padCik(String(row.cik_str)));
    }
  }

  tickerMapCache = map;
  tickerMapFetchedAt = now;
  return map;
}

async function getCikForTicker(ticker: string) {
  const map = await getTickerMap();
  return map.get(ticker.toUpperCase()) || null;
}

function annualFacts(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const gaap = companyFacts.facts?.['us-gaap'];
  if (!gaap) return [];

  const rows: SecFactUnit[] = [];
  for (const tag of tags) {
    const unitBuckets = gaap[tag]?.units;
    if (!unitBuckets) continue;

    for (const unit of units) {
      rows.push(...(unitBuckets[unit] || []));
    }
  }

  const annualForms = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
  const byYear = new Map<number, SecFactUnit>();

  for (const row of rows) {
    if (typeof row.val !== 'number' || !row.fy || !row.form) continue;
    if (!annualForms.has(row.form)) continue;
    if (row.fp && row.fp !== 'FY') continue;

    const existing = byYear.get(row.fy);
    if (!existing || String(row.filed || '') > String(existing.filed || '')) {
      byYear.set(row.fy, row);
    }
  }

  return Array.from(byYear.values())
    .filter((row) => typeof row.val === 'number')
    .sort((a, b) => Number(a.fy) - Number(b.fy));
}

function latestValue(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const facts = annualFacts(companyFacts, tags, units);
  return facts.at(-1)?.val ?? null;
}

function annualGrowth(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const facts = annualFacts(companyFacts, tags, units);
  const latest = facts.at(-1)?.val ?? null;
  const previous = facts.at(-2)?.val ?? null;
  return pctChange(latest, previous);
}

export async function getSecFundamentals(ticker: string): Promise<FundamentalSnapshot | null> {
  try {
    const cik = await getCikForTicker(ticker);
    if (!cik) return null;

    const response = await axios.get<SecCompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: secHeaders(),
      timeout: 10_000,
    });

    const facts = response.data;
    const revenueGrowthPct = annualGrowth(
      facts,
      ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
      ['USD']
    );
    const epsGrowthPct = annualGrowth(facts, ['EarningsPerShareDiluted', 'EarningsPerShareBasic'], ['USD/shares']);
    const netIncome = latestValue(facts, ['NetIncomeLoss', 'ProfitLoss'], ['USD']);
    const equity = latestValue(
      facts,
      ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
      ['USD']
    );
    const liabilities = latestValue(facts, ['Liabilities'], ['USD']);

    const roePct = netIncome !== null && equity !== null && equity !== 0 ? round((netIncome / equity) * 100) : null;
    const debtToEquityPct =
      liabilities !== null && equity !== null && equity !== 0 ? round((liabilities / equity) * 100) : null;

    if ([epsGrowthPct, revenueGrowthPct, roePct, debtToEquityPct].every((value) => value === null)) {
      return null;
    }

    return {
      epsGrowthPct,
      revenueGrowthPct,
      roePct,
      debtToEquityPct,
      source: 'SEC EDGAR companyfacts',
    };
  } catch (error) {
    console.warn('SEC fundamentals fallback failed:', error);
    return null;
  }
}
