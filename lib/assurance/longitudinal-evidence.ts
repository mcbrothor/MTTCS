import {
  RECOMMENDATION_COST_MODEL_VERSION,
  RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
  stableEvidenceHash,
} from '@/lib/recommendations/evidence-performance';
import {
  DEFAULT_RECOMMENDATION_EVIDENCE_BOOTSTRAP,
  recommendationDayBlockBootstrap95,
} from '@/lib/recommendations/evidence-statistics';
import type {
  RecommendationCategory,
  RecommendationMarket,
} from '@/lib/recommendations/types';

export const LONGITUDINAL_ASSURANCE_POLICY_VERSION = 'mtn-longitudinal-assurance-2026.08-v1';

export interface LongitudinalPerformanceRow {
  status: string | null;
  cost_model_version: string | null;
  horizon: string;
  net_return_pct: number | string | null;
  net_excess_return_pct: number | string | null;
  mae_pct: number | string | null;
  data_evidence_tier: string | null;
  evidence_status: string | null;
  evidence_manifest_id: string | null;
  market_regime: string | null;
  recommendation_picks: {
    id: string;
    recommendation_publications: {
      run_date: string;
      market: RecommendationMarket;
      category: RecommendationCategory | null;
      engine_version: string;
      assurance_contract_hash: string | null;
      is_official: boolean;
      status: string;
    };
  };
}

const POLICY = {
  12: {
    minimumCoveredMonths: 10,
    minimumSampleSize: 100,
    minimumCohorts: { D5: 60, D20: 40, D60: 20 },
    minimumRegimeCohorts: 10,
  },
  24: {
    minimumCoveredMonths: 20,
    minimumSampleSize: 200,
    minimumCohorts: { D5: 120, D20: 80, D60: 40 },
    minimumRegimeCohorts: 20,
  },
} as const;

const TAIL_LOSS_THRESHOLD_PCT = {
  D5: -10,
  D20: -15,
  D60: -20,
} as const;

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function subtractMonths(date: string, months: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() - months);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function rounded(value: number | null) {
  return value === null ? null : Number(value.toFixed(6));
}

function cohortMeans(rows: Array<{ runDate: string; value: number | null }>) {
  const byDate = new Map<string, number[]>();
  for (const row of rows) {
    if (row.value === null) continue;
    byDate.set(row.runDate, [...(byDate.get(row.runDate) || []), row.value]);
  }
  return [...byDate.values()].map((values) => average(values)).filter((value): value is number => value !== null);
}

function lowerDecileMean(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const count = Math.max(1, Math.ceil(sorted.length * 0.1));
  return rounded(average(sorted.slice(0, count)));
}

function stableSeed(input: string) {
  const hash = stableEvidenceHash(input).slice(0, 8);
  return Number.parseInt(hash, 16) >>> 0;
}

