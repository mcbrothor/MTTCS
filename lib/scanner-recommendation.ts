import type { RecommendationTier, ScannerResult } from '@/types';

export interface ScannerRecommendation {
  recommendationTier: RecommendationTier;
  recommendationReason: string;
  sepaMissingCount: number | null;
  exceptionSignals: string[];
}

function nearPivot(distanceToPivotPct: number | null | undefined, maxAbs = 5) {
  return typeof distanceToPivotPct === 'number' && Number.isFinite(distanceToPivotPct) && Math.abs(distanceToPivotPct) <= maxAbs;
}

function scoreAtLeast(value: number | null | undefined, threshold: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= threshold;
}

export function evaluateScannerRecommendation(result: Partial<ScannerResult>): ScannerRecommendation {
  if (result.status === 'error') {
    return {
      recommendationTier: 'Error',
      recommendationReason: result.errorMessage || '데이터 조회 또는 분석이 완료되지 않았습니다.',
      sepaMissingCount: result.sepaFailed ?? null,
      exceptionSignals: [],
    };
  }

  const sepaMissingCount = result.sepaFailed ?? null;
  const sepaPass = result.sepaStatus === 'pass';
  const strongVcp = result.vcpGrade === 'strong' || scoreAtLeast(result.vcpScore, 75);
  const constructiveVcp = strongVcp || result.vcpGrade === 'forming' || scoreAtLeast(result.vcpScore, 55);
  const tightPivot = nearPivot(result.distanceToPivotPct, 3);
  const nearActionablePivot = nearPivot(result.distanceToPivotPct, 5);
  const pocketPivot = scoreAtLeast(result.pocketPivotScore, 60);
  const volumeDryUp = scoreAtLeast(result.volumeDryUpScore, 65);
  const breakoutVolume = result.breakoutVolumeStatus === 'confirmed' || result.breakoutVolumeStatus === 'pending';

  const exceptionSignals = [
    strongVcp ? '강한 VCP 구조' : null,
    tightPivot ? '피벗 3% 이내' : nearActionablePivot ? '피벗 5% 이내' : null,
    pocketPivot ? '포켓 피벗 신호' : null,
    volumeDryUp ? '거래량 건조' : null,
    breakoutVolume ? '돌파 거래량 확인 필요' : null,
  ].filter((item): item is string => Boolean(item));

  if (sepaPass && (strongVcp || nearActionablePivot || volumeDryUp || pocketPivot)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'SEPA를 통과했고 VCP/피벗/거래량 중 핵심 신호가 확인됩니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if ((sepaMissingCount !== null && sepaMissingCount <= 1 && strongVcp && nearActionablePivot) || (sepaPass && constructiveVcp)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'SEPA 통과에 준하는 구조이며 콘테스트 우선 비교 가치가 있습니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if ((sepaMissingCount !== null && sepaMissingCount <= 2 && (constructiveVcp || nearActionablePivot || exceptionSignals.length > 0)) || exceptionSignals.length >= 2) {
    return {
      recommendationTier: 'Partial',
      recommendationReason: '일부 SEPA 미달이 있지만 모멘텀/VCP/피벗 신호 때문에 예외 비교 가치가 있습니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  return {
    recommendationTier: 'Low Priority',
    recommendationReason: '현재는 핵심 조건 충족도가 낮아 우선 후보는 아니지만 수동 비교는 가능합니다.',
    sepaMissingCount,
    exceptionSignals,
  };
}

export function isContestPoolTier(tier: RecommendationTier | null | undefined) {
  return tier === 'Recommended' || tier === 'Partial';
}

export function recommendationSortValue(tier: RecommendationTier | null | undefined) {
  if (tier === 'Recommended') return 0;
  if (tier === 'Partial') return 1;
  if (tier === 'Low Priority') return 2;
  return 3;
}
