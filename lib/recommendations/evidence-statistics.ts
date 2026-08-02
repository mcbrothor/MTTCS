import { RECOMMENDATION_EVIDENCE_STATISTICS_VERSION } from './evidence-performance';

export type RecommendationEvidenceHorizon = 'D5' | 'D20' | 'D60';
export type RecommendationEvidenceDataTier = 'OFFICIAL' | 'FALLBACK';

export interface RecommendationEvidenceObservation {
  runDate: string;
  horizon: RecommendationEvidenceHorizon;
  dataTier: RecommendationEvidenceDataTier;
  netReturnPct: number | null;
  netExcessReturnPct: number | null;
  maePct: number | null;
  marketRegime: string | null;
  evidenceStatus: 'READY' | 'INCOMPLETE';
  evidenceManifestId: string | null;
}

export interface RecommendationEvidencePolicy {
  minimumSampleSize: number;
  minimumCohortCount: number;
  minimumMarketRegimeCount: number;
}

export const DEFAULT_RECOMMENDATION_EVIDENCE_POLICY: RecommendationEvidencePolicy = {
  minimumSampleSize: 100,
  minimumCohortCount: 20,
  minimumMarketRegimeCount: 2,
};

export const DEFAULT_RECOMMENDATION_EVIDENCE_BOOTSTRAP = {
  iterations: 4_000,
  seed: 20_260_802,
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rounded(value: number | null) {
  return value === null ? null : Number(value.toFixed(6));
}

function quantile(sorted: number[], probability: number) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function recommendationDayBlockBootstrap95<T extends { runDate: string }>(input: {
  observations: T[];
  valueKey: keyof T;
  iterations?: number;
  seed?: number;
}) {
  const cohorts = new Map<string, number[]>();
  for (const observation of input.observations) {
    const value = observation[input.valueKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    cohorts.set(observation.runDate, [...(cohorts.get(observation.runDate) || []), value]);
  }
  const cohortMeans = [...cohorts.values()]
    .map((values) => average(values))
    .filter((value): value is number => value !== null);
  const sampleSize = [...cohorts.values()].reduce((sum, values) => sum + values.length, 0);
  if (cohortMeans.length === 0) {
    return {
      confidenceLevel: 0.95 as const,
      sampleSize,
      cohortCount: 0,
      mean: null,
      lower: null,
      upper: null,
    };
  }

  const iterations = Math.max(1, Math.floor(input.iterations ?? DEFAULT_RECOMMENDATION_EVIDENCE_BOOTSTRAP.iterations));
  const random = seededRandom(input.seed ?? DEFAULT_RECOMMENDATION_EVIDENCE_BOOTSTRAP.seed);
  const distribution: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0;
    for (let index = 0; index < cohortMeans.length; index += 1) {
      sum += cohortMeans[Math.floor(random() * cohortMeans.length)];
    }
    distribution.push(sum / cohortMeans.length);
  }
  distribution.sort((left, right) => left - right);
  return {
    confidenceLevel: 0.95 as const,
    sampleSize,
    cohortCount: cohortMeans.length,
    mean: rounded(average(cohortMeans)),
    lower: rounded(quantile(distribution, 0.025)),
    upper: rounded(quantile(distribution, 0.975)),
  };
}

function summarize(
  observations: RecommendationEvidenceObservation[],
  bootstrap: { iterations?: number; seed?: number },
) {
  const netReturn = recommendationDayBlockBootstrap95({
    observations,
    valueKey: 'netReturnPct',
    ...bootstrap,
  });
  const netExcess = recommendationDayBlockBootstrap95({
    observations,
    valueKey: 'netExcessReturnPct',
    ...bootstrap,
  });
  const maeValues = observations
    .map((observation) => observation.maePct)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const netReturns = observations
    .map((observation) => observation.netReturnPct)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right);
  const tailCount = netReturns.length === 0 ? 0 : Math.max(1, Math.ceil(netReturns.length * 0.1));
  const regimes = new Set(observations
    .map((observation) => observation.marketRegime)
    .filter((value): value is string => Boolean(value)));
  const incompleteEvidenceCount = observations.filter((observation) => (
    observation.evidenceStatus !== 'READY' || !observation.evidenceManifestId
  )).length;
  const missingMarketRegimeCount = observations.filter((observation) => !observation.marketRegime).length;
  const missingPerformanceMetricCount = observations.filter((observation) => (
    typeof observation.netReturnPct !== 'number' || !Number.isFinite(observation.netReturnPct)
    || typeof observation.netExcessReturnPct !== 'number' || !Number.isFinite(observation.netExcessReturnPct)
    || typeof observation.maePct !== 'number' || !Number.isFinite(observation.maePct)
  )).length;
  return {
    sampleSize: netExcess.sampleSize,
    cohortCount: netExcess.cohortCount,
    meanNetReturnPct: netReturn.mean,
    meanNetExcessReturnPct: netExcess.mean,
    excessReturnConfidenceInterval95: {
      confidenceLevel: netExcess.confidenceLevel,
      lower: netExcess.lower,
      upper: netExcess.upper,
    },
    averageMaePct: rounded(average(maeValues)),
    lowerDecileNetReturnPct: rounded(average(netReturns.slice(0, tailCount))),
    marketRegimeCount: regimes.size,
    marketRegimes: [...regimes].sort(),
    incompleteEvidenceCount,
    missingMarketRegimeCount,
    missingPerformanceMetricCount,
  };
}

