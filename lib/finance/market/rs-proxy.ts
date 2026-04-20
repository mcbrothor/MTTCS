import type { DataQuality, MacroActionLevel, OHLCData } from '../../../types/index.ts';

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export interface IbdProxyInput {
  currentPrice?: number | null;
  price3mAgo?: number | null;
  price6mAgo?: number | null;
  price9mAgo?: number | null;
  price12mAgo?: number | null;
}

export interface IbdProxyResult {
  ibdProxyScore: number | null;
  dataQuality: DataQuality;
  availableWeight: number;
  q1Return: number | null;
  q2Return: number | null;
  q3Return: number | null;
  q4Return: number | null;
}

export interface MansfieldResult {
  mansfieldRsFlag: boolean | null;
  mansfieldRsScore: number | null;
  stockPerformance52w: number | null;
  benchmarkPerformance52w: number | null;
}

export interface MacroTrendEvaluation {
  isUptrend50: boolean | null;
  isUptrend200: boolean | null;
  actionLevel: MacroActionLevel;
}

const hasPrice = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function byDateMap(data: OHLCData[]) {
  return new Map(data.map((item) => [item.date, item]));
}

function priceAtLookback(data: OHLCData[], lookback: number) {
  if (data.length < lookback + 1) return null;
  const value = data[data.length - lookback - 1]?.close;
  return hasPrice(value) ? value : null;
}

function latestClose(data: OHLCData[]) {
  const value = data.at(-1)?.close;
  return hasPrice(value) ? value : null;
}

function quarterReturn(current: number | null | undefined, previous: number | null | undefined) {
  if (!hasPrice(current) || !hasPrice(previous)) return null;
  return (current - previous) / previous;
}

export function percentReturn(data: OHLCData[], lookback: number) {
  const start = priceAtLookback(data, lookback);
  const end = latestClose(data);
  if (!start || !end) return null;
  return round(((end - start) / start) * 100);
}

export function getIBDProxyScore(prices: IbdProxyInput): IbdProxyResult {
  const q1Return = quarterReturn(prices.currentPrice, prices.price3mAgo);
  if (q1Return === null) {
    return {
      ibdProxyScore: null,
      dataQuality: 'NA',
      availableWeight: 0,
      q1Return: null,
      q2Return: null,
      q3Return: null,
      q4Return: null,
    };
  }

  const q2Return = quarterReturn(prices.price3mAgo, prices.price6mAgo);
  const q3Return = quarterReturn(prices.price6mAgo, prices.price9mAgo);
  const q4Return = quarterReturn(prices.price9mAgo, prices.price12mAgo);
  const legs = [
    { value: q1Return, weight: 2 },
    { value: q2Return, weight: 1 },
    { value: q3Return, weight: 1 },
    { value: q4Return, weight: 1 },
  ].filter((leg): leg is { value: number; weight: number } => typeof leg.value === 'number');
  const availableWeight = legs.reduce((sum, leg) => sum + leg.weight, 0);

  if (availableWeight <= 0) {
    return {
      ibdProxyScore: null,
      dataQuality: 'NA',
      availableWeight: 0,
      q1Return,
      q2Return,
      q3Return,
      q4Return,
    };
  }

  const rawScore = legs.reduce((sum, leg) => sum + leg.value * leg.weight, 0);
  const normalizedScore = (rawScore / availableWeight) * 5;
  const dataQuality: DataQuality = availableWeight >= 5 ? 'FULL' : 'PARTIAL';

  return {
    ibdProxyScore: round(normalizedScore, 6),
    dataQuality,
    availableWeight,
    q1Return: round(q1Return, 6),
    q2Return: q2Return === null ? null : round(q2Return, 6),
    q3Return: q3Return === null ? null : round(q3Return, 6),
    q4Return: q4Return === null ? null : round(q4Return, 6),
  };
}

