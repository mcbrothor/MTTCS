import { KR_RISK_ENGINE_VERSION, KR_RISK_FLOW_ENGINE_VERSION, RECOMMENDATION_ENGINE_VERSION } from './config';

export const DEFAULT_POLICY_PROMOTION_MIN_COHORTS = 20;
export const LONG_TERM_POLICY_PROMOTION_HORIZONS = ['D20', 'D60'] as const;
export const LONG_TERM_POLICY_PROMOTION_CATEGORIES = ['KOSPI200', 'KOSDAQ150'] as const;

const POLICY_PROMOTION_RANK = new Map([
  [RECOMMENDATION_ENGINE_VERSION, 0],
  [KR_RISK_ENGINE_VERSION, 1],
  [KR_RISK_FLOW_ENGINE_VERSION, 2],
]);

export type LongTermPolicyPromotionHorizon = (typeof LONG_TERM_POLICY_PROMOTION_HORIZONS)[number];
export type LongTermPolicyPromotionCategory = (typeof LONG_TERM_POLICY_PROMOTION_CATEGORIES)[number];

export interface PolicyCohortMetric {
  runDate: string;
  engineVersion: string;
  averageExcessReturnPct: number;
  averageMaePct: number;
  lowerDecileReturnPct: number;
  flowCoveragePct: number | null;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function pairedBootstrap(input: {
  baseline: PolicyCohortMetric[];
  challenger: PolicyCohortMetric[];
  iterations?: number;
  seed?: number;
}) {
  const baseline = new Map(input.baseline.map((row) => [row.runDate, row]));
  const pairs = input.challenger
    .filter((row) => baseline.has(row.runDate))
    .map((row) => ({ baseline: baseline.get(row.runDate) as PolicyCohortMetric, challenger: row }))
    .sort((a, b) => a.challenger.runDate.localeCompare(b.challenger.runDate));
  if (pairs.length === 0) return { sampleSize: 0, meanDelta: null, low90: null, high90: null };
  const deltas = pairs.map((pair) => pair.challenger.averageExcessReturnPct - pair.baseline.averageExcessReturnPct);
  const random = seededRandom(input.seed ?? 21_062_022);
  const samples: number[] = [];
  for (let iteration = 0; iteration < (input.iterations ?? 10_000); iteration += 1) {
    let total = 0;
    for (let index = 0; index < pairs.length; index += 1) total += deltas[Math.floor(random() * deltas.length)];
    samples.push(total / pairs.length);
  }
  samples.sort((a, b) => a - b);
  const percentile = (value: number) => samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * value))];
  return {
    sampleSize: pairs.length,
    meanDelta: mean(deltas),
    low90: percentile(0.05),
    high90: percentile(0.95),
  };
}

function pairedRows(baseline: PolicyCohortMetric[], challenger: PolicyCohortMetric[]) {
  const baselineByDate = new Map(baseline.map((row) => [row.runDate, row]));
  return challenger.filter((row) => baselineByDate.has(row.runDate)).map((row) => ({
    baseline: baselineByDate.get(row.runDate) as PolicyCohortMetric,
    challenger: row,
  }));
}

export function evaluateKrPolicyPromotion(
  rows: PolicyCohortMetric[],
  options: { minCohorts?: number } = {},
) {
  const minCohorts = Math.max(1, Math.floor(options.minCohorts ?? DEFAULT_POLICY_PROMOTION_MIN_COHORTS));
  const byPolicy = (engineVersion: string) => rows.filter((row) => row.engineVersion === engineVersion);
  const official = byPolicy(RECOMMENDATION_ENGINE_VERSION);
  const risk = byPolicy(KR_RISK_ENGINE_VERSION);
  const flow = byPolicy(KR_RISK_FLOW_ENGINE_VERSION);
  const officialDates = new Set(official.map((row) => row.runDate));
  const riskDates = new Set(risk.map((row) => row.runDate));
  const cohortCount = new Set(flow.map((row) => row.runDate)
    .filter((runDate) => officialDates.has(runDate) && riskDates.has(runDate))).size;
  const riskComparison = pairedBootstrap({ baseline: official, challenger: risk });
  const flowComparison = pairedBootstrap({ baseline: risk, challenger: flow });
  const flowPairs = pairedRows(risk, flow);
  const coverage = flowPairs.length
    ? mean(flowPairs.map((pair) => pair.challenger.flowCoveragePct || 0))
    : 0;
  const maeNotWorse = flowPairs.length > 0 && mean(flowPairs.map((pair) => pair.challenger.averageMaePct))
    >= mean(flowPairs.map((pair) => pair.baseline.averageMaePct));
  const tailNotWorse = flowPairs.length > 0 && mean(flowPairs.map((pair) => pair.challenger.lowerDecileReturnPct))
    >= mean(flowPairs.map((pair) => pair.baseline.lowerDecileReturnPct));
  const enough = cohortCount >= minCohorts;
  const riskPassed = enough && (riskComparison.meanDelta || 0) >= 0.5 && (riskComparison.low90 || 0) > 0;
  const flowPassed = riskPassed
    && (flowComparison.low90 || 0) > 0
    && maeNotWorse
    && tailNotWorse
    && coverage >= 90;
  return {
    cohortCount,
    decision: flowPassed ? 'PROMOTE_FLOW' : riskPassed ? 'PROMOTE_RISK' : cohortCount < minCohorts * 2 ? 'CONTINUE' : 'KEEP_OFFICIAL',
    riskPassed,
    flowPassed,
    coveragePct: coverage,
    maeNotWorse,
    tailNotWorse,
    riskComparison,
    flowComparison,
  } as const;
}

