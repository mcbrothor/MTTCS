/**
 * VCP (Volatility Contraction Pattern) 분석 엔진
 *
 * 이론적 기반:
 * - Minervini, "Trade Like a Stock Market Wizard" — 2~6개 점진적 수축 패턴
 * - Minervini, "Think & Trade Like a Champion" — Pocket Pivot 기관 매집 시그널
 * - Bollinger/Keltner Squeeze — 변동성 극도 수축 → 폭발적 이동 준비
 * - Andrew Lo, "Foundations of Technical Analysis" (2000) — 패턴 통계적 유의성
 *
 * 주의: VCP 감지는 본질적으로 주관적 패턴 해석의 정량화입니다.
 * 시스템은 보조 지표로만 제시하며, 최종 판단은 사용자가 합니다.
 */

import type { OHLCData, VcpAnalysis, VcpContraction } from '@/types';

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// --- 설정값 (벤치마킹 기반) ---
const MIN_BASE_DAYS = 20;           // 최소 베이스 기간
const MAX_BASE_DAYS = 325;          // 최대 베이스 기간 (약 65주)
const MIN_CONTRACTION_DEPTH = 3;    // 수축으로 인식할 최소 깊이 (%)
const PEAK_TROUGH_WINDOW = 5;       // 극값 인식 윈도우 (±N일)
const BB_PERIOD = 20;               // 볼린저 밴드 기간
const BB_SQUEEZE_PERCENTILE = 20;   // BB Width 하위 N%이면 Squeeze
const POCKET_PIVOT_LOOKBACK = 10;   // Pocket Pivot 하락일 비교 기간
const POCKET_PIVOT_MA_TOLERANCE = 3; // 10일 이평선 근접 허용 범위 (%)

// --- 가중치 (전략 흐름에 따른 배분) ---
const WEIGHT_CONTRACTION = 0.35;
const WEIGHT_VOLUME_DRY_UP = 0.25;
const WEIGHT_BB_SQUEEZE = 0.20;
const WEIGHT_POCKET_PIVOT = 0.20;

// =============================================
// 1. 로컬 극값(Peak/Trough) 감지
// =============================================

interface LocalExtremum {
  index: number;
  date: string;
  price: number;
  type: 'peak' | 'trough';
}

/** N일 윈도우 내에서 로컬 고점/저점을 찾습니다. */
function findLocalExtrema(data: OHLCData[], window: number = PEAK_TROUGH_WINDOW): LocalExtremum[] {
  const extrema: LocalExtremum[] = [];
  if (data.length < window * 2 + 1) return extrema;

  for (let i = window; i < data.length - window; i++) {
    let isPeak = true;
    let isTrough = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (data[j].high >= data[i].high) isPeak = false;
      if (data[j].low <= data[i].low) isTrough = false;
    }

    if (isPeak) {
      extrema.push({ index: i, date: data[i].date, price: data[i].high, type: 'peak' });
    }
    if (isTrough) {
      extrema.push({ index: i, date: data[i].date, price: data[i].low, type: 'trough' });
    }
  }

  return extrema;
}

// =============================================
// 2. 수축 단계 감지 (Contraction Detection)
// =============================================

/**
 * Peak→Trough 쌍을 찾아 수축 단계를 구성합니다.
 * Minervini 기준: 각 수축은 이전보다 깊이가 얕아야 합니다.
 */
function detectContractions(data: OHLCData[], extrema: LocalExtremum[]): VcpContraction[] {
  const contractions: VcpContraction[] = [];
  const peaks = extrema.filter((e) => e.type === 'peak');
  const troughs = extrema.filter((e) => e.type === 'trough');

  // 각 Peak 이후 가장 가까운 Trough를 매칭
  for (const peak of peaks) {
    const nextTrough = troughs.find((t) => t.index > peak.index);
    if (!nextTrough) continue;

    const depthPct = round(((peak.price - nextTrough.price) / peak.price) * 100);
    if (depthPct < MIN_CONTRACTION_DEPTH) continue;

    // 해당 구간의 평균 거래량 계산
    const segmentData = data.slice(peak.index, nextTrough.index + 1);
    const avgVolume = segmentData.length > 0
      ? round(segmentData.reduce((sum, d) => sum + d.volume, 0) / segmentData.length, 0)
      : 0;

    contractions.push({
      peakDate: peak.date,
      troughDate: nextTrough.date,
      peakPrice: round(peak.price),
      troughPrice: round(nextTrough.price),
      depthPct,
      avgVolume,
    });
  }

  return contractions;
}

