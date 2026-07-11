import type { OHLCData } from '@/types';

export type ReversalStage = 'WATCH' | 'SETUP' | 'TRIGGER' | 'CONFIRMED' | 'REJECT';
export type ReversalGrade = 'A' | 'B' | 'C' | 'WATCH' | 'REJECT';

export interface ReversalBreakdown {
  marketStructure: number;
  baseQuality: number;
  relativeStrength: number;
  accumulation: number;
  pivotReadiness: number;
  riskReward: number;
}

export interface ReversalAnalysis {
  reversalScore: number;
  grade: ReversalGrade;
  stage: ReversalStage;
  currentPrice: number | null;
  pivotPrice: number | null;
  stopPrice: number | null;
  stopPct: number | null;
  target3R: number | null;
  rrToTarget: number | null;
  baseDays: number | null;
  baseRangePct: number | null;
  drawdownFromPriorHighPct: number | null;
  higherLowCount: number;
  distanceToPivotPct: number | null;
  distanceFromHigh52WeekPct: number | null;
  return20dPct: number | null;
  return60dPct: number | null;
  benchmarkRelative20dPct: number | null;
  benchmarkRelative60dPct: number | null;
  volumeDryUpRatio: number | null;
  upDownVolumeRatio: number | null;
  obvSlopePct: number | null;
  rvol20: number | null;
  closeLocationPct: number | null;
  ma20SlopePct: number | null;
  ma50SlopePct: number | null;
  breakdown: ReversalBreakdown;
  evidence: string[];
  warnings: string[];
}

interface BaseCandidate {
  baseDays: number;
  pivotPrice: number;
  baseLow: number;
  baseRangePct: number;
  drawdownFromPriorHighPct: number | null;
  higherLowCount: number;
  volumeDryUpRatio: number | null;
  score: number;
}

export interface ReversalOptions {
  market?: 'US' | 'KR';
  exchange?: string;
  benchmarkData?: OHLCData[];
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function numberOrNull(value: number) {
  return Number.isFinite(value) ? value : null;
}

function sma(data: OHLCData[], period: number, field: 'close' | 'volume' = 'close'): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  const value = slice.reduce((sum, bar) => sum + Number(bar[field] || 0), 0) / period;
  return numberOrNull(value);
}

function maxHigh(data: OHLCData[]) {
  return Math.max(...data.map((bar) => bar.high));
}

function minLow(data: OHLCData[]) {
  return Math.min(...data.map((bar) => bar.low));
}

function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return round(((to - from) / from) * 100, 2);
}

function returnPct(data: OHLCData[], lookback: number): number | null {
  if (data.length <= lookback) return null;
  return pctChange(data[data.length - lookback - 1].close, data[data.length - 1].close);
}

function scoreRange(value: number | null, fullAt: number, zeroAt: number, fallback = 40) {
  if (value === null) return fallback;
  if (fullAt === zeroAt) return fallback;
  return clamp(round(((value - zeroAt) / (fullAt - zeroAt)) * 100, 0), 0, 100);
}

function calculateRvol20(data: OHLCData[]): number | null {
  if (data.length < 21) return null;
  const previous = data.slice(-21, -1);
  const avg = previous.reduce((sum, bar) => sum + bar.volume, 0) / previous.length;
  if (avg <= 0) return null;
  return round(data[data.length - 1].volume / avg, 2);
}

function calculateCloseLocation(bar: OHLCData): number | null {
  const range = bar.high - bar.low;
  if (range <= 0) return null;
  return round(((bar.close - bar.low) / range) * 100, 0);
}

function slopePct(data: OHLCData[], period: number, lookback: number): number | null {
  if (data.length < period + lookback) return null;
  const current = sma(data, period);
  const previous = sma(data.slice(0, -lookback), period);
  if (current === null || previous === null || previous <= 0) return null;
  return round(((current - previous) / previous) * 100, 2);
}

