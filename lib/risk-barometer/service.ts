import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getFredSeries } from '@/lib/data/fred';
import { getScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getSecBarometerFinancials, type SecBarometerFinancials } from '@/lib/finance/providers/sec-edgar-api';
import { getYahooDailyPrice, getYahooFundamentals } from '@/lib/finance/providers/yahoo-api';
import type { OHLCData, RiskBarometerIndicatorKey } from '@/types';
import { computeRiskBarometer, evaluateRiskThreshold, type RiskIndicatorInput } from './model';
import { getLatestManualRiskObservations } from './repository';

const HYPERSCALERS = ['MSFT', 'GOOGL', 'AMZN', 'META'] as const;
const AI_LEADER_BASKET = ['MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'AVGO', 'AMD', 'ORCL'] as const;

interface CompanyData {
  ticker: string;
  sec: SecBarometerFinancials | null;
  prices: OHLCData[];
  marketCap: number | null;
}

function isoAtEndOfDay(date: string | null | undefined) {
  if (!date) return null;
  if (date.includes('T')) return date;
  return `${date}T23:59:59.000Z`;
}

export function fredQuarterEndTimestamp(date: string | null | undefined) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const quarterEndMonth = (Math.floor(parsed.getUTCMonth() / 3) * 3) + 2;
  const quarterEnd = new Date(Date.UTC(parsed.getUTCFullYear(), quarterEndMonth + 1, 0, 23, 59, 59));
  return quarterEnd.toISOString();
}

function formatPercent(value: number | null, digits = 1) {
  return value === null ? '확인 불가' : `${value.toFixed(digits)}%`;
}

function formatUsd(value: number | null) {
  if (value === null) return '확인 불가';
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absolute >= 1_000_000_000_000) return `${sign}$${(absolute / 1_000_000_000_000).toFixed(2)}T`;
  if (absolute >= 1_000_000_000) return `${sign}$${(absolute / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  return `${sign}$${absolute.toFixed(0)}`;
}

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function hashRiskBarometerInputs(inputs: RiskIndicatorInput[], asOf: string) {
  const canonical = inputs
    .map((input) => ({
      key: input.key,
      value: input.value,
      triggered: input.triggered,
      observedAt: input.observedAt,
      method: input.method,
      provider: input.provider,
      sourceUrl: input.sourceUrl,
      detail: input.detail,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return createHash('sha256')
    .update(JSON.stringify(stableValue({ asOf, inputs: canonical })))
    .digest('hex');
}

async function fetchConcentration(calcDate: string): Promise<RiskIndicatorInput | null> {
  const universe = await getScannerUniverse('SP500');
  const caps = universe.items
    .map((item) => item.marketCap)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  if (caps.length < 400) return null;
  const total = caps.reduce((sum, value) => sum + value, 0);
  const topTen = [...caps].sort((a, b) => b - a).slice(0, 10).reduce((sum, value) => sum + value, 0);
  const concentration = (topTen / total) * 100;
  const universeDate = String(universe.asOf || '').slice(0, 10);
  const observedDate = universeDate && universeDate < calcDate ? universeDate : calcDate;
  return {
    key: 'sp500_concentration',
    value: concentration,
    displayValue: formatPercent(concentration),
    triggered: evaluateRiskThreshold('sp500_concentration', concentration),
    observedAt: isoAtEndOfDay(observedDate),
    detail: `${caps.length}개 구성종목의 시가총액을 합산한 MTN 프록시입니다.`,
  };
}

async function fetchFredIndicator(input: {
  key: RiskBarometerIndicatorKey;
  seriesId: string;
  threshold: (value: number) => boolean;
  display?: (value: number) => string;
}): Promise<RiskIndicatorInput | null> {
  const latest = (await getFredSeries(input.seriesId, 8)).at(-1);
  if (!latest) return null;
  return {
    key: input.key,
    value: latest.value,
    displayValue: input.display?.(latest.value) ?? formatPercent(latest.value),
    triggered: input.threshold(latest.value),
    observedAt: input.seriesId.endsWith('Q')
      ? fredQuarterEndTimestamp(latest.date)
      : isoAtEndOfDay(latest.date),
    provider: `FRED ${input.seriesId}`,
    sourceUrl: `https://fred.stlouisfed.org/series/${input.seriesId}`,
    detail: `공식 FRED 시계열 ${input.seriesId}의 최근 관측값입니다.`,
  };
}