export function calculateWeightedMomentum(data: OHLCData[]) {
  const return3m = percentReturn(data, 63);
  const return6m = percentReturn(data, 126);
  const return9m = percentReturn(data, 189);
  const return12m = percentReturn(data, 252);
  const ibd = getIBDProxyScore({
    currentPrice: latestClose(data),
    price3mAgo: priceAtLookback(data, 63),
    price6mAgo: priceAtLookback(data, 126),
    price9mAgo: priceAtLookback(data, 189),
    price12mAgo: priceAtLookback(data, 252),
  });

  return {
    return3m,
    return6m,
    return9m,
    return12m,
    weightedMomentumScore: ibd.ibdProxyScore,
    ibdProxyScore: ibd.ibdProxyScore,
    rsDataQuality: ibd.dataQuality,
    q1Return: ibd.q1Return,
    q2Return: ibd.q2Return,
    q3Return: ibd.q3Return,
    q4Return: ibd.q4Return,
  };
}

export function calculateRSRating(rank: number, universeSize: number) {
  if (!Number.isFinite(rank) || !Number.isFinite(universeSize) || rank < 1 || universeSize < 1) return null;
  if (universeSize === 1) return 50;
  return Math.round(99 - ((rank - 1) / (universeSize - 1)) * 98);
}

export function calculateBenchmarkRelativeScore(data: OHLCData[], benchmarkData?: OHLCData[]) {
  const stockMomentum = calculateWeightedMomentum(data).ibdProxyScore;
  const benchmarkMomentum = benchmarkData ? calculateWeightedMomentum(benchmarkData).ibdProxyScore : null;
  
  if (stockMomentum === null || benchmarkMomentum === null) {
    return { stockReturn26Week: null, benchmarkReturn26Week: null, benchmarkRelativeScore: null };
  }

  // 오닐 식 상대강도: 1년 가중 모멘텀(IBD Proxy Score)의 초과 성과 기반 환산
  // 기존 26주 수익률 대신 전체 52주 가중 성과를 비교하여 더 정확한 오닐식 상대강도 산출
  const outperformance = stockMomentum - benchmarkMomentum;
  return {
    stockReturn26Week: percentReturn(data, 126),
    benchmarkReturn26Week: percentReturn(benchmarkData || [], 126),
    benchmarkRelativeScore: round(clamp(50 + outperformance * 1.5, 1, 99), 0),
  };
}

export function getMansfieldRS(stockPrices: IbdProxyInput, indexPrices: IbdProxyInput): MansfieldResult {
  if (!hasPrice(stockPrices.currentPrice) || !hasPrice(stockPrices.price12mAgo) || !hasPrice(indexPrices.currentPrice) || !hasPrice(indexPrices.price12mAgo)) {
    return { mansfieldRsFlag: null, mansfieldRsScore: null, stockPerformance52w: null, benchmarkPerformance52w: null };
  }

  const stockPerformance52w = stockPrices.currentPrice / stockPrices.price12mAgo;
  const benchmarkPerformance52w = indexPrices.currentPrice / indexPrices.price12mAgo;
  const mansfieldRsScore = ((stockPerformance52w / benchmarkPerformance52w) - 1) * 100;
  return {
    mansfieldRsFlag: stockPerformance52w > benchmarkPerformance52w,
    mansfieldRsScore: round(mansfieldRsScore, 2),
    stockPerformance52w: round(stockPerformance52w, 6),
    benchmarkPerformance52w: round(benchmarkPerformance52w, 6),
  };
}

export function calculateMansfieldFromData(stockData: OHLCData[], benchmarkData?: OHLCData[]) {
  return getMansfieldRS(
    { currentPrice: latestClose(stockData), price12mAgo: priceAtLookback(stockData, 250) ?? priceAtLookback(stockData, 252) },
    { currentPrice: benchmarkData ? latestClose(benchmarkData) : null, price12mAgo: benchmarkData ? (priceAtLookback(benchmarkData, 250) ?? priceAtLookback(benchmarkData, 252)) : null }
  );
}

