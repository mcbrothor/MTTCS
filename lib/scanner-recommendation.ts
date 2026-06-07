import type { CanslimScannerResult, MacroActionLevel, MacroRegime, RecommendationTier, ScannerResult } from '../types/index.ts';

export type VolumeSignalTier = 'Strong' | 'Watch' | 'Weak' | 'Unknown';

export type TierSBlocker =
  | 'sepa_core'
  | 'rs_rating'
  | 'valid_pivot'
  | 'pivot_distance'
  | 'vcp_strength'
  | 'ma50_extension'
  | 'volume_confirmation'
  | 'risk_gate'
  | 'stop_invalid'
  | 'daily_drop'
  | 'adr_overheat';

export interface ScannerRecommendation {
  recommendationTier: RecommendationTier;
  recommendationReason: string;
  sepaMissingCount: number | null;
  exceptionSignals: string[];
  tierSBlockers: TierSBlocker[];
}

// Regime-adaptive threshold modifiers — relax gates in Risk-On windows so that
// strong setups are surfaced when the broader market backdrop supports entry,
// and tighten them when macro deteriorates so we don't surface marginal trades.
interface RegimeModifier {
  rsBonus: number;       // added to RS thresholds (negative = easier)
  sepaSlack: number;     // additional SEPA core misses tolerated (positive = easier)
  pivotBonus: number;    // additional % allowed above the actionable pivot ceiling
}

function regimeModifier(regime: MacroRegime): RegimeModifier {
  if (regime === 'RISK_ON') return { rsBonus: -5, sepaSlack: 1, pivotBonus: 2 };
  if (regime === 'RISK_OFF') return { rsBonus: 3, sepaSlack: -1, pivotBonus: -1 };
  return { rsBonus: 0, sepaSlack: 0, pivotBonus: 0 };
}

// Map persisted MacroActionLevel to regime so call sites that already store the
// action level on each ScannerResult don't need a separate plumbing path.
function regimeFromActionLevel(level: MacroActionLevel | null | undefined): MacroRegime {
  if (level === 'FULL') return 'RISK_ON';
  if (level === 'HALT') return 'RISK_OFF';
  return 'NEUTRAL';
}

function nearPivot(distanceToPivotPct: number | null | undefined, maxAbs = 5) {
  return typeof distanceToPivotPct === 'number' && Number.isFinite(distanceToPivotPct) && Math.abs(distanceToPivotPct) <= maxAbs;
}

function actionablePivot(distanceToPivotPct: number | null | undefined, pivotBonus = 0) {
  return typeof distanceToPivotPct === 'number'
    && Number.isFinite(distanceToPivotPct)
    && distanceToPivotPct >= -2
    && distanceToPivotPct <= (3 + pivotBonus);
}

