import type { OHLCData } from '@/types';

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function byDateMap(data: OHLCData[]) {
  return new Map(data.map((item) => [item.date, item]));
}

export function percentReturn(data: OHLCData[], lookback: number) {
  if (data.length < lookback + 1) return null;
  const start = data[data.length - lookback - 1]?.close;
  const end = data.at(-1)?.close;
  if (!start || !end) return null;
  return round(((end - start) / start) * 100);
}

export function calculateWeightedMomentum(data: OHLCData[]) {
  const return3m = percentReturn(data, 63);
  const return6m = percentReturn(data, 126);
  const return9m = percentReturn(data, 189);
  const return12m = percentReturn(data, 252);
  const legs = [
    { value: return3m, weight: 0.4 },
    { value: return6m, weight: 0.3 },
    { value: return9m, weight: 0.2 },
    { value: return12m, weight: 0.1 },
  ].filter((leg): leg is { value: number; weight: number } => typeof leg.value === 'number');

  const weightTotal = legs.reduce((sum, leg) => sum + leg.weight, 0);
  const weightedMomentumScore = weightTotal > 0
    ? round(legs.reduce((sum, leg) => sum + leg.value * leg.weight, 0) / weightTotal)
    : null;

  return { return3m, return6m, return9m, return12m, weightedMomentumScore };
}

export function calculateBenchmarkRelativeScore(data: OHLCData[], benchmarkData?: OHLCData[]) {
  const stockReturn26Week = percentReturn(data, 126);
  const benchmarkReturn26Week = benchmarkData ? percentReturn(benchmarkData, 126) : null;
  if (stockReturn26Week === null || benchmarkReturn26Week === null) {
    return { stockReturn26Week, benchmarkReturn26Week, benchmarkRelativeScore: null };
  }

  const outperformance = stockReturn26Week - benchmarkReturn26Week;
  return {
    stockReturn26Week,
    benchmarkReturn26Week,
    benchmarkRelativeScore: round(clamp(50 + outperformance * 1.5, 1, 99), 0),
  };
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

  return {
    ...momentum,
    ...benchmark,
    ...rsLine,
    ...tennisBall,
  };
}
