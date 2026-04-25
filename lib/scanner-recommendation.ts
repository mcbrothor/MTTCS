import type { CanslimScannerResult, RecommendationTier, ScannerResult } from '../types/index.ts';

export type VolumeSignalTier = 'Strong' | 'Watch' | 'Weak' | 'Unknown';

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

export function getVolumeSignalTier(result: Partial<ScannerResult>): VolumeSignalTier {
  if (result.status === 'error') return 'Unknown';
  const hasAnyVolumeData =
    typeof result.volumeDryUpScore === 'number' ||
    typeof result.pocketPivotScore === 'number' ||
    typeof result.breakoutVolumeStatus === 'string';
  if (!hasAnyVolumeData) return 'Unknown';

  if (
    scoreAtLeast(result.volumeDryUpScore, 60) ||
    scoreAtLeast(result.pocketPivotScore, 60) ||
    result.breakoutVolumeStatus === 'confirmed'
  ) {
    return 'Strong';
  }

  if (
    scoreAtLeast(result.volumeDryUpScore, 40) ||
    scoreAtLeast(result.pocketPivotScore, 40) ||
    result.breakoutVolumeStatus === 'pending'
  ) {
    return 'Watch';
  }

  return 'Weak';
}

export function applyUniverseRsRankings(results: ScannerResult[]): ScannerResult[] {
  const analyzable = results
    .filter((item) => item.status === 'done' && scoreAtLeast(item.weightedMomentumScore, -9999))
    .sort((a, b) => (b.weightedMomentumScore ?? -9999) - (a.weightedMomentumScore ?? -9999));
  const universeSize = analyzable.length;
  const rankByTicker = new Map<string, { rank: number; rating: number; percentile: number }>();

  analyzable.forEach((item, index) => {
    const rank = index + 1;
    const rating = universeSize <= 1
      ? 50
      : Math.round(99 - ((rank - 1) / (universeSize - 1)) * 98);
    const percentile = universeSize <= 1
      ? 50
      : Math.round((1 - ((rank - 1) / (universeSize - 1))) * 100);
    rankByTicker.set(item.ticker, { rank, rating, percentile });
  });

  return results.map((item) => {
    const ranked = rankByTicker.get(item.ticker);
    if (!ranked) return item;
    const externalRsRating = item.externalRsRating ?? (item.rsSource === 'BENCHMARK_PROXY' ? item.rsRating ?? null : null);
    const internalRsRating = ranked.rating;
    return {
      ...item,
      internalRsRating,
      externalRsRating,
      rsRating: externalRsRating ?? internalRsRating ?? item.benchmarkRelativeScore ?? null,
      rsSource: externalRsRating !== null ? (item.rsSource ?? 'BENCHMARK_PROXY') : 'UNIVERSE',
      rsRank: ranked.rank,
      rsUniverseSize: universeSize,
      rsPercentile: ranked.percentile,
    };
  });
}

/**
 * 오닐(CANSLIM) 스캐너 전용 RS 유니버스 랭킹 부여
 * weightedMomentumScore가 없는 CanslimScannerResult에 대해
 * benchmarkRelativeScore를 기준으로 RS 백분위를 계산합니다.
 */
