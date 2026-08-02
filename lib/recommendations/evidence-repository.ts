import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RECOMMENDATION_COST_MODEL_VERSION,
  RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
  replayRecommendationPriceEvidence,
  stableEvidenceHash,
  type RecommendationPriceEvidencePayload,
} from './evidence-performance';
import {
  DEFAULT_RECOMMENDATION_EVIDENCE_BOOTSTRAP,
  DEFAULT_RECOMMENDATION_EVIDENCE_POLICY,
  evaluateRecommendationEvidence,
  type RecommendationEvidenceObservation,
  type RecommendationEvidencePolicy,
} from './evidence-statistics';
import type {
  RecommendationCategory,
  RecommendationHorizon,
  RecommendationMarket,
  RecommendationPerformanceResult,
} from './types';

export const RECOMMENDATION_PROMOTION_POLICY_VERSION = 'mtn-evidence-promotion-v1';

type RecommendationEvidenceManifest = {
  manifestHash: string;
  pickId: string;
  horizon: RecommendationHorizon;
  calculationStatus: RecommendationPerformanceResult['status'];
  calculationResult: RecommendationPerformanceResult;
  engineId: string | null;
  strategyId: string;
  promptId: string | null;
  dataManifestId: string;
  dataPayloadHash: string;
  dataPayload: RecommendationPriceEvidencePayload;
  costModelVersion: string;
  statisticsVersion: string;
  evidenceStatus: 'READY' | 'INCOMPLETE';
  missingFields: string[];
  manifest: Record<string, unknown>;
};

export function recommendationEvidenceManifestInsertRow(evidence: RecommendationEvidenceManifest) {
  if (evidence.dataPayloadHash !== evidence.dataManifestId
    || stableEvidenceHash(evidence.dataPayload) !== evidence.dataManifestId) {
    throw new Error('Recommendation evidence payload hash does not match its data manifest identifier.');
  }
  if (stableEvidenceHash(evidence.manifest) !== evidence.manifestHash) {
    throw new Error('Recommendation evidence manifest hash does not match its immutable content.');
  }
  const identity = evidence.dataPayload.calculationIdentity;
  if (identity.pickId !== evidence.pickId || identity.horizon !== evidence.horizon) {
    throw new Error('Recommendation evidence calculation identity does not match its payload.');
  }
  const replayed = replayRecommendationPriceEvidence(evidence.dataPayload, evidence.dataPayloadHash);
  if (stableEvidenceHash(replayed) !== stableEvidenceHash(evidence.calculationResult)) {
    throw new Error('Recommendation evidence calculation result cannot be replayed from its payload.');
  }
  return {
    manifest_hash: evidence.manifestHash,
    pick_id: evidence.pickId,
    horizon: evidence.horizon,
    calculation_status: evidence.calculationStatus,
    calculation_result: evidence.calculationResult,
    engine_id: evidence.engineId,
    strategy_id: evidence.strategyId,
    prompt_id: evidence.promptId,
    data_manifest_id: evidence.dataManifestId,
    payload_hash: evidence.dataPayloadHash,
    data_payload: evidence.dataPayload,
    cost_model_version: evidence.costModelVersion,
    statistics_version: evidence.statisticsVersion,
    evidence_status: evidence.evidenceStatus,
    missing_fields: evidence.missingFields,
    manifest: evidence.manifest,
  };
}