/**
 * 수축 점수 산출 (0~100)
 * - 2~6개의 수축이 있고, 각 수축이 이전보다 얕으면 높은 점수
 * - 수축 수가 적거나 깊이가 증가하면 감점
 */
function scoreContractions(contractions: VcpContraction[]): { score: number; details: string[] } {
  const details: string[] = [];

  if (contractions.length < 2) {
    details.push(`수축 ${contractions.length}개 감지 — 최소 2개 이상 필요합니다.`);
    return { score: contractions.length === 1 ? 20 : 0, details };
  }

  let progressiveScore = 0;
  let progressiveCount = 0;

  for (let i = 1; i < contractions.length; i++) {
    if (contractions[i].depthPct < contractions[i - 1].depthPct) {
      progressiveCount++;
    }
  }

  // 점진적 수축 비율
  const progressiveRatio = progressiveCount / (contractions.length - 1);
  progressiveScore = round(progressiveRatio * 60); // 최대 60점

  // 수축 개수 보너스 (2~4개가 최적)
  const countBonus = contractions.length >= 2 && contractions.length <= 4 ? 20 : 10;

  // 최종 수축의 절대 깊이 보너스 (깊이가 10% 이하이면 타이트)
  const lastDepth = contractions.at(-1)?.depthPct ?? 100;
  const tightnessBonus = lastDepth <= 10 ? 20 : lastDepth <= 15 ? 10 : 0;

  const score = clamp(progressiveScore + countBonus + tightnessBonus, 0, 100);

  details.push(`수축 ${contractions.length}개 감지, 깊이: ${contractions.map((c) => `${c.depthPct}%`).join(' → ')}`);
  details.push(`점진적 수축 비율: ${round(progressiveRatio * 100, 0)}% (${progressiveCount}/${contractions.length - 1})`);
  if (lastDepth <= 10) details.push(`최종 수축 ${lastDepth}% — 매우 타이트한 패턴`);

  return { score, details };
}

// =============================================
// 3. 거래량 건조화 (Volume Dry-Up)
// =============================================

/**
 * 거래량 건조화 점수 (0~100)
 * - 수축 구간별 거래량이 왼→오른으로 줄어들면 높은 점수
 * - 50일 평균 대비 최종 구간 거래량이 낮을수록 좋음
 */
function scoreVolumeDryUp(
  data: OHLCData[],
  contractions: VcpContraction[]
): { score: number; details: string[] } {
  const details: string[] = [];

  if (contractions.length < 2) {
    return { score: 30, details: ['수축이 부족해 볼륨 건조화를 판정하기 어렵습니다.'] };
  }

  // 수축 구간별 거래량 감소 추세 확인
  let decreasingCount = 0;
  for (let i = 1; i < contractions.length; i++) {
    if (contractions[i].avgVolume < contractions[i - 1].avgVolume) {
      decreasingCount++;
    }
  }
  const decreasingRatio = decreasingCount / (contractions.length - 1);
  const trendScore = round(decreasingRatio * 50);

  // 50일 평균 거래량 대비 최종 수축 구간 거래량
  const recentSlice = data.slice(-50);
  const avg50Volume = recentSlice.length > 0
    ? recentSlice.reduce((sum, d) => sum + d.volume, 0) / recentSlice.length
    : 1;

  const lastContractionVolume = contractions.at(-1)?.avgVolume ?? avg50Volume;
  const volumeRatio = lastContractionVolume / avg50Volume;
  // 50% 이하면 만점, 100% 이상이면 0점
  const ratioScore = clamp(round((1 - volumeRatio) * 50), 0, 50);

  const score = clamp(trendScore + ratioScore, 0, 100);

  details.push(`볼륨 감소 추세: ${round(decreasingRatio * 100, 0)}% (${decreasingCount}/${contractions.length - 1})`);
  details.push(`최종 수축 볼륨은 50일 평균의 ${round(volumeRatio * 100, 0)}%`);

  return { score, details };
}

// =============================================
// 4. 볼린저 밴드 Squeeze
// =============================================

/** 볼린저 밴드 너비 계산: (Upper - Lower) / Middle * 100 */
export function calculateBBWidth(data: OHLCData[], period: number = BB_PERIOD): number[] {
  const widths: number[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const closes = slice.map((d) => d.close);
    const mean = closes.reduce((sum, c) => sum + c, 0) / closes.length;
    const variance = closes.reduce((sum, c) => sum + (c - mean) ** 2, 0) / closes.length;
    const stdDev = Math.sqrt(variance);
    const upper = mean + 2 * stdDev;
    const lower = mean - 2 * stdDev;

    // BB Width = (Upper - Lower) / Middle * 100
    const width = mean !== 0 ? ((upper - lower) / mean) * 100 : 0;
    widths.push(round(width, 4));
  }

  return widths;
}