async function fetchCrossHoldings(): Promise<RiskIndicatorInput | null> {
  const [corporate, total] = await Promise.all([
    getFredSeries('BOGZ1FL103064103Q', 8),
    getFredSeries('BOGZ1FL893064105Q', 8),
  ]);
  const numerator = corporate.at(-1);
  const denominator = total.at(-1);
  if (!numerator || !denominator || denominator.value <= 0) return null;
  const ratio = (numerator.value / denominator.value) * 100;
  const observedDate = numerator.date < denominator.date ? numerator.date : denominator.date;
  return {
    key: 'corporate_cross_holdings',
    value: ratio,
    displayValue: formatPercent(ratio),
    triggered: evaluateRiskThreshold('corporate_cross_holdings', ratio),
    observedAt: fredQuarterEndTimestamp(observedDate),
    detail: '비금융기업 보유 기업주식 자산을 전체 부문 기업주식 자산으로 나눈 Z.1 프록시입니다.',
  };
}

async function fetchMarketParticipation(client: SupabaseClient, calcDate: string): Promise<RiskIndicatorInput | null> {
  const [breadthResult, fetchedSpyBars] = await Promise.all([
    client.rpc('get_us_breadth_series', { p_limit: 60 }),
    getYahooDailyPrice('SPY'),
  ]);
  if (breadthResult.error) throw breadthResult.error;
  const breadthRows = (breadthResult.data || []) as Array<{
    calc_date: string;
    total_count: number;
    breadth_pct: number;
  }>;
  const spyBars = fetchedSpyBars.filter((row) => row.date <= calcDate);
  const currentSpyBar = spyBars.at(-1);
  const priorSpyBar = spyBars.at(-21);
  if (!currentSpyBar || !priorSpyBar) return null;
  const eligibleBreadth = breadthRows.filter((row) => row.total_count >= 400);
  const currentBreadthRow = eligibleBreadth.find((row) => row.calc_date <= currentSpyBar.date);
  const priorBreadthRow = eligibleBreadth.find((row) => row.calc_date <= priorSpyBar.date);
  if (!currentBreadthRow || !priorBreadthRow || currentBreadthRow.calc_date === priorBreadthRow.calc_date) return null;
  const currentBreadth = Number(currentBreadthRow.breadth_pct);
  const priorBreadth = Number(priorBreadthRow.breadth_pct);
  const breadthChange = currentBreadth - priorBreadth;
  const currentSpy = currentSpyBar.close;
  const priorSpy = priorSpyBar.close;
  if (currentSpy === null || priorSpy === null || priorSpy <= 0) return null;
  const spyReturn = ((currentSpy / priorSpy) - 1) * 100;
  return {
    key: 'market_participation',
    value: breadthChange,
    displayValue: `폭 ${breadthChange >= 0 ? '+' : ''}${breadthChange.toFixed(1)}%p · SPY ${spyReturn >= 0 ? '+' : ''}${spyReturn.toFixed(1)}%`,
    triggered: evaluateRiskThreshold('market_participation', breadthChange, { spyReturn20d: spyReturn }),
    observedAt: isoAtEndOfDay(
      currentBreadthRow.calc_date < currentSpyBar.date
        ? currentBreadthRow.calc_date
        : currentSpyBar.date,
    ),
    detail: `${currentBreadthRow.total_count}개 미국 종목의 200일선 상회율을 20거래일 전과 비교했습니다.`,
  };
}

async function fetchCompanyData(ticker: string, calcDate: string): Promise<CompanyData> {
  const [sec, prices, fundamentals] = await Promise.all([
    getSecBarometerFinancials(ticker),
    getYahooDailyPrice(ticker).catch(() => []),
    getYahooFundamentals(ticker),
  ]);
  return {
    ticker,
    sec,
    prices: prices.filter((row) => row.date <= calcDate),
    marketCap: fundamentals?.marketCap ?? null,
  };
}

async function fetchAiLeaderCompanies(calcDate: string) {
  const companies: CompanyData[] = [];
  for (let index = 0; index < AI_LEADER_BASKET.length; index += 2) {
    const batch = AI_LEADER_BASKET.slice(index, index + 2);
    companies.push(...await Promise.all(batch.map((ticker) => fetchCompanyData(ticker, calcDate))));
  }
  return companies;
}