interface PerformanceEvidenceRow {
  horizon: string;
  net_return_pct: number | string | null;
  net_excess_return_pct: number | string | null;
  mae_pct: number | string | null;
  data_evidence_tier: string | null;
  evidence_status: string | null;
  evidence_manifest_id: string | null;
  market_regime: string | null;
  recommendation_picks: {
    recommendation_publications: {
      run_date: string;
      market: RecommendationMarket;
      category: RecommendationCategory | null;
      engine_version: string;
      is_official: boolean;
    };
  };
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractRecommendationMarketRegime(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const regime = (value as { recommendation_regime?: unknown }).recommendation_regime;
  if (!regime || typeof regime !== 'object') return null;
  const effectiveState = (regime as { effectiveState?: unknown }).effectiveState;
  return effectiveState === 'GREEN' || effectiveState === 'YELLOW' || effectiveState === 'RED'
    ? effectiveState
    : null;
}

export async function registerRecommendationEvidenceManifest(
  client: SupabaseClient,
  evidence: RecommendationEvidenceManifest,
) {
  const readExisting = async () => client
    .from('recommendation_evidence_manifests')
    .select('id, manifest_hash')
    .eq('manifest_hash', evidence.manifestHash)
    .maybeSingle();
  const existing = await readExisting();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id as string;

  const { data, error } = await client
    .from('recommendation_evidence_manifests')
    .insert(recommendationEvidenceManifestInsertRow(evidence))
    .select('id')
    .single();
  if (!error && data?.id) return data.id as string;
  if (error && 'code' in error && error.code === '23505') {
    const raced = await readExisting();
    if (raced.error) throw raced.error;
    if (raced.data?.id) return raced.data.id as string;
  }
  throw error || new Error('Evidence manifest insert did not return an identifier.');
}

function toObservation(row: PerformanceEvidenceRow): RecommendationEvidenceObservation | null {
  if (row.horizon !== 'D5' && row.horizon !== 'D20' && row.horizon !== 'D60') return null;
  const publication = row.recommendation_picks?.recommendation_publications;
  if (!publication?.run_date) return null;
  const incompleteTier = row.data_evidence_tier !== 'OFFICIAL' && row.data_evidence_tier !== 'FALLBACK';
  return {
    runDate: publication.run_date,
    horizon: row.horizon,
    dataTier: row.data_evidence_tier === 'FALLBACK' ? 'FALLBACK' : 'OFFICIAL',
    netReturnPct: numberOrNull(row.net_return_pct),
    netExcessReturnPct: numberOrNull(row.net_excess_return_pct),
    maePct: numberOrNull(row.mae_pct),
    marketRegime: row.market_regime,
    evidenceStatus: row.evidence_status === 'READY' && !incompleteTier ? 'READY' : 'INCOMPLETE',
    evidenceManifestId: row.evidence_manifest_id,
  };
}

export function buildRecommendationEvidenceEvaluationRows(
  rows: PerformanceEvidenceRow[],
  market: RecommendationMarket,
  options?: {
    policy?: Partial<RecommendationEvidencePolicy>;
    bootstrap?: { iterations?: number; seed?: number };
  },
) {
  const grouped = new Map<string, PerformanceEvidenceRow[]>();
  for (const row of rows) {
    const publication = row.recommendation_picks?.recommendation_publications;
    if (!publication || publication.market !== market || publication.is_official !== true) continue;
    const key = JSON.stringify([publication.category, publication.engine_version]);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  const policy = { ...DEFAULT_RECOMMENDATION_EVIDENCE_POLICY, ...options?.policy };
  const bootstrap = { ...DEFAULT_RECOMMENDATION_EVIDENCE_BOOTSTRAP, ...options?.bootstrap };
  const evaluations: Record<string, unknown>[] = [];
  for (const [key, group] of grouped.entries()) {
    const [category, engineVersion] = JSON.parse(key) as [RecommendationCategory | null, string];
    const observations = group
      .map(toObservation)
      .filter((observation): observation is RecommendationEvidenceObservation => observation !== null);
    const result = evaluateRecommendationEvidence({ observations, policy, bootstrap });
    for (const horizon of ['D5', 'D20', 'D60'] as const) {
      const statistics = result.horizons[horizon];
      const horizonObservations = observations
        .filter((observation) => observation.horizon === horizon)
        .sort((left, right) => left.runDate.localeCompare(right.runDate)
          || (left.evidenceManifestId || '').localeCompare(right.evidenceManifestId || '')
          || left.dataTier.localeCompare(right.dataTier)
          || stableEvidenceHash(left).localeCompare(stableEvidenceHash(right)));
      const manifestIds = [...new Set(horizonObservations
        .map((observation) => observation.evidenceManifestId)
        .filter((value): value is string => Boolean(value)))].sort();
      const manifestSetHash = stableEvidenceHash(manifestIds);
      const evaluationHash = stableEvidenceHash({
        market,
        category,
        engineVersion,
        horizon,
        costModelVersion: RECOMMENDATION_COST_MODEL_VERSION,
        statisticsVersion: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
        promotionPolicyVersion: RECOMMENDATION_PROMOTION_POLICY_VERSION,
        manifestSetHash,
        observations: horizonObservations,
        policy,
        bootstrap,
      });
      const evidenceStatus = statistics.official.incompleteEvidenceCount > 0
        || statistics.official.missingMarketRegimeCount > 0
        || statistics.official.missingPerformanceMetricCount > 0
        ? 'INCOMPLETE'
        : statistics.official.sampleSize < policy.minimumSampleSize
          || statistics.official.cohortCount < policy.minimumCohortCount
          || statistics.official.marketRegimeCount < policy.minimumMarketRegimeCount
          ? 'INSUFFICIENT'
          : 'READY';
      evaluations.push({
        evaluation_hash: evaluationHash,
        market,
        category,
        horizon,
        engine_version: engineVersion,
        data_scope: 'OFFICIAL_GATE_WITH_FALLBACK_DIAGNOSTIC',
        manifest_set_hash: manifestSetHash,
        cost_model_version: RECOMMENDATION_COST_MODEL_VERSION,
        statistics_version: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
        promotion_policy_version: RECOMMENDATION_PROMOTION_POLICY_VERSION,
        sample_size: statistics.official.sampleSize,
        cohort_count: statistics.official.cohortCount,
        market_regime_count: statistics.official.marketRegimeCount,
        mean_net_return_pct: statistics.official.meanNetReturnPct,
        mean_net_excess_return_pct: statistics.official.meanNetExcessReturnPct,
        excess_ci95_lower: statistics.official.excessReturnConfidenceInterval95.lower,
        excess_ci95_upper: statistics.official.excessReturnConfidenceInterval95.upper,
        average_mae_pct: statistics.official.averageMaePct,
        lower_decile_net_return_pct: statistics.official.lowerDecileNetReturnPct,
        evidence_status: evidenceStatus,
        account_evidence_status: 'NOT_AVAILABLE',
        statistics: {
          official: statistics.official,
          fallback: statistics.fallback,
          bootstrap: result.bootstrap,
          evidenceManifestIds: manifestIds,
        },
        promotion_gate: statistics.promotion,
      });
    }
  }
  return evaluations.sort((left, right) => {
    const leftKey = `${left.category}:${left.engine_version}:${left.horizon}`;
    const rightKey = `${right.category}:${right.engine_version}:${right.horizon}`;
    return leftKey.localeCompare(rightKey);
  });
}

export async function refreshRecommendationEvidenceEvaluations(
  client: SupabaseClient,
  market: RecommendationMarket,
) {
  const pageSize = 1_000;
  const rows: PerformanceEvidenceRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('recommendation_performance')
      .select('horizon, net_return_pct, net_excess_return_pct, mae_pct, data_evidence_tier, evidence_status, evidence_manifest_id, market_regime, recommendation_picks!inner(recommendation_publications!inner(run_date, market, category, engine_version, is_official))')
      .eq('status', 'MATURED')
      .eq('cost_model_version', RECOMMENDATION_COST_MODEL_VERSION)
      .eq('recommendation_picks.recommendation_publications.market', market)
      .eq('recommendation_picks.recommendation_publications.is_official', true)
      .in('horizon', ['D5', 'D20', 'D60'])
      .order('evaluation_date', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as unknown as PerformanceEvidenceRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  const evaluations = buildRecommendationEvidenceEvaluationRows(rows, market);
  if (evaluations.length > 0) {
    const { error } = await client
      .from('recommendation_evidence_evaluations')
      .upsert(evaluations, { onConflict: 'evaluation_hash', ignoreDuplicates: true });
    if (error) throw error;
  }
  return {
    evaluated: evaluations.length,
    groups: [...new Set(evaluations.map((evaluation) => `${evaluation.category}:${evaluation.engine_version}`))].length,
    promotionPasses: evaluations.filter((evaluation) => (
      (evaluation.promotion_gate as { status?: string }).status === 'PASS'
    )).length,
    accountEvidenceStatus: 'NOT_AVAILABLE' as const,
  };
}

export async function readRecommendationEvidence(input: {
  client: SupabaseClient;
  market: RecommendationMarket;
  category?: RecommendationCategory | null;
  engineVersion?: string | null;
}) {
  let query = input.client
    .from('recommendation_evidence_evaluations')
    .select('*')
    .eq('market', input.market)
    .order('evaluated_at', { ascending: false })
    .limit(1_000);
  if (input.category) query = query.eq('category', input.category);
  if (input.engineVersion) query = query.eq('engine_version', input.engineVersion);
  const { data, error } = await query;
  if (error) throw error;

  const latest = new Map<string, Record<string, unknown>>();
  for (const row of (data || []) as Record<string, unknown>[]) {
    const key = `${row.category}:${row.engine_version}:${row.horizon}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  const evaluations = [...latest.values()];
  const byEngine = new Map<string, Record<string, unknown>[]>();
  for (const row of evaluations) {
    const engineVersion = String(row.engine_version || 'MISSING');
    byEngine.set(engineVersion, [...(byEngine.get(engineVersion) || []), row]);
  }
  const policies = [...byEngine.entries()].map(([engineVersion, engineRows]) => {
    const categoryGroups = new Map<string, Record<string, unknown>[]>();
    for (const row of engineRows) {
      const category = String(row.category || 'UNSPECIFIED');
      categoryGroups.set(category, [...(categoryGroups.get(category) || []), row]);
    }
    const categories = [...categoryGroups.entries()].map(([category, categoryRows]) => {
      const required = ['D5', 'D20', 'D60'];
      const passed = required.filter((horizon) => categoryRows.some((row) => (
        row.horizon === horizon && (row.promotion_gate as { status?: string } | null)?.status === 'PASS'
      )));
      return {
        category,
        status: passed.length === required.length ? 'PASS' as const : 'BLOCKED' as const,
        passedHorizons: passed,
        missingOrBlockedHorizons: required.filter((horizon) => !passed.includes(horizon)),
      };
    });
    return {
      engineVersion,
      status: categories.length > 0 && categories.every((category) => category.status === 'PASS')
        ? 'PASS' as const
        : 'BLOCKED' as const,
      categories,
    };
  });
  const selected = input.engineVersion
    ? policies.find((policy) => policy.engineVersion === input.engineVersion)
    : policies.length === 1 ? policies[0] : null;
  const reasons = evaluations.length === 0
    ? ['MISSING_EVIDENCE']
    : !selected
      ? ['ENGINE_VERSION_REQUIRED']
      : selected.status === 'PASS' ? [] : ['HORIZON_GATE_BLOCKED'];
  return {
    status: evaluations.length > 0 ? 'AVAILABLE' as const : 'MISSING' as const,
    authoritative: true,
    methodology: {
      statisticsVersion: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
      confidenceLevel: 0.95,
      bootstrapUnit: 'RECOMMENDATION_DAY_COHORT',
      officialFallbackSeparated: true,
      horizons: ['D5', 'D20', 'D60'],
      costs: 'STANDARDIZED_MODEL_NOT_ACCOUNT_ACTUAL',
    },
    accountEvidenceStatus: 'NOT_AVAILABLE' as const,
    evidencePromotion: {
      status: selected?.status === 'PASS' ? 'PASS' as const : 'BLOCKED' as const,
      engineVersion: selected?.engineVersion || input.engineVersion || null,
      reasons,
    },
    policies,
    evaluations,
  };
}