/**
 * BB Squeeze 분석 (0~100)
 * - 현재 BB Width가 최근 120일 중 하위 20%이면 Squeeze 상태
 */
function scoreBBSqueeze(data: OHLCData[]): {
  score: number;
  bbWidth: number | null;
  bbWidthPercentile: number | null;
  details: string[];
} {
  const details: string[] = [];
  const widths = calculateBBWidth(data);

  if (widths.length < 20) {
    return { score: 30, bbWidth: null, bbWidthPercentile: null, details: ['데이터 부족으로 BB Squeeze를 판정할 수 없습니다.'] };
  }

  const currentWidth = widths.at(-1) ?? 0;
  // 최근 120일(또는 가용 데이터) 내에서 백분위 계산
  const lookback = Math.min(widths.length, 120);
  const recentWidths = widths.slice(-lookback);
  const sorted = [...recentWidths].sort((a, b) => a - b);
  const rank = sorted.findIndex((w) => w >= currentWidth);
  const percentile = round((rank / sorted.length) * 100, 0);

  // 하위 20%에 있으면 높은 점수
  let score: number;
  if (percentile <= BB_SQUEEZE_PERCENTILE) {
    score = 100; // Squeeze 상태
    details.push(`BB Width ${round(currentWidth, 2)}% — 120일 중 하위 ${percentile}%로 Squeeze 상태`);
  } else if (percentile <= 40) {
    score = 60;
    details.push(`BB Width ${round(currentWidth, 2)}% — 120일 중 하위 ${percentile}%로 수축 진행 중`);
  } else {
    score = 20;
    details.push(`BB Width ${round(currentWidth, 2)}% — 120일 중 ${percentile}%로 아직 수축하지 않음`);
  }

  return { score, bbWidth: round(currentWidth, 2), bbWidthPercentile: percentile, details };
}

// =============================================
// 5. Pocket Pivot 감지
// =============================================

/**
 * Pocket Pivot: 상승일 거래량 > 최근 10일 하락일 최대 거래량
 * 기관 매집의 초기 신호를 잡아냅니다.
 */
function detectPocketPivots(data: OHLCData[]): {
  score: number;
  pivots: { date: string; close: number; volume: number }[];
  details: string[];
} {
  const details: string[] = [];
  const pivots: { date: string; close: number; volume: number }[] = [];
  const scanStart = Math.max(POCKET_PIVOT_LOOKBACK + 1, data.length - 20);

  // 10일 이동평균 계산
  for (let i = scanStart; i < data.length; i++) {
    const current = data[i];
    const prev = data[i - 1];
    if (!current || !prev) continue;

    // 상승일만 검사
    if (current.close <= prev.close) continue;

    // 최근 10일 하락일 중 최대 거래량
    const lookbackSlice = data.slice(Math.max(0, i - POCKET_PIVOT_LOOKBACK), i);
    const downDayVolumes = lookbackSlice
      .filter((d, idx) => {
        const prevD = lookbackSlice[idx - 1] || data[Math.max(0, i - POCKET_PIVOT_LOOKBACK) + idx - 1];
        return prevD && d.close < prevD.close;
      })
      .map((d) => d.volume);

    if (downDayVolumes.length === 0) continue;
    const maxDownVolume = Math.max(...downDayVolumes);

    // Pocket Pivot 조건: 상승일 거래량 > 하락일 최대 거래량
    if (current.volume > maxDownVolume) {
      // 10일 이평선 근접 확인
      const ma10Slice = data.slice(Math.max(0, i - 9), i + 1);
      const ma10 = ma10Slice.reduce((sum, d) => sum + d.close, 0) / ma10Slice.length;
      const distanceFromMa10 = Math.abs((current.close - ma10) / ma10) * 100;

      if (distanceFromMa10 <= POCKET_PIVOT_MA_TOLERANCE) {
        pivots.push({
          date: current.date,
          close: round(current.close),
          volume: current.volume,
        });
      }
    }
  }

  let score: number;
  if (pivots.length >= 2) {
    score = 100;
    details.push(`최근 20일 내 Pocket Pivot ${pivots.length}개 감지 — 강한 기관 매집 시그널`);
  } else if (pivots.length === 1) {
    score = 60;
    details.push(`최근 20일 내 Pocket Pivot 1개 감지 — 기관 매집 초기 단계 가능`);
  } else {
    score = 10;
    details.push('최근 20일 내 Pocket Pivot 감지 안 됨');
  }

  return { score, pivots, details };
}