export function evaluateKrLongTermPolicyPromotion(input: {
  activeEngineVersion: string;
  categories: Array<{
    category: LongTermPolicyPromotionCategory;
    cohorts: Record<LongTermPolicyPromotionHorizon, PolicyCohortMetric[]>;
  }>;
  minCohorts?: number;
}) {
  const minCohorts = Math.max(1, Math.floor(input.minCohorts ?? DEFAULT_POLICY_PROMOTION_MIN_COHORTS));
  const categoryMap = new Map(input.categories.map((row) => [row.category, row]));
  const evaluations = LONG_TERM_POLICY_PROMOTION_CATEGORIES.flatMap((category) => {
    const cohorts = categoryMap.get(category)?.cohorts;
    return LONG_TERM_POLICY_PROMOTION_HORIZONS.map((horizon) => ({
      category,
      horizon,
      result: evaluateKrPolicyPromotion(cohorts?.[horizon] || [], { minCohorts }),
    }));
  });
  const allMature = evaluations.every((row) => row.result.cohortCount >= minCohorts);
  const riskReady = allMature && evaluations.every((row) => row.result.riskPassed);
  const flowReady = riskReady && evaluations.every((row) => row.result.flowPassed);
  const recommendedEngineVersion = flowReady
    ? KR_RISK_FLOW_ENGINE_VERSION
    : riskReady
      ? KR_RISK_ENGINE_VERSION
      : null;
  const activeRank = POLICY_PROMOTION_RANK.get(input.activeEngineVersion);
  const recommendedRank = recommendedEngineVersion
    ? POLICY_PROMOTION_RANK.get(recommendedEngineVersion)
    : undefined;
  const ready = activeRank !== undefined
    && recommendedRank !== undefined
    && recommendedRank > activeRank;

  return {
    ready,
    allMature,
    riskReady,
    flowReady,
    minCohorts,
    activeEngineVersion: input.activeEngineVersion,
    recommendedEngineVersion,
    reason: !recommendedEngineVersion
      ? allMature ? 'LONG_TERM_CRITERIA_NOT_MET' : 'INSUFFICIENT_LONG_TERM_COHORTS'
      : activeRank === undefined
        ? 'UNKNOWN_ACTIVE_POLICY'
      : recommendedEngineVersion === input.activeEngineVersion
        ? 'ALREADY_ACTIVE'
        : recommendedRank !== undefined && activeRank !== undefined && recommendedRank < activeRank
          ? 'NO_FORWARD_PROMOTION'
        : recommendedEngineVersion === KR_RISK_FLOW_ENGINE_VERSION
          ? 'PROMOTE_FLOW'
          : 'PROMOTE_RISK',
    evaluations,
  } as const;
}

export function evaluateKrPolicyRollback(input: {
  active: PolicyCohortMetric[];
  comparison: PolicyCohortMetric[];
}) {
  const pairs = pairedRows(input.comparison, input.active).sort((a, b) => b.challenger.runDate.localeCompare(a.challenger.runDate)).slice(0, 10);
  if (pairs.length < 10) return { rollback: false, reason: 'INSUFFICIENT_COHORTS' } as const;
  const alphaDelta = mean(pairs.map((pair) => pair.challenger.averageExcessReturnPct - pair.baseline.averageExcessReturnPct));
  const tailDelta = mean(pairs.map((pair) => pair.challenger.lowerDecileReturnPct - pair.baseline.lowerDecileReturnPct));
  return {
    rollback: alphaDelta <= -1 || tailDelta <= -2,
    reason: alphaDelta <= -1 ? 'ALPHA_UNDERPERFORMANCE' : tailDelta <= -2 ? 'TAIL_LOSS_DETERIORATION' : 'HOLD',
    alphaDelta,
    tailDelta,
  } as const;
}
