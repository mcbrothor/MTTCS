import type { RecommendationTier, ScannerResult } from '@/types';

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
    scoreAtLeast(result.volumeDryUpScore, 65) ||
    scoreAtLeast(result.pocketPivotScore, 60) ||
    result.breakoutVolumeStatus === 'confirmed'
  ) {
    return 'Strong';
  }

  if (
    scoreAtLeast(result.volumeDryUpScore, 50) ||
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
    const externalRsRating = item.externalRsRating ?? null;
    const internalRsRating = ranked.rating;
    return {
      ...item,
      internalRsRating,
      rsRating: externalRsRating ?? internalRsRating ?? item.benchmarkRelativeScore ?? null,
      rsRank: ranked.rank,
      rsUniverseSize: universeSize,
      rsPercentile: ranked.percentile,
    };
  });
}

export function evaluateScannerRecommendation(result: Partial<ScannerResult>): ScannerRecommendation {
  if (result.status === 'error') {
    return {
      recommendationTier: 'Error',
      recommendationReason: result.errorMessage || 'Data fetch or analysis did not complete.',
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
  const volumeTier = getVolumeSignalTier(result);
  const volumeWatch = volumeTier === 'Strong' || volumeTier === 'Watch';
  const volumeStrong = volumeTier === 'Strong';
  const rs90 = scoreAtLeast(result.rsRating, 90);
  const rsLineHigh = result.rsLineNewHigh === true || result.rsLineNearHigh === true;
  const htfPassed = result.baseType === 'High_Tight_Flag' && result.highTightFlag?.passed === true;
  const standardVcp = result.baseType === 'Standard_VCP' || (!result.baseType && constructiveVcp);

  const exceptionSignals = [
    strongVcp ? 'Strong VCP' : null,
    result.baseType ? `Base ${result.baseType}` : null,
    tightPivot ? 'Pivot within 3%' : nearActionablePivot ? 'Pivot within 5%' : null,
    pocketPivot ? 'Pocket pivot' : null,
    volumeDryUp ? 'Volume dry-up' : null,
    breakoutVolume ? 'Breakout volume watch' : null,
    rs90 ? 'RS 90+' : null,
    rsLineHigh ? 'RS Line high/near high' : null,
    (result.tennisBallCount || 0) >= 2 ? `Tennis Ball ${result.tennisBallCount}` : null,
  ].filter((item): item is string => Boolean(item));

  if (sepaPass && standardVcp && constructiveVcp && volumeWatch) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'SEPA passed with constructive Standard VCP and at least Watch-level volume evidence.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if (htfPassed && rs90 && rsLineHigh && volumeStrong) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'High Tight Flag passed with RS 90+, RS Line high/near high, and Strong volume evidence.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if (sepaMissingCount !== null && sepaMissingCount <= 2 && htfPassed && volumeWatch) {
    return {
      recommendationTier: 'Partial',
      recommendationReason: 'Some SEPA items are missing, but HTF base quality and volume digestion justify contest review.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if (rs90 && (result.tennisBallCount || 0) >= 2 && volumeWatch) {
    return {
      recommendationTier: 'Partial',
      recommendationReason: 'RS 90+ and repeated tennis-ball action justify review, but RS alone is not enough for Recommended.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  return {
    recommendationTier: 'Low Priority',
    recommendationReason: 'Current SEPA/VCP/RS/volume evidence is not enough for contest priority, but manual selection remains available.',
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