// =============================================
// 6. 피벗/무효화 포인트 결정
// =============================================

function recentLow(data: OHLCData[], lookback = 20): number | null {
  const slice = data.slice(-lookback);
  if (slice.length === 0) return null;
  return round(Math.min(...slice.map((d) => d.low)));
}

/** 최종 수축 고점을 VCP 피벗으로, 최종 수축 저점을 무효화 기준으로 사용합니다. */
function determinePivot(
  data: OHLCData[],
  contractions: VcpContraction[],
  breakoutReference: number
): {
  pivotPrice: number | null;
  invalidationPrice: number | null;
  recommendedEntry: number;
  entrySource: VcpAnalysis['entrySource'];
  details: string[];
} {
  const details: string[] = [];

  if (contractions.length < 2) {
    const fallbackInvalidation = recentLow(data);
    details.push('수축이 2개 미만이라 VCP 피벗을 확정하지 못했습니다. 최근 고점 참고가를 보조 진입가로 사용합니다.');
    if (fallbackInvalidation !== null) {
      details.push(`최근 저점 기반 무효화 참고선: $${fallbackInvalidation.toFixed(2)}`);
    }
    return {
      pivotPrice: null,
      invalidationPrice: fallbackInvalidation,
      recommendedEntry: breakoutReference,
      entrySource: 'RECENT_HIGH_FALLBACK',
      details,
    };
  }

  const lastContraction = contractions.at(-1)!;
  const pivotPrice = lastContraction.peakPrice;
  const invalidationPrice = lastContraction.troughPrice;
  const recommendedEntry = pivotPrice;

  details.push(`VCP 피벗 진입가: $${pivotPrice.toFixed(2)} (최종 수축 고점 돌파)`);
  details.push(`패턴 무효화 기준: $${invalidationPrice.toFixed(2)} (최종 수축 저점 이탈)`);
  details.push(`최근 고점 참고가: $${breakoutReference.toFixed(2)} (피벗 판단 보조용)`);

  if (breakoutReference > pivotPrice * 1.05) {
    details.push('최근 고점 참고가가 VCP 피벗보다 5% 이상 높습니다. 피벗 돌파 후 과도하게 추격하지 않도록 주의합니다.');
  }

  return { pivotPrice, invalidationPrice, recommendedEntry, entrySource: 'VCP_PIVOT', details };
}

function assessBreakoutVolume(data: OHLCData[], entryPrice: number): {
  ratio: number | null;
  status: VcpAnalysis['breakoutVolumeStatus'];
  details: string[];
} {
  const details: string[] = [];
  const latest = data.at(-1);
  if (!latest || data.length < 50 || entryPrice <= 0) {
    return { ratio: null, status: 'unknown', details: ['거래량 확인에 필요한 데이터가 부족합니다.'] };
  }

  const avg50Volume = data.slice(-50).reduce((sum, item) => sum + item.volume, 0) / 50;
  const ratio = avg50Volume > 0 ? round(latest.volume / avg50Volume, 2) : null;
  if (ratio === null) {
    return { ratio: null, status: 'unknown', details: ['평균 거래량을 계산할 수 없습니다.'] };
  }

  if (latest.close < entryPrice) {
    details.push(`아직 피벗 위에서 마감하지 않았습니다. 돌파 당일 거래량은 50일 평균 대비 ${ratio}배입니다.`);
    return { ratio, status: 'pending', details };
  }

  if (ratio >= 1.5) {
    details.push(`피벗 돌파와 함께 거래량이 50일 평균 대비 ${ratio}배로 증가했습니다.`);
    return { ratio, status: 'confirmed', details };
  }

  details.push(`피벗 위에 있으나 거래량은 50일 평균 대비 ${ratio}배입니다. 돌파 확신도는 낮게 봅니다.`);
  return { ratio, status: 'weak', details };
}

// =============================================
// 7. 베이스 기간 판정
// =============================================

/** 베이스 기간(일)을 추정합니다. 52주 고점 이후 조정 기간. */
function detectBaseLength(data: OHLCData[]): number {
  if (data.length < MIN_BASE_DAYS) return 0;

  // 최근 데이터에서 52주 고점 찾기
  const lookback = Math.min(data.length, 252);
  const slice = data.slice(-lookback);
  let highIdx = 0;
  let highPrice = 0;

  for (let i = 0; i < slice.length; i++) {
    if (slice[i].high > highPrice) {
      highPrice = slice[i].high;
      highIdx = i;
    }
  }

  // 고점 이후 경과 일수 = 베이스 기간
  const baseLength = slice.length - 1 - highIdx;
  return clamp(baseLength, 0, MAX_BASE_DAYS);
}