export function applyCanslimUniverseRsRankings(results: CanslimScannerResult[]): CanslimScannerResult[] {
  const analyzable = results
    .filter((item) => item.status === 'done' && typeof (item.benchmarkRelativeScore ?? item.rsRating) === 'number')
    .sort((a, b) => {
      const scoreA = a.benchmarkRelativeScore ?? a.rsRating ?? -9999;
      const scoreB = b.benchmarkRelativeScore ?? b.rsRating ?? -9999;
      return scoreB - scoreA;
    });

  const universeSize = analyzable.length;
  const rankByTicker = new Map<string, { rank: number; rating: number; percentile: number }>();

  analyzable.forEach((item, index) => {
    const rank = index + 1;
    const rating = universeSize <= 1
      ? 50
      : Math.round(99 - ((rank - 1) / (universeSize - 1)) * 98);
    const percentile = universeSize <= 1
      ? 50
      : Math.round((1 - ((rank - 1) / (universeSize - 1))) * 100);
    rankByTicker.set(item.ticker, { rank, rating, percentile });
  });

  return results.map((item) => {
    const ranked = rankByTicker.get(item.ticker);
    if (!ranked) return item;
    // DB에서 가져온 공식 RS가 있으면 우선 사용, 없으면 유니버스 내 랭킹 적용
    const externalRsRating = item.rsSource === 'DB_BATCH' ? (item.rsRating ?? null) : null;
    const internalRsRating = ranked.rating;
    return {
      ...item,
      rsRating: externalRsRating ?? internalRsRating,
      rsSource: externalRsRating !== null ? ('DB_BATCH' as const) : ('UNIVERSE' as const),
    };
  });
}