function calculateObvSlopePct(data: OHLCData[], lookback = 30): number | null {
  if (data.length < lookback + 1) return null;
  const slice = data.slice(-(lookback + 1));
  let obv = 0;
  const values: number[] = [0];
  for (let index = 1; index < slice.length; index += 1) {
    if (slice[index].close > slice[index - 1].close) obv += slice[index].volume;
    else if (slice[index].close < slice[index - 1].close) obv -= slice[index].volume;
    values.push(obv);
  }
  const first = values[0];
  const last = values.at(-1) ?? 0;
  const scale = slice.reduce((sum, bar) => sum + bar.volume, 0) / slice.length;
  if (scale <= 0) return null;
  return round(((last - first) / scale) * 100, 2);
}

function calculateUpDownVolumeRatio(data: OHLCData[], lookback = 30): number | null {
  if (data.length < lookback + 1) return null;
  const slice = data.slice(-(lookback + 1));
  let up = 0;
  let down = 0;
  for (let index = 1; index < slice.length; index += 1) {
    if (slice[index].close > slice[index - 1].close) up += slice[index].volume;
    else if (slice[index].close < slice[index - 1].close) down += slice[index].volume;
  }
  if (down <= 0) return up > 0 ? 3 : null;
  return round(up / down, 2);
}

function countHigherLows(base: OHLCData[], segments = 3): number {
  if (base.length < segments * 5) return 0;
  const size = Math.floor(base.length / segments);
  const lows: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const start = index * size;
    const end = index === segments - 1 ? base.length : (index + 1) * size;
    lows.push(minLow(base.slice(start, end)));
  }
  let count = 0;
  for (let index = 1; index < lows.length; index += 1) {
    if (lows[index] >= lows[index - 1] * 0.98) count += 1;
  }
  return count;
}

function evaluateBase(data: OHLCData[], baseDays: number): BaseCandidate | null {
  const len = data.length;
  if (len < baseDays + 35) return null;

  const base = data.slice(len - baseDays - 1, len - 1);
  if (base.length < baseDays) return null;

  const pivotPrice = maxHigh(base);
  const baseLow = minLow(base);
  if (pivotPrice <= 0 || baseLow <= 0) return null;

  const baseRangePct = round(((pivotPrice - baseLow) / baseLow) * 100, 2);
  const prior = data.slice(Math.max(0, len - baseDays - 130), len - baseDays - 1);
  const priorHigh = prior.length > 0 ? maxHigh(prior) : null;
  const drawdownFromPriorHighPct = priorHigh && priorHigh > 0
    ? round(((baseLow - priorHigh) / priorHigh) * 100, 2)
    : null;

  const recentVol = base.slice(-Math.min(10, base.length));
  const olderVol = data.slice(Math.max(0, len - baseDays - 45), len - baseDays - 1);
  const recentVolAvg = recentVol.reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, recentVol.length);
  const olderVolAvg = olderVol.reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, olderVol.length);
  const volumeDryUpRatio = olderVolAvg > 0 ? round(recentVolAvg / olderVolAvg, 2) : null;
  const higherLowCount = countHigherLows(base);

  const rangeScore = baseRangePct <= 12 ? 100 : baseRangePct <= 20 ? 82 : baseRangePct <= 30 ? 58 : 25;
  const priorDeclineScore = drawdownFromPriorHighPct === null
    ? 45
    : drawdownFromPriorHighPct <= -35 ? 100
      : drawdownFromPriorHighPct <= -20 ? 82
        : drawdownFromPriorHighPct <= -12 ? 55
          : 25;
  const dryUpScore = volumeDryUpRatio === null
    ? 50
    : volumeDryUpRatio <= 0.65 ? 100
      : volumeDryUpRatio <= 0.85 ? 78
        : volumeDryUpRatio <= 1 ? 55
          : 25;
  const higherLowScore = higherLowCount >= 2 ? 100 : higherLowCount === 1 ? 68 : 28;
  const durationScore = baseDays >= 30 && baseDays <= 90 ? 100 : 65;

  const score = round(
    rangeScore * 0.24 +
    priorDeclineScore * 0.2 +
    dryUpScore * 0.22 +
    higherLowScore * 0.22 +
    durationScore * 0.12,
    0,
  );

  return {
    baseDays,
    pivotPrice: round(pivotPrice, 2),
    baseLow: round(baseLow, 2),
    baseRangePct,
    drawdownFromPriorHighPct,
    higherLowCount,
    volumeDryUpRatio,
    score,
  };
}