// =============================================
// VCP 종합 분석 메인 함수
// =============================================

export function analyzeVcp(data: OHLCData[], breakoutPrice: number): VcpAnalysis {
  const allDetails: string[] = [];

  // 최소 데이터 체크
  if (data.length < MIN_BASE_DAYS) {
    return {
      score: 0,
      grade: 'none',
      contractions: [],
      contractionScore: 0,
      volumeDryUpScore: 0,
      bbSqueezeScore: 0,
      pocketPivotScore: 0,
      pivotPrice: null,
      invalidationPrice: null,
      breakoutPrice,
      recommendedEntry: breakoutPrice,
      entrySource: 'RECENT_HIGH_FALLBACK',
      breakoutVolumeRatio: null,
      breakoutVolumeStatus: 'unknown',
      pocketPivots: [],
      bbWidth: null,
      bbWidthPercentile: null,
      baseLength: 0,
      details: ['데이터 부족으로 VCP 분석을 수행할 수 없습니다.'],
    };
  }

  const baseLength = detectBaseLength(data);
  // 베이스 기간 내 데이터로 분석 (최소 20일 보장)
  const analysisWindow = Math.max(MIN_BASE_DAYS, Math.min(baseLength + 20, data.length));
  const analysisData = data.slice(-analysisWindow);

  // Layer 1: 수축 단계 감지
  const extrema = findLocalExtrema(analysisData);
  const contractions = detectContractions(analysisData, extrema);
  const { score: contractionScore, details: contractionDetails } = scoreContractions(contractions);
  allDetails.push(...contractionDetails);

  // Layer 2: 거래량 건조화
  const { score: volumeDryUpScore, details: volumeDetails } = scoreVolumeDryUp(analysisData, contractions);
  allDetails.push(...volumeDetails);

  // Layer 3: BB Squeeze
  const { score: bbSqueezeScore, bbWidth, bbWidthPercentile, details: bbDetails } = scoreBBSqueeze(data);
  allDetails.push(...bbDetails);

  // Layer 4: Pocket Pivot
  const { score: pocketPivotScore, pivots: pocketPivots, details: ppDetails } = detectPocketPivots(data);
  allDetails.push(...ppDetails);

  // 피벗 결정
  const {
    pivotPrice,
    invalidationPrice,
    recommendedEntry,
    entrySource,
    details: pivotDetails,
  } = determinePivot(data, contractions, breakoutPrice);
  allDetails.push(...pivotDetails);

  const {
    ratio: breakoutVolumeRatio,
    status: breakoutVolumeStatus,
    details: breakoutVolumeDetails,
  } = assessBreakoutVolume(data, recommendedEntry);
  allDetails.push(...breakoutVolumeDetails);

  // 종합 스코어
  const score = round(
    contractionScore * WEIGHT_CONTRACTION +
    volumeDryUpScore * WEIGHT_VOLUME_DRY_UP +
    bbSqueezeScore * WEIGHT_BB_SQUEEZE +
    pocketPivotScore * WEIGHT_POCKET_PIVOT,
    0
  );

  // 등급 판정
  let grade: VcpAnalysis['grade'];
  if (score >= 70) grade = 'strong';
  else if (score >= 50) grade = 'forming';
  else if (score >= 25) grade = 'weak';
  else grade = 'none';

  allDetails.unshift(`VCP 종합 스코어: ${score}점 (${gradeLabel(grade)})`);

  return {
    score,
    grade,
    contractions,
    contractionScore,
    volumeDryUpScore,
    bbSqueezeScore,
    pocketPivotScore,
    pivotPrice,
    invalidationPrice,
    breakoutPrice,
    recommendedEntry,
    entrySource,
    breakoutVolumeRatio,
    breakoutVolumeStatus,
    pocketPivots,
    bbWidth,
    bbWidthPercentile,
    baseLength,
    details: allDetails,
  };
}

function gradeLabel(grade: VcpAnalysis['grade']): string {
  switch (grade) {
    case 'strong': return '유력한 VCP 형성';
    case 'forming': return '초기 형성 중';
    case 'weak': return '약한 패턴';
    case 'none': return '감지 안 됨';
  }
}