function promotionGate(
  official: ReturnType<typeof summarize>,
  policy: RecommendationEvidencePolicy,
) {
  const reasons: string[] = [];
  if (official.sampleSize < policy.minimumSampleSize) reasons.push('INSUFFICIENT_SAMPLE_SIZE');
  if (official.cohortCount < policy.minimumCohortCount) reasons.push('INSUFFICIENT_COHORT_COUNT');
  if (official.marketRegimeCount < policy.minimumMarketRegimeCount) reasons.push('INSUFFICIENT_MARKET_REGIMES');
  if (official.incompleteEvidenceCount > 0) reasons.push('INCOMPLETE_EVIDENCE');
  if (official.missingMarketRegimeCount > 0) reasons.push('MISSING_MARKET_REGIME');
  if (official.missingPerformanceMetricCount > 0) reasons.push('MISSING_PERFORMANCE_METRICS');
  if (official.excessReturnConfidenceInterval95.lower === null
    || official.excessReturnConfidenceInterval95.lower <= 0) {
    reasons.push('NON_POSITIVE_EXCESS_CI_LOWER_BOUND');
  }
  return {
    status: reasons.length === 0 ? 'PASS' as const : 'BLOCKED' as const,
    passed: reasons.length === 0,
    reasons,
    dataScope: 'OFFICIAL_ONLY' as const,
    costScope: 'STANDARDIZED_MODEL_NOT_ACCOUNT_ACTUAL' as const,
  };
}

export function evaluateRecommendationEvidence(input: {
  observations: RecommendationEvidenceObservation[];
  bootstrap?: { iterations?: number; seed?: number };
  policy?: Partial<RecommendationEvidencePolicy>;
}) {
  const policy = { ...DEFAULT_RECOMMENDATION_EVIDENCE_POLICY, ...input.policy };
  const bootstrap = { ...DEFAULT_RECOMMENDATION_EVIDENCE_BOOTSTRAP, ...input.bootstrap };
  const horizons = {} as Record<RecommendationEvidenceHorizon, {
    official: ReturnType<typeof summarize>;
    fallback: ReturnType<typeof summarize>;
    promotion: ReturnType<typeof promotionGate>;
  }>;
  for (const horizon of ['D5', 'D20', 'D60'] as const) {
    const horizonRows = input.observations.filter((observation) => observation.horizon === horizon);
    const official = summarize(horizonRows.filter((observation) => observation.dataTier === 'OFFICIAL'), bootstrap);
    const fallback = summarize(horizonRows.filter((observation) => observation.dataTier === 'FALLBACK'), bootstrap);
    horizons[horizon] = {
      official,
      fallback,
      promotion: promotionGate(official, policy),
    };
  }
  const passedHorizons = (['D5', 'D20', 'D60'] as const)
    .filter((horizon) => horizons[horizon].promotion.passed);
  return {
    statisticsVersion: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
    policy,
    bootstrap: { ...bootstrap, confidenceLevel: 0.95 as const, unit: 'RECOMMENDATION_DAY_COHORT' as const },
    horizons,
    promotion: {
      status: passedHorizons.length === 3 ? 'PASS' as const : 'BLOCKED' as const,
      allHorizonsPass: passedHorizons.length === 3,
      requiredHorizons: ['D5', 'D20', 'D60'] as const,
      passedHorizons,
      accountEvidenceStatus: 'NOT_AVAILABLE' as const,
      scope: 'MODEL_VALIDATION_ONLY' as const,
    },
  };
}
