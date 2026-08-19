import type { LeadershipBreadthSnapshot, LeadershipBreadthState, OHLCData } from '@/types';

const MODEL_VERSION = 'leadership-breadth-v1';

export interface BreadthConstituent {
  ticker: string;
  bars: OHLCData[];
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function round(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function meanAt(bars: OHLCData[], endIndex: number, period: number) {
  if (endIndex + 1 < period) return null;
  return average(bars.slice(endIndex + 1 - period, endIndex + 1).map((bar) => bar.close));
}

export function classifyLeadershipBreadth(
  score: number,
  slope5: number,
  slope10: number,
  peakout: LeadershipBreadthSnapshot['peakout'],
): LeadershipBreadthState {
  if (peakout === 'STRONG_WARNING') return 'RISK';
  if (peakout === 'WARNING') return 'HIGH_ALERT';
  if (score >= 70) return slope5 >= 0 ? 'STRONG' : 'HIGH_ALERT';
  if (score >= 60) return 'NORMAL';
  if (score >= 50) return slope5 < 0 ? 'CAUTION' : 'NEUTRAL';
  if (score >= 35) return slope10 < 0 ? 'RISK' : 'WEAK_REBOUND';
  return slope5 < 0 ? 'SELLOFF' : 'POST_SELLOFF_REBOUND';
}

export function classifyBreadthPeakout(input: {
  indexNearHigh20: boolean;
  drawdownFromBreadthHigh20: number;
  slope5: number;
  slope10: number;
}): LeadershipBreadthSnapshot['peakout'] {
  if (input.indexNearHigh20 && input.drawdownFromBreadthHigh20 <= -20 && input.slope10 < 0) return 'STRONG_WARNING';
  if (input.indexNearHigh20 && input.drawdownFromBreadthHigh20 <= -10 && input.slope5 < 0) return 'WARNING';
  return 'NONE';
}

function buildHistory(constituents: BreadthConstituent[]) {
  const dates = [...new Set(constituents.flatMap((item) => item.bars.map((bar) => bar.date)))].sort();
  return dates.map((date) => {
    const samples = constituents.flatMap((item) => {
      const index = item.bars.findIndex((bar) => bar.date === date);
      if (index < 199) return [];
      const close = item.bars[index].close;
      const close60 = item.bars[index - 60]?.close;
      const ma20 = meanAt(item.bars, index, 20);
      const ma60 = meanAt(item.bars, index, 60);
      const ma200 = meanAt(item.bars, index, 200);
      if (ma20 === null || ma60 === null || ma200 === null || !close60) return [];
      return [{ close, close60, ma20, ma60, ma200 }];
    });
    if (samples.length === 0) return null;
    const pct = (predicate: (sample: (typeof samples)[number]) => boolean) =>
      (samples.filter(predicate).length / samples.length) * 100;
    const aboveMa20Pct = pct((sample) => sample.close > sample.ma20);
    const aboveMa60Pct = pct((sample) => sample.close > sample.ma60);
    const aboveMa200Pct = pct((sample) => sample.close > sample.ma200);
    const positiveReturn60Pct = pct((sample) => sample.close > sample.close60);
    return {
      date,
      covered: samples.length,
      aboveMa20Pct,
      aboveMa60Pct,
      aboveMa200Pct,
      positiveReturn60Pct,
      score: aboveMa20Pct * 0.2 + aboveMa60Pct * 0.35 + aboveMa200Pct * 0.25 + positiveReturn60Pct * 0.2,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);
}

export function calculateLeadershipBreadth(input: {
  market: 'US' | 'KR';
  universe: string;
  constituents: BreadthConstituent[];
  indexBars: OHLCData[];
  provider: string;
  asOf?: string;
}): LeadershipBreadthSnapshot {
  const asOf = input.asOf || input.indexBars.at(-1)?.date || new Date().toISOString();
  const history = buildHistory(input.constituents);
  const latest = history.at(-1);
  const warnings: string[] = [];
  if (!latest) {
    return {
      asOf,
      provider: input.provider,
      quality: 'BLOCKED',
      modelVersion: MODEL_VERSION,
      warnings: ['200거래일 이상인 구성종목 데이터가 없습니다.'],
      market: input.market,
      universe: input.universe,
      score: null,
      state: 'BLOCKED',
      peakout: 'NONE',
      components: { aboveMa20Pct: null, aboveMa60Pct: null, aboveMa200Pct: null, positiveReturn60Pct: null },
      breadthMa5: null,
      slope5: null,
      slope10: null,
      fallingDays10: 0,
      indexNearHigh20: null,
      drawdownFromBreadthHigh20: null,
      coveredConstituents: 0,
      totalConstituents: input.constituents.length,
    };
  }

  const recentScores = history.map((row) => row.score);
  const breadthMa5 = average(recentScores.slice(-5));
  const slope5 = history.length >= 6 ? latest.score - history[history.length - 6].score : 0;
  const slope10 = history.length >= 11 ? latest.score - history[history.length - 11].score : 0;
  const fallingDays10 = recentScores.slice(-10).reduce((count, score, index, values) =>
    count + (index > 0 && score < values[index - 1] ? 1 : 0), 0);
  const high20 = Math.max(...recentScores.slice(-20));
  const drawdownFromBreadthHigh20 = latest.score - high20;
  const indexRows = input.indexBars.filter((bar) => bar.date <= latest.date).slice(-20);
  const latestIndex = indexRows.at(-1)?.close;
  const indexHigh20 = indexRows.length > 0 ? Math.max(...indexRows.map((bar) => bar.high || bar.close)) : null;
  const indexNearHigh20 = latestIndex !== undefined && indexHigh20 !== null && indexHigh20 > 0
    ? latestIndex >= indexHigh20 * 0.99
    : null;
  const peakout = classifyBreadthPeakout({
    indexNearHigh20: indexNearHigh20 === true,
    drawdownFromBreadthHigh20,
    slope5,
    slope10,
  });
  const coverage = input.constituents.length > 0 ? latest.covered / input.constituents.length : 0;
  if (coverage < 0.8) warnings.push(`구성종목 커버리지가 ${Math.round(coverage * 100)}%입니다.`);

  return {
    asOf: latest.date || asOf,
    provider: input.provider,
    quality: coverage >= 0.8 ? 'FULL' : 'DEGRADED',
    modelVersion: MODEL_VERSION,
    warnings,
    market: input.market,
    universe: input.universe,
    score: round(latest.score),
    state: classifyLeadershipBreadth(latest.score, slope5, slope10, peakout),
    peakout,
    components: {
      aboveMa20Pct: round(latest.aboveMa20Pct),
      aboveMa60Pct: round(latest.aboveMa60Pct),
      aboveMa200Pct: round(latest.aboveMa200Pct),
      positiveReturn60Pct: round(latest.positiveReturn60Pct),
    },
    breadthMa5: round(breadthMa5),
    slope5: round(slope5),
    slope10: round(slope10),
    fallingDays10,
    indexNearHigh20,
    drawdownFromBreadthHigh20: round(drawdownFromBreadthHigh20),
    coveredConstituents: latest.covered,
    totalConstituents: input.constituents.length,
  };
}