function actionTierPivot(distanceToPivotPct: number | null | undefined, pivotBonus = 0) {
  return typeof distanceToPivotPct === 'number'
    && Number.isFinite(distanceToPivotPct)
    && distanceToPivotPct >= -8
    && distanceToPivotPct <= (5 + pivotBonus);
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

const DAILY_DROP_BLOCK_PCT = -8;
const ADR_OVERHEAT_BLOCK_PCT = 7;

function executionRiskBlockers(result: Partial<ScannerResult>): TierSBlocker[] {
  const blockers: TierSBlocker[] = [];
  if (result.riskGate?.status === 'BLOCK') blockers.push('risk_gate');
  if (result.stopQuality === 'INVALID') blockers.push('stop_invalid');
  if (typeof result.changePercent === 'number' && Number.isFinite(result.changePercent) && result.changePercent <= DAILY_DROP_BLOCK_PCT) {
    blockers.push('daily_drop');
  }
  if (typeof result.adrPct === 'number' && Number.isFinite(result.adrPct) && result.adrPct >= ADR_OVERHEAT_BLOCK_PCT) {
    blockers.push('adr_overheat');
  }
  return blockers;
}

function executionBlockerNote(blockers: TierSBlocker[]) {
  if (blockers.length === 0) return '';
  const labels: Record<TierSBlocker, string> = {
    sepa_core: 'SEPA core',
    rs_rating: 'RS rating',
    valid_pivot: '유효 피벗',
    pivot_distance: '피벗 이격',
    vcp_strength: 'VCP 강도',
    ma50_extension: 'MA50 이격',
    volume_confirmation: '거래량 확인',
    risk_gate: '리스크 게이트',
    stop_invalid: '무효 손절선',
    daily_drop: '당일 급락',
    adr_overheat: 'ADR 과열',
  };
  return ` 실행 차단: ${blockers.map((blocker) => labels[blocker]).join(', ')}.`;
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
  // weightedMomentumScore(DB ibd_proxy_score)가 없을 때 benchmarkRelativeScore로 폴백.
  // scoreAtLeast(null, -9999)가 false를 반환해 DB 크론 미실행 시 모든 종목이 제외되는 버그 수정.
  const sortScore = (item: ScannerResult) =>
    item.weightedMomentumScore ?? item.benchmarkRelativeScore ?? -9999;
  const analyzable = results
    .filter((item) => item.status === 'done' &&
      typeof (item.weightedMomentumScore ?? item.benchmarkRelativeScore) === 'number')
    .sort((a, b) => sortScore(b) - sortScore(a));
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
      // benchmarkRelativeScore(BENCHMARK_PROXY)는 단일 벤치마크 비교라 pass/fail 기준에 부적절.
      // DB_BATCH 또는 UNIVERSE 소스일 때만 코어 항목으로 카운트한다.
      const isRsEvaluable = (rsSource === 'DB_BATCH' || rsSource === 'UNIVERSE') && rsRating !== null;
      if (rsCriterion) {
        rsCriterion.status = isRsEvaluable
          ? rsRating! >= 70 ? 'pass' : 'fail'
          : 'info';
        rsCriterion.actual = rsRating !== null
          ? rsSource === 'DB_BATCH'
            ? `${rsRating}점 (공식 RS)`
            : rsSource === 'UNIVERSE'
              ? `${ranked.rank}위 / ${rsRating}점 (실시간 유니버스 RS)`
              : `${rsRating}점 (참고 — 벤치마크 상대수익률)`
          : '데이터 없음';
        rsCriterion.threshold = '70점 이상 (유니버스 백분위)';
        rsCriterion.description = rsSource === 'DB_BATCH'
          ? '데이터베이스에서 조회한 공식 RS Rating입니다. Minervini Trend Template #8.'
          : rsSource === 'UNIVERSE'
            ? '현재 스캔 유니버스 내 실시간 랭크 기준 RS입니다. Minervini Trend Template #8.'
            : '벤치마크 대비 상대수익률 추정치 — 코어 판정에서 제외됩니다.';
        rsCriterion.isCore = isRsEvaluable;
      }

      const passed = sepaEvidence.criteria.filter(c => c.status === 'pass').length;
      const failed = sepaEvidence.criteria.filter(c => c.status === 'fail').length;
      const info = sepaEvidence.criteria.filter(c => c.status === 'info').length;
      const corePassed = sepaEvidence.criteria.filter(c => c.isCore && c.status === 'pass').length;
      const coreFailed = sepaEvidence.criteria.filter(c => c.isCore && c.status === 'fail').length;
      const coreTotal = sepaEvidence.criteria.filter(c => c.isCore).length;
      sepaEvidence.summary = { ...sepaEvidence.summary, passed, failed, info, corePassed, coreFailed, coreTotal };
      sepaEvidence.status = corePassed >= coreTotal ? 'pass' : (corePassed >= coreTotal - 1 ? 'warning' : 'fail');
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
      // sepaEvidence가 갱신될 때 top-level 상태도 함께 동기화한다.
      // 동기화 누락 시 evaluateScannerRecommendation이 stale top-level sepaStatus와
      // fresh evidence summary를 동시에 검사해 Recommended/IB Review 후보가 모두 탈락함.
      sepaStatus: sepaEvidence?.status ?? item.sepaStatus,
      sepaPassed: sepaEvidence?.summary.passed ?? item.sepaPassed,
      sepaFailed: sepaEvidence?.summary.failed ?? item.sepaFailed,
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

export function evaluateScannerRecommendation(
  result: Partial<ScannerResult>,
  regime?: MacroRegime,
): ScannerRecommendation {
  const { coreTotal, corePassed, coreFailed } = coreSummary(result);

  if (result.status === 'error') {
    return {
      recommendationTier: 'Error',
      recommendationReason: result.errorMessage || 'Data fetch or analysis did not complete.',
      sepaMissingCount: coreFailed ?? result.sepaFailed ?? null,
      exceptionSignals: [],
      tierSBlockers: [],
    };
  }

  const effectiveRegime = regime ?? regimeFromActionLevel(result.macroActionLevel);
  const { rsBonus, sepaSlack, pivotBonus } = regimeModifier(effectiveRegime);
  const tierSSepaTarget = Math.max(1, coreTotal - Math.max(0, sepaSlack));
  const tierASepaTarget = Math.max(1, coreTotal - 1 - Math.max(0, sepaSlack));


  // 글로벌 특성: VCP 피벗 대신 Pocket Pivot이나 RS 라인 돌파가 매우 강력한 기술적 진입 단서
  const hasAdaptivePivot = hasValidPivot(result) || (
    scoreAtLeast(result.pocketPivotScore, 60) ||
    result.rsLineNewHigh === true ||
    result.rsLineNearHigh === true ||
    (result.tennisBallCount || 0) >= 2 ||
    result.mansfieldRsFlag === true
  );

  const sepaMissingCount = coreFailed ?? result.sepaFailed ?? null;
  const sepaPassStrict = typeof corePassed === 'number' && coreTotal > 0 && corePassed === coreTotal;
  const sepaPassRegime = typeof corePassed === 'number' && coreTotal > 0 && corePassed >= tierSSepaTarget;
  const tierASepa = typeof corePassed === 'number' && coreTotal > 0 && corePassed >= tierASepaTarget;
  const reviewSepa = typeof corePassed === 'number' && corePassed >= coreTotal - 1;
  const watchSepa = typeof corePassed === 'number' && corePassed >= Math.max(0, coreTotal - 2);
  
  const strongVcp = result.vcpGrade === 'strong' || scoreAtLeast(result.vcpScore, 80);
  const constructiveVcp = strongVcp || result.vcpGrade === 'forming' || scoreAtLeast(result.vcpScore, 60);
  // 글로벌 VCP 및 기술 형성 완화
  const constructiveVcpFlex = constructiveVcp || (
    scoreAtLeast(result.vcpScore, 45) ||
    scoreAtLeast(result.pocketPivotScore, 50) ||
    scoreAtLeast(result.volumeDryUpScore, 50) ||
    (result.tennisBallCount || 0) >= 1
  );
  
  const tierAVcp = constructiveVcpFlex || scoreAtLeast(result.vcpScore, 40);
  const tierSVcpFlex = strongVcp || (result.vcpGrade === 'forming' && (scoreAtLeast(result.pocketPivotScore, 50) || scoreAtLeast(result.vcpScore, 50))) || constructiveVcpFlex;

  const validPivot = hasValidPivot(result);
  const effectiveValidPivot = hasAdaptivePivot;

  // 피벗 거리 완화: 피벗이 없는 종목은 현재 이평선 지지(50MA 근접) 상태이거나 완화된 피벗 범위
  const tightPivot = validPivot && actionablePivot(result.distanceToPivotPct, pivotBonus);
  const effectiveTightPivot = tightPivot || (hasAdaptivePivot && (
    result.distanceToPivotPct === null ||
    typeof result.distanceToPivotPct === 'undefined' ||
    actionablePivot(result.distanceToPivotPct, pivotBonus + 2) ||
    (typeof result.distanceFromMa50Pct === 'number' && result.distanceFromMa50Pct <= 10)
  ));

  const tightPivotStrict = validPivot && actionablePivot(result.distanceToPivotPct, 0);

  const tierAPivot = validPivot && actionTierPivot(result.distanceToPivotPct, pivotBonus);

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
  
  // RS 임계치 글로벌 완화 (Risk-On 하에 S: 82+, A: 78+ 대응)
  const rsTierS = scoreAtLeast(result.rsRating, 90 + rsBonus - 3) || scoreAtLeast(result.rsRating, 85 + rsBonus);
  const rsTierA = scoreAtLeast(result.rsRating, 85 + rsBonus - 3) || scoreAtLeast(result.rsRating, 80 + rsBonus);
  
  const rsLineHigh = result.rsLineNewHigh === true || result.rsLineNearHigh === true;
  const htfPassed = result.baseType === 'High_Tight_Flag' && result.highTightFlag?.passed === true;
  const tennisBall = (result.tennisBallCount || 0) >= 2;
  
  // 이평선 이격도 글로벌 완화 (S: 15% 이내, A: 18% 이내)
  const ma50Controlled = typeof result.distanceFromMa50Pct !== 'number' || result.distanceFromMa50Pct <= 18;
  const ma50Tight = typeof result.distanceFromMa50Pct !== 'number' || result.distanceFromMa50Pct <= 15;
  
  const leadershipSetupWithoutPivot = !effectiveValidPivot && rs85 && ma50Controlled && (rsLineHigh || accumulationSignal || tennisBall);
  const executionBlockers = executionRiskBlockers(result);
  const executionBlocked = executionBlockers.length > 0;
  const executionNote = executionBlockerNote(executionBlockers);

  // Tier S 게이트별 통과 여부를 계산해 차단 사유를 누적한다.
  const tierSBlockers: TierSBlocker[] = [];
  if (!sepaPassRegime) tierSBlockers.push('sepa_core');
  if (!rsTierS) tierSBlockers.push('rs_rating');
  if (!validPivot) tierSBlockers.push('valid_pivot');
  else if (!tightPivot) tierSBlockers.push('pivot_distance');
  if (!tierSVcpFlex) tierSBlockers.push('vcp_strength');
  if (!ma50Tight) tierSBlockers.push('ma50_extension');
  if (!(volumeWatch || breakoutVolume)) tierSBlockers.push('volume_confirmation');
  tierSBlockers.push(...executionBlockers);

  const exceptionSignals = [
    strongVcp ? 'Strong VCP' : null,
    effectiveValidPivot && result.baseType ? `Base ${result.baseType}` : (hasAdaptivePivot ? 'Fallback Pivot' : null),
    effectiveTightPivot ? 'Pivot within 3%' : (validPivot && nearActionablePivot ? 'Pivot within 5%' : null),
    pocketPivot ? 'Pocket pivot' : null,
    volumeDryUp ? 'Volume dry-up' : null,
    breakoutVolume ? 'Breakout volume watch' : null,
    rs90 ? 'RS 90+' : null,
    rsLineHigh ? 'RS Line high/near high' : null,
    tennisBall ? `Tennis Ball ${result.tennisBallCount}` : null,
  ].filter((item): item is string => Boolean(item));

  // Tier S — 실행 전 검토 우선 후보(Recommended).
  if (!executionBlocked && sepaPassRegime && validPivot && tierSVcpFlex && tightPivot && rsTierS && ma50Tight && (volumeWatch || breakoutVolume)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: `SEPA core ${corePassed}/${coreTotal}, RS ${result.rsRating} 리더십, 유효 피벗과 거래량 근거가 정렬된 우선 검토 후보입니다. (${effectiveRegime} 환경 임계 적용)`,
      sepaMissingCount,
      exceptionSignals,
      tierSBlockers: [],
    };
  }

  if (!executionBlocked && sepaPassStrict && validPivot && rs95 && tightPivotStrict && (tierAVcp || tennisBall)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'RS 95+ 최상위 리더가 유효 피벗과 기술적 근거를 바탕으로 강력한 리더십을 보이는 우선 검토 후보입니다.',
      sepaMissingCount,
      exceptionSignals,
      tierSBlockers: [],
    };
  }

  if (!executionBlocked && htfPassed && validPivot && rs90 && tightPivotStrict && (volumeStrong || rsLineHigh)) {
    return {
      recommendationTier: 'Recommended',
      recommendationReason: 'High Tight Flag 패턴과 강력한 RS/거래량 리더십이 확인된 우선 검토 후보입니다.',
      sepaMissingCount,
      exceptionSignals,
      tierSBlockers: [],
    };
  }

  // Tier A — 관찰 진입(Action).
  if (!executionBlocked && rsTierA && tierASepa && tierAVcp && accumulationSignal && tierAPivot && ma50Controlled) {
    return {
      recommendationTier: 'Action',
      recommendationReason: `RS ${result.rsRating} 리더가 SEPA core ${corePassed}/${coreTotal}, 기술적 매집 거래량, 완화된 기술적 타점 윈도 내에 있어 관찰 진입 후보입니다. (${effectiveRegime} 환경 임계 적용)`,
      sepaMissingCount,
      exceptionSignals,
      tierSBlockers,
    };
  }

  if (rs85 && reviewSepa && constructiveVcp && accumulationSignal && (reviewReadyPivot || leadershipSetupWithoutPivot)) {
    return {
      recommendationTier: 'IB Review',
      recommendationReason: reviewReadyPivot
        ? `RS 85+, SEPA core 6/7 이상, 유효 피벗, 건설적 VCP, 거래량 단서가 확인된 투자위원회 검토 후보입니다.${executionNote}`
        : `RS 90+ 주도주가 SEPA core 6/7 이상과 건설적 VCP/매집 단서를 보입니다. 유효 피벗은 아직 미확정으로 매수 타점이 아닌 IB 검토 후보입니다.${executionNote}`,
      sepaMissingCount,
      exceptionSignals,
      tierSBlockers,
    };
  }

    // Path B: 완화된 IB Review - 시장이 좁아 strict 게이트 통과자가 거의 없을 때 모멘텀 리더를 포착.
  // RS 82+ 리더가 SEPA core 5/7+, MA50 통제하, 건설적 단서를 보이면 검토 후보로 노출한다.
  // 엄격 Path A(6/7 + accumulation)는 이상적 상태, Path B는 정상 모멘텀 사이클 상태를 포착.
  const rs82 = scoreAtLeast(result.rsRating, 82);
  const pathBPivotOk = (validPivot && reviewPivot(result.distanceToPivotPct))
    || (!validPivot && rs82 && ma50Controlled && (rsLineHigh || accumulationSignal || tennisBall || strongVcp));
  const pathBSignals = constructiveVcp || rsLineHigh || tennisBall || pocketPivot || volumeDryUp || breakoutVolume;
  if (rs82 && watchSepa && pathBSignals && ma50Controlled && pathBPivotOk) {
    return {
      recommendationTier: 'IB Review',
      recommendationReason: validPivot && reviewPivot(result.distanceToPivotPct)
        ? `RS ${result.rsRating} 리더가 SEPA core ${corePassed}/${coreTotal}, 유효 피벗, MA50 통제 상태에서 기술적 단서를 보유합니다. 엄격 6/7 기준은 미달이나 검토 가치 있는 후보입니다.${executionNote}`
        : `RS ${result.rsRating} 리더가 SEPA core ${corePassed}/${coreTotal}, MA50 통제하 리더십 셋업을 보유합니다. 유효 피벗 미확정으로 매수 타점이 아닌 IB 검토 후보입니다.${executionNote}`,
      sepaMissingCount,
      exceptionSignals,
      tierSBlockers,
    };
  }

  if (rs80 && watchSepa && (constructiveVcp || tennisBall || rsLineHigh || pocketPivot || volumeDryUp)) {
    const watchGaps: string[] = [];
    if (!rs85) watchGaps.push('RS 85 미달');
    if (!reviewSepa) watchGaps.push(`SEPA core ${corePassed ?? '?'}/${coreTotal} (IB Review: ${coreTotal - 1} 이상 필요)`);
    if (!constructiveVcp) watchGaps.push('VCP forming 미달');
    if (!accumulationSignal) watchGaps.push('매집 시그널 없음');
    if (!reviewReadyPivot && !leadershipSetupWithoutPivot) watchGaps.push('피벗 미확정 또는 원거리');
    const gapNote = watchGaps.length > 0 ? ` IB Review까지 부족한 항목: [${watchGaps.join(' / ')}].` : '';
    return {
      recommendationTier: 'Watch',
      recommendationReason: validPivot
        ? `RS 80+와 일부 기술적 단서가 있으나 IB Review 조건에 아직 미달합니다.${gapNote}${executionNote}`
        : `RS 80+와 형성 단서는 있으나 유효 VCP/HTF 피벗이 확정되지 않아 형성 관찰 후보입니다.${gapNote}${executionNote}`,
      sepaMissingCount,
      exceptionSignals,
      tierSBlockers,
    };
  }

  const lpGaps: string[] = [];
  if (!rs80) lpGaps.push(`RS ${result.rsRating ?? '없음'} (Watch: 80 이상 필요)`);
  if (!watchSepa) lpGaps.push(`SEPA core ${corePassed ?? '?'}/${coreTotal} (Watch: ${Math.max(0, coreTotal - 2)} 이상 필요)`);
  if (!constructiveVcp && !tennisBall && !rsLineHigh && !pocketPivot && !volumeDryUp) lpGaps.push('기술적 단서 없음 (VCP/테니스볼/RS라인/PP/볼륨)');
  return {
    recommendationTier: 'Low Priority',
    recommendationReason: `SEPA/VCP/RS/거래량 증거가 스크리너 우선순위에 들기 부족합니다. [${lpGaps.join(' / ')}]${executionNote}`,
    sepaMissingCount,
    exceptionSignals,
    tierSBlockers,
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

export function applyScannerReviewPoolRankings(
  results: ScannerResult[],
  maxReviewPool = 15,
  minReviewPool = 5,
): ScannerResult[] {
  const reviewed = results.map((item) => ({
    ...item,
    ...evaluateScannerRecommendation(item),
  }));

  // 1. IB Review 통과자를 composite score로 정렬해 maxReviewPool로 cap.
  //    Recommended/Action 등급은 별도 분류이므로 IB Review 풀 cap에 영향을 주지 않는다.
  const strictKeep = new Set(
    reviewed
      .filter((item) => item.recommendationTier === 'IB Review')
      .sort((a, b) => scannerReviewScore(b) - scannerReviewScore(a) || (b.rsRating || 0) - (a.rsRating || 0))
      .slice(0, maxReviewPool)
      .map((item) => item.ticker),
  );

  // 2. Strict 통과자가 minReviewPool 미만이면, composite score 상위 종목을 자동 승급해
  //    최소 검토 풀(기본 10개)을 보장. 모멘텀 시장 사이클상 strict 7/7 게이트가 닫히는
  //    구간에서도 발굴이 멈추지 않도록 한다. 단 추세가 살아있는 종목으로 한정:
  //      - status === 'done' (분석 완료)
  //      - RS rating >= 60 (벤치마크 대비 약하지 않음)
  //      - SEPA core >= max(0, coreTotal - 3) (최소 4/7, 우상향 단서 일부 존재)
  //      - VCP pivot 또는 RS 라인 신고가 또는 매집 단서 중 하나 이상
  const promoted = new Set<string>();
  if (strictKeep.size < minReviewPool) {
    const needed = minReviewPool - strictKeep.size;
    const promotionCandidates = reviewed
      .filter((item) => item.status === 'done' && !strictKeep.has(item.ticker))
      .filter((item) => {
        const summary = item.sepaEvidence?.summary;
        const corePassed = summary?.corePassed ?? null;
        const coreTotal = summary?.coreTotal ?? 7;
        const rs = item.rsRating ?? 0;
        const minSepa = Math.max(0, coreTotal - 3);
        const sepaOk = corePassed === null || corePassed >= minSepa;
        const technicalAnchor =
          hasValidPivot(item)
          || item.rsLineNewHigh === true
          || item.rsLineNearHigh === true
          || (item.tennisBallCount ?? 0) >= 2
          || scoreAtLeast(item.pocketPivotScore, 40)
          || scoreAtLeast(item.volumeDryUpScore, 40)
          || scoreAtLeast(item.vcpScore, 50)
          || item.vcpGrade === 'forming'
          || item.vcpGrade === 'strong';
        return rs >= 60 && sepaOk && technicalAnchor;
      })
      .sort((a, b) => scannerReviewScore(b) - scannerReviewScore(a) || (b.rsRating || 0) - (a.rsRating || 0));

    for (const item of promotionCandidates.slice(0, needed)) {
      promoted.add(item.ticker);
    }
  }

  return reviewed.map((item) => {
    if (item.recommendationTier === 'IB Review' && !strictKeep.has(item.ticker)) {
      return {
        ...item,
        recommendationTier: 'Watch',
        recommendationReason: `IB Review 최소 조건은 충족했지만, 동일 로직 composite score 상위 ${maxReviewPool}개 밖이라 Watch로 유지합니다.`,
      };
    }
    if (promoted.has(item.ticker)) {
      const summary = item.sepaEvidence?.summary;
      const corePassed = summary?.corePassed ?? '?';
      const coreTotal = summary?.coreTotal ?? 7;
      const baseReason = item.recommendationReason ? ` 원래 등급 사유: ${item.recommendationReason}` : '';
      return {
        ...item,
        recommendationTier: 'IB Review',
        recommendationReason: `엄격 IB Review 기준은 미충족이나, 동일 로직 composite score 상위에 들어 최소 ${minReviewPool}개 검토 풀 보장 차원에서 자동 승급된 보충 후보입니다. (RS ${item.rsRating ?? '?'} · SEPA core ${corePassed}/${coreTotal}) 즉시 실행보다 추가 검증을 권장합니다.${baseReason}`,
      };
    }
    return item;
  });
}

export function isContestPoolTier(tier: RecommendationTier | null | undefined) {
  return tier === 'Recommended' || tier === 'Action' || tier === 'IB Review';
}

export function isAutoSelectedTier(tier: RecommendationTier | null | undefined) {
  return tier === 'Recommended' || tier === 'Action' || tier === 'IB Review';
}

export function recommendationSortValue(tier: RecommendationTier | null | undefined) {
  if (tier === 'Recommended') return 0;
  if (tier === 'Action') return 1;
  if (tier === 'IB Review') return 2;
  if (tier === 'Watch' || tier === 'Partial') return 3;
  if (tier === 'Low Priority') return 4;
  return 5;
}