function oldestObservedAt(companies: CompanyData[]) {
  if (companies.some((company) => !company.sec?.observedAt)) return null;
  const values = companies
    .map((company) => company.sec?.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return values[0] ?? null;
}

function computeValuationContribution(companies: CompanyData[]): RiskIndicatorInput | null {
  const usable = companies.flatMap((company) => {
    const currentPrice = company.prices.at(-1)?.close ?? null;
    const priorPrice = company.prices.length >= 240
      ? company.prices[Math.max(0, company.prices.length - 253)]?.close ?? null
      : null;
    const currentEps = company.sec?.ttmEps ?? null;
    const priorEps = company.sec?.priorTtmEps ?? null;
    if (
      currentPrice === null || priorPrice === null || priorPrice <= 0
      || currentEps === null || priorEps === null || priorEps <= 0
    ) return [];
    const priceReturn = ((currentPrice / priorPrice) - 1) * 100;
    const epsGrowth = ((currentEps / priorEps) - 1) * 100;
    if (priceReturn <= 0) return [];
    return [{ company, priceReturn, epsGrowth }];
  });
  if (usable.length < 4) return null;
  const positiveReturn = usable.reduce((sum, item) => sum + item.priceReturn, 0);
  const valuationReturn = usable.reduce(
    (sum, item) => sum + Math.max(0, item.priceReturn - item.epsGrowth),
    0,
  );
  const contribution = positiveReturn > 0
    ? Math.min(100, (valuationReturn / positiveReturn) * 100)
    : null;
  if (contribution === null) return null;
  return {
    key: 'valuation_driven_returns',
    value: contribution,
    displayValue: formatPercent(contribution),
    triggered: evaluateRiskThreshold('valuation_driven_returns', contribution),
    observedAt: oldestObservedAt(usable.map((item) => item.company)),
    detail: `${usable.length}개 AI 리더의 양(+) 12개월 수익에서 TTM EPS 성장으로 설명되지 않는 비중입니다.`,
  };
}

function computeHyperscalerFcf(companies: CompanyData[]): RiskIndicatorInput | null {
  const usable = companies.filter((company) =>
    company.sec?.ttmFreeCashFlow !== null
    && company.sec?.ttmFreeCashFlow !== undefined
    && company.sec?.priorTtmFreeCashFlow !== null
    && company.sec?.priorTtmFreeCashFlow !== undefined);
  if (usable.length !== HYPERSCALERS.length) return null;
  const current = usable.reduce((sum, company) => sum + Number(company.sec?.ttmFreeCashFlow), 0);
  const prior = usable.reduce((sum, company) => sum + Number(company.sec?.priorTtmFreeCashFlow), 0);
  const growth = percentChange(current, prior);
  return {
    key: 'hyperscaler_fcf',
    value: current,
    displayValue: `${formatUsd(current)} · YoY ${formatPercent(growth)}`,
    triggered: evaluateRiskThreshold('hyperscaler_fcf', current, { priorValue: prior }),
    observedAt: oldestObservedAt(usable),
    detail: 'MSFT·GOOGL·AMZN·META의 영업현금흐름에서 설비투자를 차감한 합산 TTM 값입니다.',
  };
}

function computeHyperscalerLeverage(companies: CompanyData[]): RiskIndicatorInput | null {
  const usable = companies.filter((company) =>
    company.sec?.ttmOperatingIncome !== null
    && company.sec?.ttmOperatingIncome !== undefined
    && company.sec?.ttmInterestExpense !== null
    && company.sec?.ttmInterestExpense !== undefined
    && company.sec?.cash !== null
    && company.sec?.cash !== undefined
    && company.sec?.debt !== null
    && company.sec?.debt !== undefined
    && company.marketCap !== null);
  if (usable.length !== HYPERSCALERS.length) return null;
  const operatingIncome = usable.reduce((sum, company) => sum + Number(company.sec?.ttmOperatingIncome), 0);
  const interestExpense = usable.reduce((sum, company) => sum + Number(company.sec?.ttmInterestExpense), 0);
  const cash = usable.reduce((sum, company) => sum + Number(company.sec?.cash), 0);
  const debt = usable.reduce((sum, company) => sum + Number(company.sec?.debt), 0);
  const marketCap = usable.reduce((sum, company) => sum + Number(company.marketCap), 0);
  if (marketCap <= 0) return null;
  const coverage = interestExpense <= 0 ? Number.POSITIVE_INFINITY : operatingIncome / interestExpense;
  const netDebtRatio = ((debt - cash) / marketCap) * 100;
  const coverageLabel = Number.isFinite(coverage) ? `${coverage.toFixed(1)}x` : '∞';
  return {
    key: 'hyperscaler_leverage',
    value: netDebtRatio,
    displayValue: `${coverageLabel} | ${netDebtRatio.toFixed(1)}%`,
    triggered: evaluateRiskThreshold('hyperscaler_leverage', netDebtRatio, {
      interestCoverage: coverage,
      netDebtToMarketCapPct: netDebtRatio,
    }),
    observedAt: oldestObservedAt(usable),
    detail: '4개사 합산 영업이익/이자비용과 순부채/시가총액을 함께 판정합니다.',
  };
}

function manualRowsToInputs(
  rows: Array<Record<string, unknown> | null>,
  dgs10: Awaited<ReturnType<typeof getFredSeries>>,
): RiskIndicatorInput[] {
  const output: RiskIndicatorInput[] = [];
  for (const row of rows) {
    if (!row) continue;
    const key = String(row.indicator_key) as RiskBarometerIndicatorKey;
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    if (key === 'margin_debt') {
      output.push({
        key,
        value,
        displayValue: formatUsd(value),
        triggered: evaluateRiskThreshold('margin_debt', value),
        observedAt: String(row.observed_at),
        sourceUrl: String(row.source_url),
        provider: String(row.provider),
        method: 'MANUAL',
        detail: String(row.source_excerpt || '관리자 승인 FINRA 관측값입니다.'),
      });
    } else if (key === 'capital_market_frenzy') {
      output.push({
        key,
        value,
        displayValue: formatPercent(value, 2),
        triggered: evaluateRiskThreshold('capital_market_frenzy', value),
        observedAt: String(row.observed_at),
        sourceUrl: String(row.source_url),
        provider: String(row.provider),
        method: 'MANUAL',
        detail: String(row.source_excerpt || '관리자 승인 SIFMA 관측값입니다.'),
      });
    } else if (key === 'equity_risk_premium') {
      const yieldObservation = dgs10.at(-1);
      if (!yieldObservation || value <= 0) continue;
      const earningsYield = (1 / value) * 100;
      const premium = earningsYield - yieldObservation.value;
      output.push({
        key,
        value: premium,
        displayValue: `${premium.toFixed(2)}% (Fwd P/E ${value.toFixed(1)}x)`,
        triggered: evaluateRiskThreshold('equity_risk_premium', premium),
        observedAt: String(row.observed_at),
        sourceUrl: String(row.source_url),
        provider: 'Approved Forward P/E + FRED DGS10',
        method: 'MANUAL',
        freshnessHours: 7 * 24,
        detail: `승인 Forward P/E의 이익수익률에서 DGS10 ${yieldObservation.value.toFixed(2)}%를 차감했습니다.`,
      });
    }
  }
  return output;
}

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

export async function buildRiskBarometerSnapshot(input: {
  client: SupabaseClient;
  calcDate?: string;
}) {
  const calcDate = input.calcDate || new Date().toISOString().slice(0, 10);
  const asOf = `${calcDate}T23:59:59.000Z`;
  const companyPromise = fetchAiLeaderCompanies(calcDate);
  const [
    concentrationResult,
    householdResult,
    crossHoldingsResult,
    participationResult,
    manualResult,
    dgs10Result,
    companiesResult,
  ] = await Promise.allSettled([
    fetchConcentration(calcDate),
    fetchFredIndicator({
      key: 'household_equity_exposure',
      seriesId: 'BOGZ1FL153064476Q',
      threshold: (value) => Boolean(evaluateRiskThreshold('household_equity_exposure', value)),
    }),
    fetchCrossHoldings(),
    fetchMarketParticipation(input.client, calcDate),
    getLatestManualRiskObservations(input.client),
    getFredSeries('DGS10', 10),
    companyPromise,
  ]);

  const indicators: RiskIndicatorInput[] = [
    fulfilled(concentrationResult),
    fulfilled(householdResult),
    fulfilled(crossHoldingsResult),
    fulfilled(participationResult),
  ].filter((value): value is RiskIndicatorInput => Boolean(value));

  const companies = fulfilled(companiesResult);
  if (companies) {
    const hyperscalers = companies.filter((company) =>
      HYPERSCALERS.includes(company.ticker as (typeof HYPERSCALERS)[number]));
    indicators.push(
      ...[
        computeValuationContribution(companies),
        computeHyperscalerFcf(hyperscalers),
        computeHyperscalerLeverage(hyperscalers),
      ].filter((value): value is RiskIndicatorInput => Boolean(value)),
    );
  }

  const manualRows = fulfilled(manualResult);
  const dgs10 = fulfilled(dgs10Result);
  if (manualRows && dgs10) indicators.push(...manualRowsToInputs(manualRows, dgs10));

  const response = computeRiskBarometer(indicators, { asOf });
  return {
    response,
    inputHash: hashRiskBarometerInputs(indicators, asOf),
    inputs: indicators,
  };
}