function bestBase(data: OHLCData[]) {
  return [25, 35, 50, 70, 90]
    .map((days) => evaluateBase(data, days))
    .filter((candidate): candidate is BaseCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

function marketStructureScore(data: OHLCData[]) {
  const current = data.at(-1)?.close ?? null;
  if (current === null) return { score: 0, ma20SlopePct: null, ma50SlopePct: null };
  const ma20 = sma(data, 20);
  const ma50 = sma(data, 50);
  const ma150 = sma(data, 150);
  const ma20SlopePct = slopePct(data, 20, 10);
  const ma50SlopePct = slopePct(data, 50, 15);

  let score = 0;
  if (ma20 && current >= ma20) score += 25;
  if (ma50 && current >= ma50 * 0.98) score += 25;
  if (ma150 && current >= ma150 * 0.9) score += 10;
  if (ma20SlopePct !== null && ma20SlopePct > 0) score += 20;
  if (ma50SlopePct !== null && ma50SlopePct > -1.5) score += 20;
  return { score: clamp(score, 0, 100), ma20SlopePct, ma50SlopePct };
}

function relativeStrengthScore(data: OHLCData[], benchmarkData?: OHLCData[]) {
  const stock20 = returnPct(data, 20);
  const stock60 = returnPct(data, 60);
  const benchmark20 = benchmarkData?.length ? returnPct(benchmarkData, 20) : null;
  const benchmark60 = benchmarkData?.length ? returnPct(benchmarkData, 60) : null;
  const relative20 = stock20 !== null && benchmark20 !== null ? round(stock20 - benchmark20, 2) : null;
  const relative60 = stock60 !== null && benchmark60 !== null ? round(stock60 - benchmark60, 2) : null;

  const stockComponent = scoreRange(stock20, 15, -10, 45) * 0.35 + scoreRange(stock60, 25, -18, 45) * 0.3;
  const relativeComponent = scoreRange(relative20, 8, -8, benchmarkData?.length ? 40 : 55) * 0.2 +
    scoreRange(relative60, 15, -12, benchmarkData?.length ? 40 : 55) * 0.15;

  return {
    score: round(clamp(stockComponent + relativeComponent, 0, 100), 0),
    stock20,
    stock60,
    relative20,
    relative60,
  };
}

function accumulationScore(data: OHLCData[], base: BaseCandidate | null) {
  const rvol20 = calculateRvol20(data);
  const upDownVolumeRatio = calculateUpDownVolumeRatio(data);
  const obvSlopePct = calculateObvSlopePct(data);
  const closeLocationPct = calculateCloseLocation(data[data.length - 1]);

  const dryUp = base?.volumeDryUpRatio ?? null;
  const dryUpScore = dryUp === null ? 45 : dryUp <= 0.75 ? 100 : dryUp <= 0.95 ? 70 : 35;
  const upDownScore = scoreRange(upDownVolumeRatio, 1.8, 0.7, 45);
  const obvScore = scoreRange(obvSlopePct, 260, -120, 45);
  const rvolScore = rvol20 === null ? 45 : rvol20 >= 1.5 ? 100 : rvol20 >= 1.1 ? 72 : rvol20 >= 0.8 ? 52 : 34;
  const closeScore = scoreRange(closeLocationPct, 85, 35, 45);

  return {
    score: round(dryUpScore * 0.25 + upDownScore * 0.24 + obvScore * 0.24 + rvolScore * 0.17 + closeScore * 0.1, 0),
    rvol20,
    upDownVolumeRatio,
    obvSlopePct,
    closeLocationPct,
  };
}

function pivotReadinessScore(data: OHLCData[], base: BaseCandidate | null) {
  const current = data.at(-1)?.close ?? null;
  if (!base || current === null || base.pivotPrice <= 0) return { score: 0, distanceToPivotPct: null };
  const distanceToPivotPct = pctChange(base.pivotPrice, current);
  const closeLocationPct = calculateCloseLocation(data[data.length - 1]);
  const rvol20 = calculateRvol20(data);

  let score = 20;
  if (distanceToPivotPct !== null) {
    if (distanceToPivotPct >= 0 && distanceToPivotPct <= 3) score = 95;
    else if (distanceToPivotPct >= -3 && distanceToPivotPct < 0) score = 88;
    else if (distanceToPivotPct > 3 && distanceToPivotPct <= 6) score = 70;
    else if (distanceToPivotPct >= -8 && distanceToPivotPct < -3) score = 62;
    else if (distanceToPivotPct >= -15 && distanceToPivotPct < -8) score = 42;
  }
  if (closeLocationPct !== null && closeLocationPct >= 70) score += 5;
  if (rvol20 !== null && rvol20 >= 1.4 && distanceToPivotPct !== null && distanceToPivotPct >= 0) score += 8;
  return { score: clamp(score, 0, 100), distanceToPivotPct };
}

function riskRewardScore(current: number | null, base: BaseCandidate | null) {
  if (current === null || !base || base.baseLow <= 0) {
    return { score: 0, stopPrice: null, stopPct: null, target3R: null, rrToTarget: null };
  }
  const stopPrice = round(base.baseLow * 0.98, 2);
  const stopPct = pctChange(current, stopPrice);
  const absoluteStopPct = stopPct === null ? null : Math.abs(stopPct);
  const score = absoluteStopPct === null
    ? 0
    : absoluteStopPct <= 8 ? 100
      : absoluteStopPct <= 12 ? 76
        : absoluteStopPct <= 18 ? 48
          : 18;
  const riskPerShare = current - stopPrice;
  const target3R = riskPerShare > 0 ? round(current + riskPerShare * 3, 2) : null;
  return {
    score,
    stopPrice,
    stopPct: absoluteStopPct === null ? null : round(absoluteStopPct, 2),
    target3R,
    rrToTarget: target3R ? 3 : null,
  };
}

function distanceFromHigh52WeekPct(data: OHLCData[]) {
  const current = data.at(-1)?.close ?? null;
  if (current === null) return null;
  const lookback = data.slice(-Math.min(252, data.length));
  const high = maxHigh(lookback);
  return pctChange(high, current);
}

function stageFor(score: number, distanceToPivotPct: number | null, rvol20: number | null, closeLocationPct: number | null): ReversalStage {
  const breakoutConfirmed =
    distanceToPivotPct !== null &&
    distanceToPivotPct >= 0 &&
    distanceToPivotPct <= 5 &&
    (rvol20 ?? 0) >= 1.3 &&
    (closeLocationPct ?? 0) >= 60;

  if (score >= 80 && breakoutConfirmed) return 'CONFIRMED';
  if (score >= 72 && distanceToPivotPct !== null && distanceToPivotPct >= -5 && distanceToPivotPct <= 4) return 'TRIGGER';
  if (score >= 60) return 'SETUP';
  if (score >= 45) return 'WATCH';
  return 'REJECT';
}

function gradeFor(score: number, stage: ReversalStage): ReversalGrade {
  if (stage === 'REJECT') return 'REJECT';
  if (score >= 82) return 'A';
  if (score >= 70) return 'B';
  if (score >= 58) return 'C';
  return 'WATCH';
}

export function analyzeTrendReversal(data: OHLCData[], options: ReversalOptions = {}): ReversalAnalysis | null {
  const clean = data.filter((bar) =>
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close) &&
    Number.isFinite(bar.volume) &&
    bar.close > 0
  );
  if (clean.length < 80) return null;

  const base = bestBase(clean);
  const structure = marketStructureScore(clean);
  const rs = relativeStrengthScore(clean, options.benchmarkData);
  const accumulation = accumulationScore(clean, base);
  const pivot = pivotReadinessScore(clean, base);
  const currentPrice = clean.at(-1)?.close ?? null;
  const risk = riskRewardScore(currentPrice, base);

  const breakdown: ReversalBreakdown = {
    marketStructure: structure.score,
    baseQuality: base?.score ?? 0,
    relativeStrength: rs.score,
    accumulation: accumulation.score,
    pivotReadiness: pivot.score,
    riskReward: risk.score,
  };

  const score = round(
    breakdown.marketStructure * 0.2 +
    breakdown.baseQuality * 0.25 +
    breakdown.relativeStrength * 0.2 +
    breakdown.accumulation * 0.15 +
    breakdown.pivotReadiness * 0.15 +
    breakdown.riskReward * 0.05,
    0,
  );
  const stage = stageFor(score, pivot.distanceToPivotPct, accumulation.rvol20, accumulation.closeLocationPct);
  const grade = gradeFor(score, stage);

  const evidence: string[] = [];
  const warnings: string[] = [];
  if (base) {
    evidence.push(`${base.baseDays}일 베이스, 범위 ${base.baseRangePct}%`);
    if (base.drawdownFromPriorHighPct !== null) evidence.push(`선행 고점 대비 ${base.drawdownFromPriorHighPct}% 조정 후 베이스`);
    if (base.higherLowCount >= 2) evidence.push('저점이 높아지는 구조');
    if (base.volumeDryUpRatio !== null && base.volumeDryUpRatio <= 0.85) evidence.push(`베이스 후반 거래량 건조화 ${base.volumeDryUpRatio}x`);
  }
  if (rs.relative20 !== null && rs.relative20 > 0) evidence.push(`20일 벤치마크 대비 +${rs.relative20}%p`);
  if (accumulation.upDownVolumeRatio !== null && accumulation.upDownVolumeRatio >= 1.2) evidence.push(`상승일/하락일 거래량 비율 ${accumulation.upDownVolumeRatio}x`);
  if (pivot.distanceToPivotPct !== null) evidence.push(`피벗 대비 ${pivot.distanceToPivotPct}%`);

  if (!base) warnings.push('명확한 바닥 베이스가 부족합니다.');
  if (!options.benchmarkData?.length) warnings.push('벤치마크 데이터가 없어 상대강도 일부는 가격 모멘텀으로 대체했습니다.');
  if ((risk.stopPct ?? 99) > 12) warnings.push(`손절폭 ${risk.stopPct}%로 초입 진입 리스크가 큽니다.`);
  if (stage === 'WATCH' || stage === 'SETUP') warnings.push('돌파 확인 전 단계입니다.');

  return {
    reversalScore: score,
    grade,
    stage,
    currentPrice,
    pivotPrice: base?.pivotPrice ?? null,
    stopPrice: risk.stopPrice,
    stopPct: risk.stopPct,
    target3R: risk.target3R,
    rrToTarget: risk.rrToTarget,
    baseDays: base?.baseDays ?? null,
    baseRangePct: base?.baseRangePct ?? null,
    drawdownFromPriorHighPct: base?.drawdownFromPriorHighPct ?? null,
    higherLowCount: base?.higherLowCount ?? 0,
    distanceToPivotPct: pivot.distanceToPivotPct,
    distanceFromHigh52WeekPct: distanceFromHigh52WeekPct(clean),
    return20dPct: rs.stock20,
    return60dPct: rs.stock60,
    benchmarkRelative20dPct: rs.relative20,
    benchmarkRelative60dPct: rs.relative60,
    volumeDryUpRatio: base?.volumeDryUpRatio ?? null,
    upDownVolumeRatio: accumulation.upDownVolumeRatio,
    obvSlopePct: accumulation.obvSlopePct,
    rvol20: accumulation.rvol20,
    closeLocationPct: accumulation.closeLocationPct,
    ma20SlopePct: structure.ma20SlopePct,
    ma50SlopePct: structure.ma50SlopePct,
    breakdown,
    evidence,
    warnings,
  };
}
