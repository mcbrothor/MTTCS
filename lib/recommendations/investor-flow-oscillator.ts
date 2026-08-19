import type { InvestorFlowOscillatorSector, InvestorFlowOscillatorSnapshot } from '@/types';
import type { KrInvestorFlowDaily } from '@/lib/recommendations/kr-investor-flow';

const MODEL_VERSION = 'kr-investor-flow-oscillator-v1';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function state(score: number): InvestorFlowOscillatorSector['state'] {
  if (score >= 20) return 'INFLOW';
  if (score <= -20) return 'OUTFLOW';
  if (score < 0) return 'SLOWING';
  return 'NEUTRAL';
}

export function calculateInvestorFlowOscillator(input: {
  rows: KrInvestorFlowDaily[];
  sectors: Record<string, string | null | undefined>;
  priceReturns5d?: Record<string, number | null | undefined>;
  requestedStocks: number;
  asOf: string;
  provider?: string;
  universe?: 'KOSPI200_KOSDAQ150' | 'CUSTOM';
}): InvestorFlowOscillatorSnapshot {
  const grouped = new Map<string, KrInvestorFlowDaily[]>();
  for (const row of input.rows.filter((row) => row.tradeDate <= input.asOf)) {
    const list = grouped.get(row.ticker) || [];
    list.push(row);
    grouped.set(row.ticker, list);
  }

  const sectorStocks = new Map<string, Array<{
    ticker: string;
    amount5: number;
    turnover5: number;
    consecutive: number;
    acceleration: number;
    priceReturn: number | null;
  }>>();
  for (const [ticker, unsorted] of grouped) {
    const rows = [...unsorted].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)).slice(-10);
    const latest5 = rows.slice(-5);
    if (latest5.length === 0) continue;
    const combined = (row: KrInvestorFlowDaily) => row.foreignNetBuyAmountMkrw + row.institutionNetBuyAmountMkrw;
    const amount5 = latest5.reduce((sum, row) => sum + combined(row), 0);
    const turnover5 = latest5.reduce((sum, row) => sum + Math.max(0, row.turnoverAmountMkrw), 0);
    const recent3 = rows.slice(-3);
    const prior3 = rows.slice(-6, -3);
    const avg = (items: KrInvestorFlowDaily[]) => items.length > 0
      ? items.reduce((sum, row) => sum + combined(row), 0) / items.length
      : 0;
    let consecutive = 0;
    for (const row of [...rows].reverse()) {
      if (combined(row) <= 0) break;
      consecutive += 1;
    }
    const sector = input.sectors[ticker] || '미분류';
    const list = sectorStocks.get(sector) || [];
    list.push({
      ticker,
      amount5,
      turnover5,
      consecutive,
      acceleration: avg(recent3) - avg(prior3),
      priceReturn: input.priceReturns5d?.[ticker] ?? null,
    });
    sectorStocks.set(sector, list);
  }

  const sectors = [...sectorStocks].map(([sector, stocks]): InvestorFlowOscillatorSector => {
    const amount5 = stocks.reduce((sum, item) => sum + item.amount5, 0);
    const turnover5 = stocks.reduce((sum, item) => sum + item.turnover5, 0);
    const combinedNetBuyRatio5d = turnover5 > 0 ? (amount5 / turnover5) * 100 : null;
    const accelerationAmount = stocks.reduce((sum, item) => sum + item.acceleration, 0);
    const acceleration = turnover5 > 0 ? (accelerationAmount / (turnover5 / 5)) * 100 : null;
    const ratioScore = (combinedNetBuyRatio5d ?? 0) * 12;
    const accelerationScore = (acceleration ?? 0) * 3;
    const persistenceScore = (stocks.reduce((sum, item) => sum + Math.min(item.consecutive, 5), 0) / stocks.length) * 4;
    const score = round(clamp(ratioScore + accelerationScore + persistenceScore, -100, 100), 1) ?? 0;
    const aggregatePrice = stocks.map((item) => item.priceReturn).filter((value): value is number => value !== null);
    const priceReturn = aggregatePrice.length > 0
      ? aggregatePrice.reduce((sum, value) => sum + value, 0) / aggregatePrice.length
      : null;
    const divergence = priceReturn === null || combinedNetBuyRatio5d === null
      ? 'UNKNOWN'
      : priceReturn < 0 && combinedNetBuyRatio5d > 0
        ? 'BULLISH'
        : priceReturn > 0 && combinedNetBuyRatio5d < 0
          ? 'BEARISH'
          : 'NONE';
    return {
      sector,
      score,
      state: state(score),
      combinedNetBuyRatio5d: round(combinedNetBuyRatio5d),
      consecutiveNetBuyDays: Math.max(...stocks.map((item) => item.consecutive)),
      acceleration: round(acceleration),
      priceFlowDivergence: divergence,
      coveredStocks: stocks.length,
    };
  }).sort((a, b) => b.score - a.score);

  const coveredStocks = grouped.size;
  const coverage = input.requestedStocks > 0 ? coveredStocks / input.requestedStocks : 0;
  const latestTradeDate = input.rows.map((row) => row.tradeDate).sort().at(-1) || null;
  const ageDays = latestTradeDate
    ? Math.floor((new Date(`${input.asOf}T00:00:00Z`).getTime() - new Date(`${latestTradeDate}T00:00:00Z`).getTime()) / 86_400_000)
    : Infinity;
  const latestRows = latestTradeDate ? input.rows.filter((row) => row.tradeDate === latestTradeDate) : [];
  const stale = ageDays > 4 || latestRows.some((row) => row.quality === 'STALE');
  const overallScore = sectors.length > 0
    ? sectors.reduce((sum, item) => sum + item.score * item.coveredStocks, 0) / coveredStocks
    : null;
  const warnings: string[] = [];
  if (coverage < 0.8) warnings.push(`수급 데이터 커버리지가 ${Math.round(coverage * 100)}%입니다.`);
  if (stale && latestTradeDate) warnings.push(`최근 수급 데이터가 ${latestTradeDate}로 오래되었습니다.`);
  if (sectors.some((item) => item.priceFlowDivergence === 'UNKNOWN')) warnings.push('일부 종목의 가격 데이터가 없어 다이버전스를 생략했습니다.');

  return {
    asOf: input.asOf,
    provider: input.provider || input.rows.at(-1)?.provider || 'KIS',
    quality: coveredStocks === 0 ? 'BLOCKED' : stale ? 'STALE' : coverage >= 0.8 ? 'FULL' : 'DEGRADED',
    modelVersion: MODEL_VERSION,
    warnings,
    market: 'KR',
    universe: input.universe || 'CUSTOM',
    state: overallScore === null || stale || coverage < 0.5 ? 'BLOCKED' : state(overallScore),
    score: round(overallScore, 1),
    sectors,
    coveredStocks,
    requestedStocks: input.requestedStocks,
  };
}
