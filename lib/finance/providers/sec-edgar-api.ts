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
  frame?: string;
  start?: string;
  end?: string;
  val?: number;
}

interface SecCompanyFacts {
  facts?: {
    ['us-gaap']?: Record<
      string,
      {
        units?: Record<string, SecFactUnit[]>;
      }
    >;
  };
}

let tickerMapCache: Map<string, string> | null = null;
let tickerMapFetchedAt = 0;
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;
const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
const QUARTERLY_FORMS = new Set(['10-Q', '10-Q/A', '10-QT', '10-QT/A', '10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
const QUARTER_ORDER: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };

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

function durationDays(row: SecFactUnit) {
  if (!row.start || !row.end) return null;
  const start = new Date(row.start);
  const end = new Date(row.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function sortByPeriodDesc(a: SecFactUnit, b: SecFactUnit) {
  const endA = String(a.end || '');
  const endB = String(b.end || '');
  if (endA !== endB) return endB.localeCompare(endA);

  const fyA = Number(a.fy || 0);
  const fyB = Number(b.fy || 0);
  if (fyA !== fyB) return fyB - fyA;

  const fpA = QUARTER_ORDER[a.fp || ''] || 0;
  const fpB = QUARTER_ORDER[b.fp || ''] || 0;
  if (fpA !== fpB) return fpB - fpA;

  return String(b.filed || '').localeCompare(String(a.filed || ''));
}

function extractUnits(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
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

  return rows.filter((row) => typeof row.val === 'number');
}

function annualFacts(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const byYear = new Map<number, SecFactUnit>();

  for (const row of extractUnits(companyFacts, tags, units)) {
    if (!row.fy || !row.form || !ANNUAL_FORMS.has(row.form)) continue;
    const duration = durationDays(row);
    if (row.fp && row.fp !== 'FY' && duration !== null && (duration < 300 || duration > 430)) continue;

    const existing = byYear.get(row.fy);
    if (!existing || sortByPeriodDesc(row, existing) < 0) {
      byYear.set(row.fy, row);
    }
  }

  return Array.from(byYear.values()).sort(sortByPeriodDesc);
}

function quarterlyFacts(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const byQuarter = new Map<string, SecFactUnit>();

  for (const row of extractUnits(companyFacts, tags, units)) {
    if (!row.fy || !row.form || !QUARTERLY_FORMS.has(row.form)) continue;
    const duration = durationDays(row);
    const fp = row.fp || '';
    const isQuarterLabel = fp in QUARTER_ORDER;
    const isQuarterDuration = duration !== null && duration >= 70 && duration <= 120;
    if (!isQuarterLabel && !isQuarterDuration) continue;

    const normalizedFp = isQuarterLabel ? fp : `Q${Math.max(1, Math.min(4, Math.round((new Date(row.end || '').getMonth() + 1) / 3)))}`;
    const key = `${row.fy}-${normalizedFp}`;
    const normalizedRow = { ...row, fp: normalizedFp };
    const existing = byQuarter.get(key);
    if (!existing || sortByPeriodDesc(normalizedRow, existing) < 0) {
      byQuarter.set(key, normalizedRow);
    }
  }

  return Array.from(byQuarter.values()).sort(sortByPeriodDesc);
}

function quarterlyGrowthSeries(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const quarters = quarterlyFacts(companyFacts, tags, units);
  const byKey = new Map(quarters.map((row) => [`${row.fy}-${row.fp}`, row]));

  return quarters.slice(0, 3).map((row) => {
    const previousYear = byKey.get(`${Number(row.fy) - 1}-${row.fp}`);
    return pctChange(row.val ?? null, previousYear?.val ?? null);
  });
}

function annualGrowthSeries(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const rows = annualFacts(companyFacts, tags, units);
  const growths: (number | null)[] = [];
  for (let i = 0; i < Math.min(3, rows.length - 1); i += 1) {
    growths.push(pctChange(rows[i].val ?? null, rows[i + 1].val ?? null));
  }
  while (growths.length < 3) growths.push(null);
  return growths;
}

function hasNegativeAnnualValue(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const rows = annualFacts(companyFacts, tags, units).slice(0, 3);
  if (rows.length === 0) return null;
  return rows.some((row) => typeof row.val === 'number' && row.val < 0);
}

function latestInstantValue(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  const rows = extractUnits(companyFacts, tags, units)
    .filter((row) => !row.start && row.end)
    .sort(sortByPeriodDesc);
  return rows[0]?.val ?? null;
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

function latestValue(companyFacts: SecCompanyFacts, tags: string[], units: string[]) {
  return annualFacts(companyFacts, tags, units)[0]?.val ?? null;
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
    const epsGrowthLast3Qtrs = quarterlyGrowthSeries(
      facts,
      ['EarningsPerShareDiluted', 'EarningsPerShareBasic'],
      ['USD-per-shares', 'USD/shares']
    );
    const annualEpsGrowthEachYear = annualGrowthSeries(facts, ['NetIncomeLoss', 'ProfitLoss'], ['USD']);
    const currentQtrEpsGrowth = epsGrowthLast3Qtrs[0] ?? null;
    const priorQtrEpsGrowth = epsGrowthLast3Qtrs[1] ?? null;

    const currentQtrSalesSeries = quarterlyGrowthSeries(
      facts,
      ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
      ['USD']
    );
    const currentQtrSalesGrowth = currentQtrSalesSeries[0] ?? null;

    const netIncome = latestValue(facts, ['NetIncomeLoss', 'ProfitLoss'], ['USD']);
    const equity = latestValue(
      facts,
      ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
      ['USD']
    );
    const liabilities = latestValue(facts, ['Liabilities'], ['USD']);
    const hadNegativeEpsInLast3Yr = hasNegativeAnnualValue(facts, ['NetIncomeLoss', 'ProfitLoss'], ['USD']);
    const floatShares =
      latestInstantValue(facts, ['CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding'], ['shares']) ??
      null;
    const weightedShareSeries = annualFacts(
      facts,
      ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfShareOutstandingBasicAndDiluted'],
      ['shares']
    );
    const sharesBuyback =
      weightedShareSeries.length >= 2 &&
      typeof weightedShareSeries[0]?.val === 'number' &&
      typeof weightedShareSeries[1]?.val === 'number'
        ? weightedShareSeries[0].val < weightedShareSeries[1].val
        : null;

    const roePct = netIncome !== null && equity !== null && equity !== 0 ? round((netIncome / equity) * 100) : null;
    const debtToEquityPct =
      liabilities !== null && equity !== null && equity !== 0 ? round((liabilities / equity) * 100) : null;

    const hasUsefulData =
      currentQtrEpsGrowth !== null ||
      currentQtrSalesGrowth !== null ||
      annualEpsGrowthEachYear.some((value) => value !== null) ||
      hadNegativeEpsInLast3Yr !== null ||
      floatShares !== null ||
      sharesBuyback !== null ||
      roePct !== null ||
      debtToEquityPct !== null;

    if (!hasUsefulData) return null;

    return {
      epsGrowthPct: currentQtrEpsGrowth,
      revenueGrowthPct: currentQtrSalesGrowth,
      roePct,
      debtToEquityPct,
      currentQtrEpsGrowth,
      priorQtrEpsGrowth,
      epsGrowthLast3Qtrs,
      currentQtrSalesGrowth,
      annualEpsGrowthEachYear,
      hadNegativeEpsInLast3Yr,
      floatShares,
      sharesBuyback,
      source: 'SEC EDGAR companyfacts',
    };
  } catch (error) {
    console.warn('SEC fundamentals fallback failed:', error);
    return null;
  }
}
