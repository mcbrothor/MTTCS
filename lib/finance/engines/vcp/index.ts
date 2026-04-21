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

import type { OHLCData, VcpAnalysis, VcpContraction } from '../../../../types/index.ts';
import {
  MAX_BASE_DAYS,
  MIN_BASE_DAYS,
  WEIGHT_BB_SQUEEZE,
  WEIGHT_CONTRACTION,
  WEIGHT_POCKET_PIVOT,
  WEIGHT_VOLUME_DRY_UP,
  clamp,
  round,
} from './_shared.ts';
import { scoreBBSqueeze } from './bollinger-squeeze.ts';
import { detectContractions, scoreContractions, scoreVolumeDryUp } from './contractions.ts';
import { findLocalExtrema } from './extrema.ts';
import { analyzeHighTightFlag, momentumProfile } from './high-tight-flag.ts';
import { detectPocketPivots } from './pocket-pivot.ts';

export { calculateBBWidth } from './bollinger-squeeze.ts';

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

/** 베이스 기간(일)을 추정합니다. 52주 고점 이후 조정 기간. */
function detectBaseLength(data: OHLCData[]): number {
  if (data.length < MIN_BASE_DAYS) return 0;

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

  const baseLength = slice.length - 1 - highIdx;
  return clamp(baseLength, 0, MAX_BASE_DAYS);
}

function gradeLabel(grade: VcpAnalysis['grade']): string {
  switch (grade) {
    case 'strong': return '유력한 VCP 형성';
    case 'forming': return '초기 형성 중';
    case 'weak': return '약한 패턴';
    case 'none': return '감지 안 됨';
  }
}

export function analyzeVcp(
  data: OHLCData[],
  breakoutPrice: number,
  options: { rsRating?: number | null } = {}
): VcpAnalysis {
  const allDetails: string[] = [];

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
      baseType: null,
      momentumBranch: 'STANDARD',
      eightWeekReturnPct: null,
      distanceFromMa50Pct: null,
      low52WeekAdvancePct: null,
      highTightFlag: null,
      details: ['데이터 부족으로 VCP 분석을 수행할 수 없습니다.'],
    };
  }

  const momentum = momentumProfile(data);
  const baseLength = detectBaseLength(data);
  const analysisWindow = Math.max(MIN_BASE_DAYS, Math.min(baseLength + 20, data.length));
  const analysisData = data.slice(-analysisWindow);

  const extrema = findLocalExtrema(analysisData);
  const contractions = detectContractions(analysisData, extrema);
  const { score: contractionScore, details: contractionDetails } = scoreContractions(contractions);
  allDetails.push(...contractionDetails);

  const { score: volumeDryUpScore, details: volumeDetails } = scoreVolumeDryUp(analysisData, contractions);
  allDetails.push(...volumeDetails);

  const { score: bbSqueezeScore, bbWidth, bbWidthPercentile, details: bbDetails } = scoreBBSqueeze(data);
  allDetails.push(...bbDetails);

  const { score: pocketPivotScore, pivots: pocketPivots, details: ppDetails } = detectPocketPivots(data);
  allDetails.push(...ppDetails);

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

  const score = round(
    contractionScore * WEIGHT_CONTRACTION +
    volumeDryUpScore * WEIGHT_VOLUME_DRY_UP +
    bbSqueezeScore * WEIGHT_BB_SQUEEZE +
    pocketPivotScore * WEIGHT_POCKET_PIVOT,
    0
  );

  let grade: VcpAnalysis['grade'];
  if (score >= 70) grade = 'strong';
  else if (score >= 50) grade = 'forming';
  else if (score >= 25) grade = 'weak';
  else grade = 'none';

  const highTightFlag = momentum.momentumBranch === 'EXTENDED'
    ? analyzeHighTightFlag(data, recommendedEntry)
    : null;
  const standardBaseType = grade === 'strong' || grade === 'forming' ? 'Standard_VCP' as const : null;
  let finalScore = score;
  let finalGrade = grade;
  let finalBaseType: VcpAnalysis['baseType'] = standardBaseType;
  let finalPivotPrice = pivotPrice;
  let finalInvalidationPrice = invalidationPrice;
  let finalRecommendedEntry = recommendedEntry;
  let finalEntrySource = entrySource;

  allDetails.push(
    `Momentum branch: ${momentum.momentumBranch} (8-week return ${momentum.eightWeekReturnPct ?? 'n/a'}%, MA50 distance ${momentum.distanceFromMa50Pct ?? 'n/a'}%, 52-week low advance ${momentum.low52WeekAdvancePct ?? 'n/a'}%).`
  );

  if (highTightFlag) {
    allDetails.push(
      `High Tight Flag check: base ${highTightFlag.baseDays}d, drawdown ${highTightFlag.maxDrawdownPct ?? 'n/a'}%, right-side volume ${highTightFlag.rightSideVolumeRatio ?? 'n/a'}x 50-day avg, tightness ${highTightFlag.tightnessScore}/100.`
    );
    if (options.rsRating !== null && options.rsRating !== undefined) {
      allDetails.push(`HTF context RS rating: ${options.rsRating}. RS 90+ is required for Recommended tier, but volume dry-up is still mandatory.`);
    }
  }

  if (highTightFlag?.passed) {
    const htfScore = clamp(round(
      45 +
      (highTightFlag.tightnessScore * 0.25) +
      (volumeDryUpScore * 0.2) +
      (pocketPivotScore * 0.1),
      0
    ), 50, 95);
    finalScore = Math.max(score, htfScore);
    finalGrade = finalScore >= 70 ? 'strong' : 'forming';
    finalBaseType = 'High_Tight_Flag';
    finalPivotPrice = highTightFlag.baseHigh;
    finalInvalidationPrice = highTightFlag.baseLow;
    finalRecommendedEntry = highTightFlag.baseHigh;
    finalEntrySource = 'HIGH_TIGHT_FLAG';
    allDetails.push('High Tight Flag passed: shallow base plus mandatory right-side volume dry-up were detected.');
  } else if (momentum.momentumBranch === 'EXTENDED') {
    allDetails.push('Extended momentum was detected, but High Tight Flag did not pass because base duration, drawdown, or volume dry-up was insufficient.');
  }

  allDetails.unshift(`VCP composite score: ${finalScore} (${gradeLabel(finalGrade)})`);

  return {
    score: finalScore,
    grade: finalGrade,
    contractions,
    contractionScore,
    volumeDryUpScore,
    bbSqueezeScore,
    pocketPivotScore,
    pivotPrice: finalPivotPrice,
    invalidationPrice: finalInvalidationPrice,
    breakoutPrice,
    recommendedEntry: finalRecommendedEntry,
    entrySource: finalEntrySource,
    breakoutVolumeRatio,
    breakoutVolumeStatus,
    pocketPivots,
    bbWidth,
    bbWidthPercentile,
    baseLength,
    baseType: finalBaseType,
    momentumBranch: momentum.momentumBranch,
    eightWeekReturnPct: momentum.eightWeekReturnPct,
    distanceFromMa50Pct: momentum.distanceFromMa50Pct,
    low52WeekAdvancePct: momentum.low52WeekAdvancePct,
    highTightFlag,
    details: allDetails,
  };
}