export function evaluateScannerRecommendation(result: Partial<ScannerResult>): ScannerRecommendation {
  const summary = result.sepaEvidence?.summary;
  const coreTotal = summary?.coreTotal ?? 7;
  const fallbackCorePassed = result.sepaStatus === 'pass'
    ? coreTotal
    : (typeof result.sepaFailed === 'number' && result.sepaFailed <= 2 ? coreTotal - 1 : null);
  const corePassed = summary?.corePassed ?? fallbackCorePassed;
  const coreFailed = summary?.coreFailed ?? (typeof corePassed === 'number' ? Math.max(0, coreTotal - corePassed) : null);

  if (result.status === 'error') {
    return {
      recommendationTier: 'Error',
      recommendationReason: result.errorMessage || 'Data fetch or analysis did not complete.',
      sepaMissingCount: coreFailed ?? result.sepaFailed ?? null,
      exceptionSignals: [],
    };
  }

  const sepaMissingCount = coreFailed ?? result.sepaFailed ?? null;
  const sepaPass = result.sepaStatus === 'pass' && corePassed === coreTotal;
  const nearSepaPass = typeof corePassed === 'number' && corePassed >= coreTotal - 1;
  const strongVcp = result.vcpGrade === 'strong' || scoreAtLeast(result.vcpScore, 80);
  const constructiveVcp = strongVcp || result.vcpGrade === 'forming' || scoreAtLeast(result.vcpScore, 60);
  const tightPivot = nearPivot(result.distanceToPivotPct, 3);
  const nearActionablePivot = nearPivot(result.distanceToPivotPct, 5);
  const pocketPivot = scoreAtLeast(result.pocketPivotScore, 60);
  const volumeDryUp = scoreAtLeast(result.volumeDryUpScore, 65);
  const breakoutVolume = result.breakoutVolumeStatus === 'confirmed' || result.breakoutVolumeStatus === 'pending';
  const volumeTier = getVolumeSignalTier(result);
  const volumeWatch = volumeTier === 'Strong' || volumeTier === 'Watch';
  const volumeStrong = volumeTier === 'Strong';
  const rs85 = scoreAtLeast(result.rsRating, 85);
  const rs90 = scoreAtLeast(result.rsRating, 90);
  const rs95 = scoreAtLeast(result.rsRating, 95);
  const rsLineHigh = result.rsLineNewHigh === true || result.rsLineNearHigh === true;
  const htfPassed = result.baseType === 'High_Tight_Flag' && result.highTightFlag?.passed === true;
  const tennisBall = (result.tennisBallCount || 0) >= 2;

  const exceptionSignals = [
    strongVcp ? 'Strong VCP' : null,
    result.baseType ? `Base ${result.baseType}` : null,
    tightPivot ? 'Pivot within 3%' : nearActionablePivot ? 'Pivot within 5%' : null,
    pocketPivot ? 'Pocket pivot' : null,
    volumeDryUp ? 'Volume dry-up' : null,
    breakoutVolume ? 'Breakout volume watch' : null,
    rs90 ? 'RS 90+' : null,
    rsLineHigh ? 'RS Line high/near high' : null,
    tennisBall ? `Tennis Ball ${result.tennisBallCount}` : null,
  ].filter((item): item is string => Boolean(item));

  // --- Tier 1: Recommended (엄격한 SEPA + 기술적 증거 1개 이상 OR 압도적 기술적 리더) ---
  
  // 1-1. SEPA 통과 + 유효한 베이스 + 거래량/RS 뒷받침
  if (sepaPass && constructiveVcp && (volumeWatch || rs85)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'SEPA 통과 및 건설적인 차트 패턴(VCP/HTF)과 거래량/RS 리더십이 결합되었습니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  // 1-2. RS 95+ 슈퍼 리더 (SEPA가 완벽하다면 우선 추천)
  if (sepaPass && rs95 && (constructiveVcp || tennisBall)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'RS 95+의 시장 주도주 및 기술적 증거(VCP/Tennis Ball)가 확인되어 최우선 순위로 추천합니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  // 1-3. High Tight Flag (압도적 모멘텀)
  if (htfPassed && rs90 && (volumeStrong || rsLineHigh)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'High Tight Flag 패턴과 강력한 RS/거래량 리더십이 확인된 주도주 후보입니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  // 1-4. VCP 돌파 확인 (거래량 실린 돌파)
  if (sepaPass && strongVcp && breakoutVolume && volumeStrong) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: '강력한 VCP 베이스 상단에서의 거래량을 동반한 돌파 신호가 감지되었습니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  // --- Tier 2: Partial (기술적으론 좋으나 SEPA가 부족하거나, SEPA는 좋으나 기술적 증거가 약함) ---

  // 2-1. SEPA가 1~2개 부족하지만 기술적으로 매우 훌륭한 경우 (사용자 요청: Partial 유지)
  if (nearSepaPass && !sepaPass && constructiveVcp && volumeWatch) {
    return {
      recommendationTier: 'Partial',
      recommendationReason: '핵심 SEPA 기준이 1개 부족해 경고 구간이지만, 기술적 패턴과 거래량 신호가 살아 있어 관찰 후보로 유지합니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  // 2-2. RS 85+ 리더십 + VCP 형성 중
  if (rs85 && constructiveVcp) {
    return {
      recommendationTier: 'Partial',
      recommendationReason: 'RS 85+ 주도주 영역에서 베이스를 형성 중인 후보로, 콘테스트 검토 가치가 충분합니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  // 2-3. 테니스공 액션 (변동성 수축 증거)
  if (tennisBall && volumeWatch) {
    return {
      recommendationTier: 'Partial',
      recommendationReason: '반복적인 테니스공 액션(회복력)이 확인되어 건설적인 하락/반등 과정을 거치고 있습니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  // 2-4. 포켓 피벗 / 거래량 마름 (VCP 내부 신호)
  if ((pocketPivot || volumeDryUp) && rs85) {
    return {
      recommendationTier: 'Partial',
      recommendationReason: '베이스 내부의 매집 신호(Pocket Pivot) 또는 매물 소화(Dry-up)가 RS 리더십과 함께 관찰됩니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  return {
    recommendationTier: 'Low Priority',
    recommendationReason: '현재 SEPA/VCP/RS/거래량 증거가 콘테스트 우선순위에 들기에는 부족합니다. 수동 검토는 가능합니다.',
    sepaMissingCount,
    exceptionSignals,
  };
}


export function isContestPoolTier(tier: RecommendationTier | null | undefined) {
  return tier === 'Recommended' || tier === 'Partial';
}

export function isAutoSelectedTier(tier: RecommendationTier | null | undefined) {
  return tier === 'Recommended';
}

export function recommendationSortValue(tier: RecommendationTier | null | undefined) {
  if (tier === 'Recommended') return 0;
  if (tier === 'Partial') return 1;
  if (tier === 'Low Priority') return 2;
  return 3;
}
