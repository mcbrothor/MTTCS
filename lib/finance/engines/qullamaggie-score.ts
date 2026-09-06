import type { OHLCData } from '@/types';

export type QullamaggieSetup = 'BREAKOUT' | 'EP' | 'SUPER_BREAKOUT' | 'PARABOLIC_WARNING' | 'NONE';
export type QullamaggieGrade = 'SUPER' | 'A' | 'B' | 'WATCH' | 'REJECT';

export interface QullamaggieBreakdown {
  relativeStrength: number;
  baseQuality: number;
  pivotProximity: number;
  volumeLiquidity: number;
  trendQuality: number;
  catalystProxy: number;
}

export interface QullamaggieAnalysis {
  qScore: number;
  grade: QullamaggieGrade;
  primarySetup: QullamaggieSetup;
  setupFlags: QullamaggieSetup[];
  currentPrice: number | null;
  entryTrigger: number | null;
  pivotPrice: number | null;
  stopPrice: number | null;
  stopPct: number | null;
  target3R: number | null;
  rrToTarget: number | null;
  return1mPct: number | null;
  return3mPct: number | null;
  return6mPct: number | null;
  priorMovePct: number | null;
  baseDays: number | null;
  baseRangePct: number | null;
  pullbackPct: number | null;
  distanceToPivotPct: number | null;
  distanceFromHigh52WeekPct: number | null;
  adr20Pct: number | null;
  rvol20: number | null;
  gapPct: number | null;
  closeLocationPct: number | null;
  dollarVolume20d: number | null;
  breakdown: QullamaggieBreakdown;
  evidence: string[];
  warnings: string[];
  evidenceRef?: {
    snapshotId: string | null;
    availability: 'ready' | 'legacy' | 'unavailable';
    asOfBarDate: string | null;
  };
}

interface MarketParams {
  priorMoveMinPct: number;
  epGapMinPct: number;
  minPrice: number;
  minAvgVolume: number;
  minDollarVolume: number;
}

interface BaseCandidate {
  baseDays: number;
  pivotPrice: number;
  baseLow: number;
  baseRangePct: number;
  pullbackPct: number;
  priorMovePct: number | null;
  distanceToPivotPct: number;
  volumeDryUpRatio: number | null;
  higherLows: boolean;
  score: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function marketParams(market: 'US' | 'KR'): MarketParams {
  if (market === 'KR') {
    return {
      priorMoveMinPct: 20,
      epGapMinPct: 6,
      minPrice: 1000,
      minAvgVolume: 100000,
      minDollarVolume: 3_000_000_000,
    };
  }
  return {
    priorMoveMinPct: 30,
    epGapMinPct: 10,
    minPrice: 5,
    minAvgVolume: 300000,
    minDollarVolume: 20_000_000,
  };
}

function sma(data: OHLCData[], period: number, field: 'close' | 'volume' = 'close'): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((sum, bar) => sum + Number(bar[field] || 0), 0) / period;
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

function scoreThreshold(value: number | null, fullAt: number, zeroAt = 0): number {
  if (value === null) return 35;
  return clamp(round(((value - zeroAt) / (fullAt - zeroAt)) * 100, 0), 0, 100);
}

function calculateAdrPct(data: OHLCData[], period = 20): number | null {
  if (data.length < 2) return null;
  const slice = data.slice(-Math.min(period, data.length));
  const values = slice
    .map((bar) => (bar.close > 0 ? ((bar.high - bar.low) / bar.close) * 100 : null))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function calculateDollarVolume20d(data: OHLCData[]): number | null {
  if (data.length === 0) return null;
  const slice = data.slice(-Math.min(20, data.length));
  return round(slice.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / slice.length, 0);
}

function calculateRvol20(data: OHLCData[]): number | null {
  if (data.length < 21) return null;
  const current = data[data.length - 1].volume;
  const previous = data.slice(-21, -1);
  const avg = previous.reduce((sum, bar) => sum + bar.volume, 0) / previous.length;
  if (avg <= 0) return null;
  return round(current / avg, 2);
}

function calculateCloseLocation(bar: OHLCData): number | null {
  const range = bar.high - bar.low;
  if (range <= 0) return null;
  return round(((bar.close - bar.low) / range) * 100, 0);
}

function evaluateBase(data: OHLCData[], baseDays: number): BaseCandidate | null {
  const len = data.length;
  if (len < baseDays + 25) return null;

  const current = data[len - 1].close;
  const base = data.slice(len - baseDays - 1, len - 1);
  if (base.length < baseDays) return null;

  const pivotPrice = maxHigh(base);
  const baseLow = minLow(base);
  if (pivotPrice <= 0 || baseLow <= 0) return null;

  const baseRangePct = round(((pivotPrice - baseLow) / baseLow) * 100, 2);
  const pullbackPct = round(((pivotPrice - baseLow) / pivotPrice) * 100, 2);
  const distanceToPivotPct = pctChange(pivotPrice, current) ?? 0;

  const prior = data.slice(Math.max(0, len - baseDays - 75), len - baseDays - 1);
  const priorLow = prior.length > 0 ? minLow(prior) : null;
  const priorMovePct = priorLow && priorLow > 0 ? pctChange(priorLow, pivotPrice) : null;

  const firstHalf = base.slice(0, Math.floor(base.length / 2));
  const secondHalf = base.slice(Math.floor(base.length / 2));
  const higherLows = firstHalf.length > 0 && secondHalf.length > 0
    ? minLow(secondHalf) >= minLow(firstHalf) * 0.98
    : false;

  const recentVol = base.slice(-Math.min(8, base.length));
  const olderVol = data.slice(Math.max(0, len - baseDays - 35), len - baseDays - 1);
  const recentVolAvg = recentVol.reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, recentVol.length);
  const olderVolAvg = olderVol.reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, olderVol.length);
  const volumeDryUpRatio = olderVolAvg > 0 ? round(recentVolAvg / olderVolAvg, 2) : null;

