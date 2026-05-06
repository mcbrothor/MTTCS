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

function actionablePivot(distanceToPivotPct: number | null | undefined) {
  return typeof distanceToPivotPct === 'number' && Number.isFinite(distanceToPivotPct) && distanceToPivotPct >= -2 && distanceToPivotPct <= 3;
}

function reviewPivot(distanceToPivotPct: number | null | undefined) {
  return typeof distanceToPivotPct === 'number' && Number.isFinite(distanceToPivotPct) && distanceToPivotPct >= -12 && distanceToPivotPct <= 8;
}

function scoreAtLeast(value: number | null | undefined, threshold: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= threshold;
}

function coreSummary(result: Partial<ScannerResult>) {
  const summary = result.sepaEvidence?.summary;
  const coreTotal = summary?.coreTotal ?? 7;
  const fallbackCorePassed = result.sepaStatus === 'pass'
    ? coreTotal
    : (typeof result.sepaFailed === 'number' && result.sepaFailed <= 2 ? coreTotal - 1 : null);
  const corePassed = summary?.corePassed ?? fallbackCorePassed;
  const coreFailed = summary?.coreFailed ?? (typeof corePassed === 'number' ? Math.max(0, coreTotal - corePassed) : null);
  return { coreTotal, corePassed, coreFailed };
}

function hasValidPivot(result: Partial<ScannerResult>) {
  return result.entrySource === 'VCP_PIVOT'
    || result.entrySource === 'HIGH_TIGHT_FLAG'
    || result.pivotKind === 'VCP_PIVOT'
    || result.pivotKind === 'HIGH_TIGHT_FLAG';
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
    const externalRsRating = item.externalRsRating ?? (item.rsSource === 'DB_BATCH' ? item.rsRating ?? null : null);
    const internalRsRating = ranked.rating;
    const rsRating = externalRsRating ?? internalRsRating ?? item.benchmarkRelativeScore ?? null;
    const rsSource = externalRsRating !== null ? (item.rsSource ?? 'DB_BATCH') : 'UNIVERSE';
    const sepaEvidence = item.sepaEvidence;

    if (sepaEvidence) {
      const rsCriterion = sepaEvidence.criteria.find(c => c.id === 'rs_rating');
      if (rsCriterion) {
        rsCriterion.status = rsRating !== null && rsRating >= 70 ? 'pass' : (rsRating !== null ? 'fail' : 'info');
        rsCriterion.actual = rsRating !== null
          ? rsSource === 'DB_BATCH'
            ? `${rsRating}점 (공식 RS)`
            : `${ranked.rank}위 / ${rsRating}점 (실시간 유니버스 RS)`
          : '데이터 없음';
        rsCriterion.description = rsSource === 'DB_BATCH'
          ? '데이터베이스에서 조회한 공식 RS Rating입니다.'
          : '현재 스캔 유니버스 내 실시간 랭크 기준 RS입니다.';
      }

      const passed = sepaEvidence.criteria.filter(c => c.status === 'pass').length;
      const failed = sepaEvidence.criteria.filter(c => c.status === 'fail').length;
      const info = sepaEvidence.criteria.filter(c => c.status === 'info').length;
      sepaEvidence.summary = { ...sepaEvidence.summary, passed, failed, info };
      sepaEvidence.metrics = {
        ...sepaEvidence.metrics,
        rsRating,
        rsSource,
        rsRank: ranked.rank,
        rsUniverseSize: universeSize,
        rsPercentile: ranked.percentile,
      };
    }

    return {
      ...item,
      internalRsRating,
      externalRsRating,
      rsRating,
      rsSource,
      rsRank: ranked.rank,
      rsUniverseSize: universeSize,
      rsPercentile: ranked.percentile,
      sepaEvidence,
    };
  });
}

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
    const externalRsRating = item.rsSource === 'DB_BATCH' ? (item.rsRating ?? null) : null;
    const internalRsRating = ranked.rating;
    const rsRating = externalRsRating ?? internalRsRating;
    const rsSource = externalRsRating !== null ? ('DB_BATCH' as const) : ('UNIVERSE' as const);

    return {
      ...item,
      rsRating,
      rsSource,
      rsRank: ranked.rank,
      rsUniverseSize: universeSize,
      rsPercentile: ranked.percentile,
    };
  });
}