export function evaluateMacroTrend(indexPrice: number | null | undefined, indexMA50: number | null | undefined, indexMA200: number | null | undefined): MacroTrendEvaluation {
  if (!hasPrice(indexPrice) || !hasPrice(indexMA50) || !hasPrice(indexMA200)) {
    return { isUptrend50: null, isUptrend200: null, actionLevel: 'HALT' };
  }

  const isUptrend50 = indexPrice > indexMA50;
  const isUptrend200 = indexPrice > indexMA200;
  let actionLevel: MacroActionLevel = 'HALT';
  if (isUptrend50 && isUptrend200) actionLevel = 'FULL';
  else if (!isUptrend50 && isUptrend200) actionLevel = 'REDUCED';
  return { isUptrend50, isUptrend200, actionLevel };
}

export function calculateMacroTrendFromData(data: OHLCData[]) {
  const indexPrice = latestClose(data);
  const ma50 = data.length >= 50 ? round(data.slice(-50).reduce((sum, item) => sum + item.close, 0) / 50) : null;
  const ma200 = data.length >= 200 ? round(data.slice(-200).reduce((sum, item) => sum + item.close, 0) / 200) : null;
  const evaluation = evaluateMacroTrend(indexPrice, ma50, ma200);
  return { indexPrice, ma50, ma200, ...evaluation };
}

export function calculateRsLineSignals(data: OHLCData[], benchmarkData?: OHLCData[]) {
  if (!benchmarkData || data.length === 0 || benchmarkData.length === 0) {
    return { rsLineNewHigh: null, rsLineNearHigh: null };
  }

  const benchmarkByDate = byDateMap(benchmarkData);
  const matched = data
    .map((item) => {
      const benchmark = benchmarkByDate.get(item.date);
      if (!benchmark || benchmark.close <= 0) return null;
      return { date: item.date, value: item.close / benchmark.close };
    })
    .filter((item): item is { date: string; value: number } => Boolean(item));

  const recent = matched.slice(-252);
  const current = recent.at(-1)?.value;
  if (!current || recent.length < 20) return { rsLineNewHigh: null, rsLineNearHigh: null };

  const high = Math.max(...recent.map((item) => item.value));
  return {
    rsLineNewHigh: current >= high,
    rsLineNearHigh: current >= high * 0.98,
  };
}

export function calculateTennisBallAction(data: OHLCData[], benchmarkData?: OHLCData[]) {
  if (!benchmarkData || data.length < 2 || benchmarkData.length < 2) {
    return { tennisBallCount: 0, tennisBallScore: 0 };
  }

  const benchmarkByDate = byDateMap(benchmarkData);
  const recent = data.slice(-61);
  let tennisBallCount = 0;

  for (let index = 1; index < recent.length; index += 1) {
    const current = recent[index];
    const previous = recent[index - 1];
    const benchmarkCurrent = benchmarkByDate.get(current.date);
    if (!benchmarkCurrent) continue;

    const benchmarkIndex = benchmarkData.findIndex((item) => item.date === current.date);
    const benchmarkPrevious = benchmarkIndex > 0 ? benchmarkData[benchmarkIndex - 1] : null;
    if (!benchmarkPrevious || previous.close <= 0 || benchmarkPrevious.close <= 0) continue;

    const stockReturn = ((current.close - previous.close) / previous.close) * 100;
    const benchmarkReturn = ((benchmarkCurrent.close - benchmarkPrevious.close) / benchmarkPrevious.close) * 100;
    if (benchmarkReturn <= -1 && (stockReturn >= 0 || stockReturn > benchmarkReturn)) {
      tennisBallCount += 1;
    }
  }

  return {
    tennisBallCount,
    tennisBallScore: Math.min(100, tennisBallCount * 20),
  };
}

export function calculateRsMetrics(data: OHLCData[], benchmarkData?: OHLCData[]) {
  const momentum = calculateWeightedMomentum(data);
  const benchmark = calculateBenchmarkRelativeScore(data, benchmarkData);
  const rsLine = calculateRsLineSignals(data, benchmarkData);
  const tennisBall = calculateTennisBallAction(data, benchmarkData);
  const mansfield = calculateMansfieldFromData(data, benchmarkData);

  return {
    ...momentum,
    ...benchmark,
    ...rsLine,
    ...tennisBall,
    ...mansfield,
  };
}