  const rangeScore = baseRangePct <= 15 ? 100 : baseRangePct <= 25 ? 78 : baseRangePct <= 35 ? 58 : 25;
  const pullbackScore = pullbackPct <= 18 ? 100 : pullbackPct <= 28 ? 72 : pullbackPct <= 38 ? 45 : 15;
  const dryUpScore = volumeDryUpRatio === null ? 50 : volumeDryUpRatio <= 0.65 ? 100 : volumeDryUpRatio <= 0.85 ? 78 : volumeDryUpRatio <= 1 ? 55 : 25;
  const pivotScore = distanceToPivotPct >= 0 && distanceToPivotPct <= 3
    ? 100
    : distanceToPivotPct >= -3 && distanceToPivotPct < 0
      ? 88
      : distanceToPivotPct > 3 && distanceToPivotPct <= 6
        ? 65
        : distanceToPivotPct >= -6 && distanceToPivotPct < -3
          ? 60
          : 20;

  const score = round(
    rangeScore * 0.25 +
    pullbackScore * 0.2 +
    dryUpScore * 0.2 +
    pivotScore * 0.25 +
    (higherLows ? 100 : 35) * 0.1,
    0,
  );

  return {
    baseDays,
    pivotPrice: round(pivotPrice, 2),
    baseLow: round(baseLow, 2),
    baseRangePct,
    pullbackPct,
    priorMovePct,
    distanceToPivotPct: round(distanceToPivotPct, 2),
    volumeDryUpRatio,
    higherLows,
    score,
  };
}