export function evaluateScannerRecommendation(result: Partial<ScannerResult>): ScannerRecommendation {
  const { coreTotal, corePassed, coreFailed } = coreSummary(result);

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
  const reviewSepa = typeof corePassed === 'number' && corePassed >= coreTotal - 1;
  const watchSepa = typeof corePassed === 'number' && corePassed >= Math.max(0, coreTotal - 2);
  const strongVcp = result.vcpGrade === 'strong' || scoreAtLeast(result.vcpScore, 80);
  const constructiveVcp = strongVcp || result.vcpGrade === 'forming' || scoreAtLeast(result.vcpScore, 60);
  const validPivot = hasValidPivot(result);
  const tightPivot = validPivot && actionablePivot(result.distanceToPivotPct);
  const nearActionablePivot = validPivot && nearPivot(result.distanceToPivotPct, 5);
  const reviewReadyPivot = validPivot && reviewPivot(result.distanceToPivotPct);
  const pocketPivot = scoreAtLeast(result.pocketPivotScore, 60);
  const volumeDryUp = scoreAtLeast(result.volumeDryUpScore, 65);
  const breakoutVolume = result.breakoutVolumeStatus === 'confirmed' || result.breakoutVolumeStatus === 'pending';
  const volumeTier = getVolumeSignalTier(result);
  const volumeWatch = volumeTier === 'Strong' || volumeTier === 'Watch';
  const volumeStrong = volumeTier === 'Strong';
  const accumulationSignal = volumeWatch || pocketPivot || volumeDryUp || breakoutVolume;
  const rs80 = scoreAtLeast(result.rsRating, 80);
  const rs85 = scoreAtLeast(result.rsRating, 85);
  const rs90 = scoreAtLeast(result.rsRating, 90);
  const rs95 = scoreAtLeast(result.rsRating, 95);
  const rsLineHigh = result.rsLineNewHigh === true || result.rsLineNearHigh === true;
  const htfPassed = result.baseType === 'High_Tight_Flag' && result.highTightFlag?.passed === true;
  const tennisBall = (result.tennisBallCount || 0) >= 2;
  const ma50Controlled = typeof result.distanceFromMa50Pct !== 'number' || result.distanceFromMa50Pct <= 15;
  const leadershipSetupWithoutPivot = !validPivot && rs90 && ma50Controlled && (rsLineHigh || accumulationSignal || tennisBall);

  const exceptionSignals = [
    strongVcp ? 'Strong VCP' : null,
    validPivot && result.baseType ? `Base ${result.baseType}` : null,
    tightPivot ? 'Pivot within 3%' : nearActionablePivot ? 'Pivot within 5%' : null,
    pocketPivot ? 'Pocket pivot' : null,
    volumeDryUp ? 'Volume dry-up' : null,
    breakoutVolume ? 'Breakout volume watch' : null,
    rs90 ? 'RS 90+' : null,
    rsLineHigh ? 'RS Line high/near high' : null,
    tennisBall ? `Tennis Ball ${result.tennisBallCount}` : null,
  ].filter((item): item is string => Boolean(item));

  if (sepaPass && validPivot && strongVcp && tightPivot && rs90 && (volumeStrong || breakoutVolume)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'SEPA 7/7, RS 90+ 리더십, 유효 VCP/HTF 피벗 근접, 거래량 확인이 결합된 실행 후보입니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if (sepaPass && validPivot && rs95 && tightPivot && (constructiveVcp || tennisBall)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'RS 95+ 최상위 리더가 유효 피벗 근처에서 기술적 근거를 유지하고 있어 우선 실행 후보입니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if (htfPassed && validPivot && rs90 && tightPivot && (volumeStrong || rsLineHigh)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'High Tight Flag 패턴과 강력한 RS/거래량 리더십이 확인된 실행 후보입니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if (rs85 && reviewSepa && constructiveVcp && accumulationSignal && (reviewReadyPivot || leadershipSetupWithoutPivot)) {
    return {
      recommendationTier: 'IB Review',
      recommendationReason: reviewReadyPivot
        ? 'RS 85+, SEPA core 6/7 이상, 유효 피벗, 건설적 VCP, 거래량 단서가 확인된 투자위원회 검토 후보입니다.'
        : 'RS 90+ 주도주가 SEPA core 6/7 이상과 건설적 VCP/매집 단서를 보입니다. 유효 피벗은 아직 미확정이므로 매수 타점이 아닌 IB 검토 후보입니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  if (rs80 && watchSepa && (constructiveVcp || tennisBall || rsLineHigh || pocketPivot || volumeDryUp)) {
    return {
      recommendationTier: 'Watch',
      recommendationReason: validPivot
        ? 'RS 80+와 일부 기술적 단서가 있으나, IB Review 조건에는 아직 피벗 위치·거래량·SEPA 조합이 부족합니다.'
        : 'RS 80+와 형성 단서는 있으나 유효 VCP/HTF 피벗이 확정되지 않아 형성 관찰 후보로만 분류합니다.',
      sepaMissingCount,
      exceptionSignals,
    };
  }

  return {
    recommendationTier: 'Low Priority',
    recommendationReason: '현재 SEPA/VCP/RS/거래량 증거가 스크리너 우선순위에 들기에는 부족합니다. 수동 검토는 가능합니다.',
    sepaMissingCount,
    exceptionSignals,
  };
}

export function scannerReviewScore(result: Partial<ScannerResult>) {
  const { coreTotal, corePassed } = coreSummary(result);
  const rs = Math.max(0, Math.min(99, result.rsRating ?? 0));
  const vcp = Math.max(0, Math.min(100, result.vcpScore ?? 0));
  const sepa = typeof corePassed === 'number' && coreTotal > 0 ? Math.max(0, Math.min(1, corePassed / coreTotal)) * 100 : 0;
  const distance = typeof result.distanceToPivotPct === 'number' ? result.distanceToPivotPct : null;
  const pivotScore = distance === null
    ? hasValidPivot(result)
      ? 0
      : 45
    : distance >= -2 && distance <= 3
      ? 100
      : distance >= -12 && distance <= 8
        ? Math.max(30, 100 - Math.abs(distance) * 8)
        : 0;
  const volumeTier = getVolumeSignalTier(result);
  const volumeScore = volumeTier === 'Strong' ? 100 : volumeTier === 'Watch' ? 65 : 0;
  const bonus =
    (result.rsLineNewHigh || result.rsLineNearHigh ? 5 : 0) +
    (scoreAtLeast(result.pocketPivotScore, 60) ? 4 : 0) +
    (scoreAtLeast(result.volumeDryUpScore, 65) ? 4 : 0);

  return Math.round((rs * 0.30) + (vcp * 0.25) + (sepa * 0.20) + (pivotScore * 0.15) + (volumeScore * 0.10) + bonus);
}

export function applyScannerReviewPoolRankings(results: ScannerResult[], maxReviewPool = 15): ScannerResult[] {
  const reviewed = results.map((item) => ({
    ...item,
    ...evaluateScannerRecommendation(item),
  }));
  const keep = new Set(
    reviewed
      .filter((item) => item.recommendationTier === 'IB Review')
      .sort((a, b) => scannerReviewScore(b) - scannerReviewScore(a) || (b.rsRating || 0) - (a.rsRating || 0))
      .slice(0, maxReviewPool)
      .map((item) => item.ticker)
  );

  return reviewed.map((item) => {
    if (item.recommendationTier !== 'IB Review' || keep.has(item.ticker)) return item;
    return {
      ...item,
      recommendationTier: 'Watch',
      recommendationReason: 'IB Review 최소 조건은 충족했지만, 동일 로직 composite score 상위 15개 밖이라 Watch로 유지합니다.',
    };
  });
}

export function isContestPoolTier(tier: RecommendationTier | null | undefined) {
  return tier === 'Recommended' || tier === 'IB Review';
}

export function isAutoSelectedTier(tier: RecommendationTier | null | undefined) {
  return tier === 'Recommended' || tier === 'IB Review';
}

export function recommendationSortValue(tier: RecommendationTier | null | undefined) {
  if (tier === 'Recommended') return 0;
  if (tier === 'IB Review') return 1;
  if (tier === 'Watch' || tier === 'Partial') return 2;
  if (tier === 'Low Priority') return 3;
  return 4;
}
