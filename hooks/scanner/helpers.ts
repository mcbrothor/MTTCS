import { evaluateScannerRecommendation } from '@/lib/scanner-recommendation';
import type {
  MarketAnalysisResponse,
  ProviderAttempt,
  ScannerConstituent,
  ScannerResult,
  ScannerUniverse,
} from '@/types';

export function scannerStorageKey(universe: ScannerUniverse, prefix: string) {
  return `${prefix}${universe}`;
}

export function parseScannerUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI200' || value === 'KOSDAQ150') return value;
  // Backward compatibility: migrate old universe values from Phase 2.5
  if (value === 'KOSPI100') return 'KOSPI200';
  if (value === 'KOSDAQ100') return 'KOSDAQ150';
  return null;
}

export function withRecommendation(result: ScannerResult): ScannerResult {
  return {
    ...result,
    ...evaluateScannerRecommendation(result),
  };
}

export function readStoredUniverse(key: string) {
  return parseScannerUniverse(window.localStorage.getItem(key));
}

export function uniqueUniverses(items: (ScannerUniverse | null)[]) {
  return items.filter((item, index): item is ScannerUniverse => Boolean(item) && items.indexOf(item) === index);
}

export function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function rsPercentile(rank: number | null | undefined, universeSize: number | null | undefined) {
  if (!rank || !universeSize) return null;
  if (universeSize <= 1) return 50;
  return Math.round((1 - ((rank - 1) / (universeSize - 1))) * 100);
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

export async function parseFetchError(response: Response) {
  try {
    const body = await response.json() as { message?: string; error?: string; details?: { providerAttempts?: ProviderAttempt[] } };
    return {
      message: body.message || body.error || `요청 실패 (${response.status})`,
      providerAttempts: body.details?.providerAttempts || [],
    };
  } catch {
    return { message: `요청 실패 (${response.status})`, providerAttempts: [] };
  }
}

export function initialResult(item: ScannerConstituent): ScannerResult {
  return {
    ...item,
    status: 'queued',
    recommendationTier: 'Low Priority',
    recommendationReason: '스캔 대기 중입니다.',
    sepaMissingCount: null,
    exceptionSignals: [],
    providerAttempts: [],
    sepaStatus: null,
    sepaPassed: null,
    sepaFailed: null,
    sepaCriteria: null,
    sepaEvidence: null,
    vcpScore: null,
    vcpGrade: null,
    contractionScore: null,
    volumeDryUpScore: null,
    bbSqueezeScore: null,
    pocketPivotScore: null,
    vcpDetails: null,
    fundamentals: null,
    pivotPrice: null,
    recommendedEntry: null,
    distanceToPivotPct: null,
    breakoutVolumeStatus: null,
    baseType: null,
    momentumBranch: null,
    eightWeekReturnPct: null,
    distanceFromMa50Pct: null,
    low52WeekAdvancePct: null,
    highTightFlag: null,
    rsRating: null,
    internalRsRating: null,
    externalRsRating: null,
    rsRank: null,
    rsUniverseSize: null,
    rsPercentile: null,
    weightedMomentumScore: null,
    benchmarkRelativeScore: null,
    rsLineNewHigh: null,
    rsLineNearHigh: null,
    tennisBallCount: null,
    tennisBallScore: null,
    return3m: null,
    return6m: null,
    return9m: null,
    return12m: null,
    analyzedAt: null,
    errorMessage: null,
    dataWarnings: [],
  };
}

export function mapMarketAnalysisToScannerResult(item: ScannerConstituent, analysis: MarketAnalysisResponse): ScannerResult {
  const latestBar = analysis.priceData.at(-1);
  const latestClose = latestBar?.close ?? null;
  const currentPrice = item.currentPrice ?? latestClose;
  const priceAsOf = item.currentPrice !== null ? item.priceAsOf : latestBar?.date ?? item.priceAsOf;
  const recommendedEntry = analysis.vcpAnalysis.recommendedEntry || null;
  const pivotPrice = analysis.vcpAnalysis.pivotPrice ?? recommendedEntry;
  const distanceToPivotPct =
    currentPrice && recommendedEntry
      ? round(((currentPrice - recommendedEntry) / recommendedEntry) * 100)
      : null;

  return withRecommendation({
    ...item,
    recommendationTier: 'Low Priority',
    recommendationReason: '',
    dataWarnings: analysis.warnings || [],
    sepaMissingCount: null,
    exceptionSignals: [],
    currentPrice,
    priceAsOf,
    priceSource: analysis.providerUsed || item.priceSource,
    status: 'done',
    providerAttempts: analysis.providerAttempts || [],
    sepaStatus: analysis.sepaEvidence.status,
    sepaPassed: analysis.sepaEvidence.summary.passed,
    sepaFailed: analysis.sepaEvidence.summary.failed,
    sepaCriteria: analysis.sepaEvidence.criteria,
    sepaEvidence: analysis.sepaEvidence,
    vcpScore: analysis.vcpAnalysis.score,
    vcpGrade: analysis.vcpAnalysis.grade,
    contractionScore: analysis.vcpAnalysis.contractionScore,
    volumeDryUpScore: analysis.vcpAnalysis.volumeDryUpScore,
    bbSqueezeScore: analysis.vcpAnalysis.bbSqueezeScore,
    pocketPivotScore: analysis.vcpAnalysis.pocketPivotScore,
    vcpDetails: analysis.vcpAnalysis.details,
    fundamentals: analysis.fundamentals,
    pivotPrice,
    distanceToPivotPct,
    recommendedEntry,
    baseType: analysis.vcpAnalysis.baseType,
    momentumBranch: analysis.vcpAnalysis.momentumBranch,
    eightWeekReturnPct: analysis.vcpAnalysis.eightWeekReturnPct,
    distanceFromMa50Pct: analysis.vcpAnalysis.distanceFromMa50Pct,
    low52WeekAdvancePct: analysis.vcpAnalysis.low52WeekAdvancePct,
    highTightFlag: analysis.vcpAnalysis.highTightFlag,
    rsRating: analysis.sepaEvidence.metrics.rsRating,
    internalRsRating: analysis.sepaEvidence.metrics.internalRsRating ?? null,
    externalRsRating: analysis.sepaEvidence.metrics.externalRsRating ?? null,
    rsRank: analysis.sepaEvidence.metrics.rsRank ?? null,
    rsUniverseSize: analysis.sepaEvidence.metrics.rsUniverseSize ?? null,
    rsPercentile: analysis.sepaEvidence.metrics.rsPercentile ?? null,
    weightedMomentumScore: analysis.sepaEvidence.metrics.weightedMomentumScore ?? null,
    benchmarkRelativeScore: analysis.sepaEvidence.metrics.benchmarkRelativeScore ?? null,
    rsLineNewHigh: analysis.sepaEvidence.metrics.rsLineNewHigh ?? null,
    rsLineNearHigh: analysis.sepaEvidence.metrics.rsLineNearHigh ?? null,
    tennisBallCount: analysis.sepaEvidence.metrics.tennisBallCount ?? null,
    tennisBallScore: analysis.sepaEvidence.metrics.tennisBallScore ?? null,
    return3m: analysis.sepaEvidence.metrics.return3m ?? null,
    return6m: analysis.sepaEvidence.metrics.return6m ?? null,
    return9m: analysis.sepaEvidence.metrics.return9m ?? null,
    return12m: analysis.sepaEvidence.metrics.return12m ?? null,
    analyzedAt: new Date().toISOString(),
    breakoutVolumeStatus: analysis.vcpAnalysis.breakoutVolumeStatus,
    errorMessage: null,
  });
}