function bestBase(data: OHLCData[]): BaseCandidate | null {
  return [10, 15, 20, 30, 45]
    .map((baseDays) => evaluateBase(data, baseDays))
    .filter((candidate): candidate is BaseCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

function trendScore(data: OHLCData[]) {
  const current = data[data.length - 1].close;
  const ma10 = sma(data, 10);
  const ma20 = sma(data, 20);
  const ma50 = sma(data, 50);

  let score = 0;
  if (ma10 && current >= ma10 * 0.97) score += 30;
  if (ma20 && current >= ma20) score += 25;
  if (ma50 && current >= ma50) score += 20;
  if (ma10 && ma20 && ma10 >= ma20) score += 15;
  if (ma20 && ma50 && ma20 >= ma50) score += 10;
  return clamp(score, 0, 100);
}

function gradeFromScore(score: number, setup: QullamaggieSetup): QullamaggieGrade {
  if (setup === 'SUPER_BREAKOUT' && score >= 82) return 'SUPER';
  if (score >= 85) return 'SUPER';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'WATCH';
  return 'REJECT';
}

function buildStop(current: number, structureStop: number | null, adr20Pct: number | null) {
  const adrStopPct = Math.min(Math.max(adr20Pct ?? 6, 3), 12);
  const adrStop = current * (1 - adrStopPct / 100);
  const stop = structureStop && structureStop < current ? Math.max(structureStop, adrStop) : adrStop;
  return round(stop, 2);
}

export function analyzeQullamaggieSetup(
  data: OHLCData[],
  options: { market?: 'US' | 'KR'; exchange?: string } = {},
): QullamaggieAnalysis | null {
  if (data.length < 60) return null;

  const market = options.market ?? ((options.exchange === 'KOSPI' || options.exchange === 'KOSDAQ') ? 'KR' : 'US');
  const params = marketParams(market);
  const evidence: string[] = [];
  const warnings: string[] = [];

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const current = last.close;
  const base = bestBase(data);
  const return1mPct = returnPct(data, 21);
  const return3mPct = returnPct(data, 63);
  const return6mPct = returnPct(data, 126);
  const adr20Pct = calculateAdrPct(data, 20);
  const rvol20 = calculateRvol20(data);
  const dollarVolume20d = calculateDollarVolume20d(data);
  const high52 = data.length >= 120 ? maxHigh(data.slice(-Math.min(252, data.length))) : null;
  const distanceFromHigh52WeekPct = high52 && high52 > 0 ? round(((high52 - current) / high52) * 100, 2) : null;
  const gapPct = prev?.close > 0 ? pctChange(prev.close, last.open) : null;
  const closeLocationPct = calculateCloseLocation(last);

  const avgVolume20 = sma(data.slice(0, -1), 20, 'volume');
  const liquidEnough = current >= params.minPrice &&
    (avgVolume20 ?? 0) >= params.minAvgVolume &&
    (dollarVolume20d ?? 0) >= params.minDollarVolume;

  if (!liquidEnough) {
    warnings.push('가격/거래량/거래대금 유동성 기준이 약합니다.');
  }

  const rsScore = round(
    scoreThreshold(return1mPct, market === 'KR' ? 20 : 25) * 0.35 +
    scoreThreshold(return3mPct, market === 'KR' ? 35 : 50) * 0.4 +
    scoreThreshold(return6mPct, market === 'KR' ? 55 : 80) * 0.25,
    0,
  );

  const volumeScore = round(
    (rvol20 === null ? 45 : clamp(rvol20 * 30, 0, 100)) * 0.45 +
    (dollarVolume20d && dollarVolume20d >= params.minDollarVolume ? 85 : 35) * 0.35 +
    (base?.volumeDryUpRatio !== null && base?.volumeDryUpRatio !== undefined
      ? base.volumeDryUpRatio <= 0.85 ? 85 : 45
      : 50) * 0.2,
    0,
  );

  const trend = trendScore(data);
  const baseQuality = base?.score ?? 20;
  const pivotProximity = base
    ? base.distanceToPivotPct >= 0 && base.distanceToPivotPct <= 3
      ? 100
      : base.distanceToPivotPct >= -3 && base.distanceToPivotPct < 0
        ? 88
        : base.distanceToPivotPct > 3 && base.distanceToPivotPct <= 6
          ? 65
          : base.distanceToPivotPct >= -6 && base.distanceToPivotPct < -3
            ? 60
            : 20
    : 20;

  const breakoutCandidate = Boolean(
    base &&
    (base.priorMovePct ?? 0) >= params.priorMoveMinPct &&
    base.baseRangePct <= 38 &&
    base.pullbackPct <= 38 &&
    base.distanceToPivotPct >= -6 &&
    base.distanceToPivotPct <= 6 &&
    trend >= 65 &&
    liquidEnough,
  );

  const breakoutTriggered = Boolean(base && base.distanceToPivotPct >= 0 && base.distanceToPivotPct <= 6);

  const epCandidate = Boolean(
    gapPct !== null &&
    gapPct >= params.epGapMinPct &&
    (rvol20 ?? 0) >= 3 &&
    (closeLocationPct ?? 0) >= 55 &&
    current >= (sma(data, 20) ?? current * 2) &&
    liquidEnough,
  );

  const parabolicWarning = Boolean(
    (returnPct(data, 5) ?? 0) >= 45 ||
    (returnPct(data, 10) ?? 0) >= 75 ||
    (returnPct(data, 20) ?? 0) >= 120 ||
    (sma(data, 10) && current > (sma(data, 10) ?? current) * 1.35),
  );

  if (base) {
    evidence.push(`최근 ${base.baseDays}일 베이스, 피벗 ${base.pivotPrice.toLocaleString()}, 피벗 대비 ${base.distanceToPivotPct}%`);
    if ((base.priorMovePct ?? 0) >= params.priorMoveMinPct) evidence.push(`선행 상승 ${round(base.priorMovePct ?? 0, 1)}%`);
    if (base.volumeDryUpRatio !== null && base.volumeDryUpRatio <= 0.85) evidence.push(`조정 구간 거래량 감소 ${base.volumeDryUpRatio}배`);
    if (base.higherLows) evidence.push('베이스 내부 저점 상승 구조');
  }
  if (epCandidate) evidence.push(`EP 후보: 갭 ${gapPct}%, RVOL ${rvol20}배, 종가 위치 ${closeLocationPct}%`);
  if (breakoutCandidate) evidence.push(breakoutTriggered ? '피벗 돌파/돌파 직후 구간' : '피벗 6% 이내 돌파 대기 구간');
  if (distanceFromHigh52WeekPct !== null && distanceFromHigh52WeekPct <= 5) evidence.push(`52주 고점 ${distanceFromHigh52WeekPct}% 이내`);
  if (parabolicWarning) warnings.push('단기 과열/파라볼릭 확장 경고: 추격 진입보다 리스크 축소가 우선입니다.');
  if (epCandidate) warnings.push('뉴스/실적 catalyst는 가격·거래량 프록시만으로는 확정되지 않아 수동 확인이 필요합니다.');

  let primarySetup: QullamaggieSetup = 'NONE';
  const flags: QullamaggieSetup[] = [];
  if (breakoutCandidate) flags.push('BREAKOUT');
  if (epCandidate) flags.push('EP');
  if (parabolicWarning) flags.push('PARABOLIC_WARNING');

  if (epCandidate && (breakoutTriggered || (distanceFromHigh52WeekPct !== null && distanceFromHigh52WeekPct <= 3))) {
    primarySetup = 'SUPER_BREAKOUT';
    flags.unshift('SUPER_BREAKOUT');
  } else if (breakoutCandidate) {
    primarySetup = 'BREAKOUT';
  } else if (epCandidate) {
    primarySetup = 'EP';
  } else if (parabolicWarning) {
    primarySetup = 'PARABOLIC_WARNING';
  }

  const catalystProxy = epCandidate ? 90 : breakoutCandidate ? 55 : 35;
  let qScore = round(
    rsScore * 0.25 +
    baseQuality * 0.25 +
    pivotProximity * 0.20 +
    volumeScore * 0.15 +
    trend * 0.10 +
    catalystProxy * 0.05,
    0,
  );

  if (primarySetup === 'SUPER_BREAKOUT') qScore = clamp(qScore + 8, 0, 100);
  if (!liquidEnough) qScore = Math.min(qScore, 54);
  if (primarySetup === 'NONE') qScore = Math.min(qScore, 39);
  if (primarySetup === 'PARABOLIC_WARNING') qScore = Math.min(qScore, 49);

  const structureStop = primarySetup === 'EP' || primarySetup === 'SUPER_BREAKOUT'
    ? last.low
    : base?.baseLow ?? null;
  const stopPrice = buildStop(current, structureStop, adr20Pct);
  const stopPct = stopPrice < current ? round(((current - stopPrice) / current) * 100, 2) : null;
  const entryTrigger = primarySetup === 'EP' ? round(last.high, 2) : base?.pivotPrice ?? round(current, 2);
  const target3R = stopPct !== null && entryTrigger !== null
    ? round(entryTrigger + (entryTrigger - stopPrice) * 3, 2)
    : null;

  if (stopPct !== null && adr20Pct !== null && stopPct > adr20Pct * 1.5) {
    warnings.push(`손절폭 ${stopPct}%가 ADR ${adr20Pct}% 대비 넓습니다.`);
  }

  return {
    qScore,
    grade: gradeFromScore(qScore, primarySetup),
    primarySetup,
    setupFlags: Array.from(new Set(flags)),
    currentPrice: round(current, 2),
    entryTrigger,
    pivotPrice: base?.pivotPrice ?? null,
    stopPrice,
    stopPct,
    target3R,
    rrToTarget: target3R !== null && stopPct !== null ? 3 : null,
    return1mPct,
    return3mPct,
    return6mPct,
    priorMovePct: base?.priorMovePct ?? null,
    baseDays: base?.baseDays ?? null,
    baseRangePct: base?.baseRangePct ?? null,
    pullbackPct: base?.pullbackPct ?? null,
    distanceToPivotPct: base?.distanceToPivotPct ?? null,
    distanceFromHigh52WeekPct,
    adr20Pct,
    rvol20,
    gapPct,
    closeLocationPct,
    dollarVolume20d,
    breakdown: {
      relativeStrength: rsScore,
      baseQuality,
      pivotProximity,
      volumeLiquidity: volumeScore,
      trendQuality: trend,
      catalystProxy,
    },
    evidence: evidence.length > 0 ? evidence : ['쿨라매기 핵심 셋업 조건 미충족'],
    warnings,
  };
}