export function buildLongitudinalEvidenceEvaluationRows(
  rows: LongitudinalPerformanceRow[],
  market: RecommendationMarket,
) {
  const grouped = new Map<string, LongitudinalPerformanceRow[]>();
  for (const row of rows) {
    const publication = row.recommendation_picks?.recommendation_publications;
    if (!publication
      || publication.market !== market
      || publication.is_official !== true
      || publication.status !== 'PUBLISHED'
      || !publication.category
      || !publication.assurance_contract_hash
      || !/^[a-f0-9]{64}$/.test(publication.assurance_contract_hash)) continue;
    const key = JSON.stringify([publication.category, publication.assurance_contract_hash]);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  const evaluations: Record<string, unknown>[] = [];
  for (const [groupKey, group] of grouped.entries()) {
    const [category, assuranceContractHash] = JSON.parse(groupKey) as [RecommendationCategory, string];
    const engineVersions = new Set(group.map((row) => (
      row.recommendation_picks.recommendation_publications.engine_version
    )));
    if (engineVersions.size !== 1) continue;
    const engineVersion = [...engineVersions][0];
    for (const windowMonths of [12, 24] as const) {
      const policy = POLICY[windowMonths];
      for (const horizon of ['D5', 'D20', 'D60'] as const) {
        const horizonRows = group.filter((row) => row.horizon === horizon);
        const latestRunDate = horizonRows
          .filter((row) => row.status === 'MATURED')
          .map((row) => row.recommendation_picks.recommendation_publications.run_date)
          .sort()
          .at(-1)
          || group.map((row) => row.recommendation_picks.recommendation_publications.run_date)
            .sort()
            .at(-1);
        if (!latestRunDate) continue;
        const windowStart = subtractMonths(latestRunDate, windowMonths);
        const populationWindow = group.filter((row) => {
          const publication = row.recommendation_picks.recommendation_publications;
          return publication.run_date >= windowStart
            && publication.run_date <= latestRunDate;
        });
        const inWindow = populationWindow.filter((row) => row.horizon === horizon);
        const official = inWindow.filter((row) => row.status === 'MATURED'
          && row.cost_model_version === RECOMMENDATION_COST_MODEL_VERSION
          && row.data_evidence_tier === 'OFFICIAL');
        const observations = official.map((row) => ({
          runDate: row.recommendation_picks.recommendation_publications.run_date,
          netReturnPct: numberOrNull(row.net_return_pct),
          netExcessReturnPct: numberOrNull(row.net_excess_return_pct),
          maePct: numberOrNull(row.mae_pct),
          marketRegime: row.market_regime,
          evidenceStatus: row.evidence_status,
          evidenceManifestId: row.evidence_manifest_id,
        }));
        const manifestIds = [...new Set(observations
          .map((row) => row.evidenceManifestId)
          .filter((value): value is string => Boolean(value)))].sort();
        const manifestSetHash = stableEvidenceHash(manifestIds);
        const bootstrapBase = {
          iterations: DEFAULT_RECOMMENDATION_EVIDENCE_BOOTSTRAP.iterations,
          seed: stableSeed(`${groupKey}:${windowMonths}:${horizon}`),
        };
        const netReturnBootstrap = recommendationDayBlockBootstrap95({
          observations,
          valueKey: 'netReturnPct',
          ...bootstrapBase,
        });
        const netExcessBootstrap = recommendationDayBlockBootstrap95({
          observations,
          valueKey: 'netExcessReturnPct',
          ...bootstrapBase,
        });
        const netReturnValues = observations
          .map((row) => row.netReturnPct)
          .filter((value): value is number => value !== null);
        const maeValues = observations
          .map((row) => row.maePct)
          .filter((value): value is number => value !== null);
        const netReturnCohorts = cohortMeans(observations.map((row) => ({
          runDate: row.runDate,
          value: row.netReturnPct,
        })));
        const netExcessCohorts = cohortMeans(observations.map((row) => ({
          runDate: row.runDate,
          value: row.netExcessReturnPct,
        })));
        const coveredMonths = new Set(observations.map((row) => row.runDate.slice(0, 7)));
        const regimeDates = new Map<string, Set<string>>();
        for (const row of observations) {
          if (!row.marketRegime) continue;
          const dates = regimeDates.get(row.marketRegime) || new Set<string>();
          dates.add(row.runDate);
          regimeDates.set(row.marketRegime, dates);
        }
        const regimeCohortCounts = Object.fromEntries(
          [...regimeDates.entries()].sort(([left], [right]) => left.localeCompare(right))
            .map(([regime, dates]) => [regime, dates.size]),
        );
        const reasons: string[] = [];
        const expectedPickIds = new Set(populationWindow.map((row) => row.recommendation_picks.id));
        const horizonPickIds = new Set(inWindow.map((row) => row.recommendation_picks.id));
        const missingHorizonCount = [...expectedPickIds]
          .filter((pickId) => !horizonPickIds.has(pickId)).length;
        const incompletePopulation = inWindow.filter((row) => row.status !== 'MATURED'
          || row.cost_model_version !== RECOMMENDATION_COST_MODEL_VERSION
          || row.data_evidence_tier !== 'OFFICIAL');
        const incompleteCount = incompletePopulation.length
          + missingHorizonCount
          + observations.filter((row) => row.evidenceStatus !== 'READY'
          || !row.evidenceManifestId
          || row.netReturnPct === null
          || row.netExcessReturnPct === null
          || row.maePct === null
          || !row.marketRegime).length;
        if (incompleteCount > 0) reasons.push('INCOMPLETE_OFFICIAL_EVIDENCE');
        if (coveredMonths.size < policy.minimumCoveredMonths) reasons.push('INSUFFICIENT_MONTH_COVERAGE');
        if (netExcessBootstrap.sampleSize < policy.minimumSampleSize) reasons.push('INSUFFICIENT_SAMPLE_SIZE');
        if (netExcessBootstrap.cohortCount < policy.minimumCohorts[horizon]) reasons.push('INSUFFICIENT_COHORT_COUNT');
        if (regimeDates.size < 2) reasons.push('INSUFFICIENT_MARKET_REGIMES');
        const requiredRegimeShare = Math.ceil(netExcessBootstrap.cohortCount * 0.1);
        if ([...regimeDates.values()].some((dates) => (
          dates.size < policy.minimumRegimeCohorts || dates.size < requiredRegimeShare
        ))) reasons.push('UNBALANCED_MARKET_REGIME_COHORTS');
        if (netExcessBootstrap.lower === null || netExcessBootstrap.lower <= 0) {
          reasons.push('NON_POSITIVE_EXCESS_CI_LOWER_BOUND');
        }
        const lowerDecileNetExcessReturnPct = lowerDecileMean(netExcessCohorts);
        if (lowerDecileNetExcessReturnPct === null || lowerDecileNetExcessReturnPct < 0) {
          reasons.push('LOWER_DECILE_EXCESS_BELOW_ZERO');
        }
        const tailBreachCount = netReturnValues.filter((value) => value <= TAIL_LOSS_THRESHOLD_PCT[horizon]).length;
        const tailBreachRate = netReturnValues.length ? tailBreachCount / netReturnValues.length : null;
        if (tailBreachRate === null || tailBreachRate > 0.05) reasons.push('TAIL_BREACH_RATE_EXCEEDED');

        const evidenceStatus = incompleteCount > 0
          ? 'INCOMPLETE'
          : reasons.some((reason) => reason.startsWith('INSUFFICIENT') || reason.startsWith('UNBALANCED'))
            ? 'INSUFFICIENT'
            : 'READY';
        const gateStatus = reasons.length === 0 ? 'PASS' : 'BLOCKED';
        const evaluationIdentity = {
          market,
          category,
          engineVersion,
          assuranceContractHash,
          horizon,
          windowMonths,
          windowStart,
          windowEnd: latestRunDate,
          policyVersion: LONGITUDINAL_ASSURANCE_POLICY_VERSION,
          statisticsVersion: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
          manifestSetHash,
          completenessPopulation: inWindow.map((row) => ({
            pickId: row.recommendation_picks.id,
            runDate: row.recommendation_picks.recommendation_publications.run_date,
            horizon: row.horizon,
            status: row.status,
            costModelVersion: row.cost_model_version,
            dataEvidenceTier: row.data_evidence_tier,
            evidenceStatus: row.evidence_status,
            evidenceManifestId: row.evidence_manifest_id,
          })).sort((left, right) => stableEvidenceHash(left).localeCompare(stableEvidenceHash(right))),
          missingHorizonCount,
          observations,
          policy,
          tailLossThresholdPct: TAIL_LOSS_THRESHOLD_PCT[horizon],
          bootstrap: bootstrapBase,
        };
        evaluations.push({
          evaluation_hash: stableEvidenceHash(evaluationIdentity),
          market,
          category,
          engine_version: engineVersion,
          assurance_contract_hash: assuranceContractHash,
          horizon,
          window_months: windowMonths,
          window_start: windowStart,
          window_end: latestRunDate,
          covered_month_count: coveredMonths.size,
          sample_size: netExcessBootstrap.sampleSize,
          cohort_count: netExcessBootstrap.cohortCount,
          market_regime_count: regimeDates.size,
          regime_cohort_counts: regimeCohortCounts,
          mean_net_return_pct: netReturnBootstrap.mean,
          mean_net_excess_return_pct: netExcessBootstrap.mean,
          excess_ci95_lower: netExcessBootstrap.lower,
          excess_ci95_upper: netExcessBootstrap.upper,
          average_mae_pct: rounded(average(maeValues)),
          lower_decile_net_return_pct: lowerDecileMean(netReturnCohorts),
          lower_decile_net_excess_return_pct: lowerDecileNetExcessReturnPct,
          tail_breach_rate: rounded(tailBreachRate),
          manifest_set_hash: manifestSetHash,
          statistics_version: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
          policy_version: LONGITUDINAL_ASSURANCE_POLICY_VERSION,
          evidence_status: evidenceStatus,
          gate_status: gateStatus,
          gate_reasons: reasons,
        });
      }
    }
  }

  return evaluations.sort((left, right) => {
    const leftKey = `${left.category}:${left.assurance_contract_hash}:${left.window_months}:${left.horizon}`;
    const rightKey = `${right.category}:${right.assurance_contract_hash}:${right.window_months}:${right.horizon}`;
    return leftKey.localeCompare(rightKey);
  });
}
