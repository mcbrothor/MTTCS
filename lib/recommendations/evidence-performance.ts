import { createHash } from 'node:crypto';
import { calculateRecommendationPerformance, resolveFirstTradableIndex } from './core';
import type { RecommendationPriceSeries } from './prices';
import type {
  RecommendationHorizon,
  RecommendationMarket,
  RecommendationPerformanceResult,
} from './types';

export const RECOMMENDATION_EVIDENCE_STRATEGY_VERSION = 'mtn-open-close-active-v1';
export const RECOMMENDATION_COST_MODEL_VERSION = 'mtn-standardized-round-trip-v1';
export const RECOMMENDATION_EVIDENCE_STATISTICS_VERSION = 'mtn-cohort-block-bootstrap-95-v1';
export const RECOMMENDATION_PRICE_EVIDENCE_PAYLOAD_VERSION = 'mtn-recommendation-price-slice-v1';

export type RecommendationEvidenceTier = 'OFFICIAL' | 'FALLBACK' | 'INCOMPLETE';
export type RecommendationEvidenceStatus = 'READY' | 'INCOMPLETE';

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

function canonicalize(value: unknown): CanonicalValue {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Evidence manifests cannot contain non-finite numbers.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = canonicalize(item);
    }
    return result;
  }
  throw new Error(`Unsupported evidence manifest value: ${typeof value}`);
}

export function stableEvidenceHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function normalizedSeries(series: RecommendationPriceSeries) {
  return {
    instrument: series.instrument,
    source: series.source,
    adjustmentType: series.adjustmentType,
    qualityStatus: series.qualityStatus,
    bars: [...series.bars]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((bar) => ({
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        qualityStatus: bar.qualityStatus ?? series.qualityStatus,
      })),
  };
}

type NormalizedPriceSeries = ReturnType<typeof normalizedSeries>;

export interface RecommendationPriceEvidencePayload {
  schemaVersion: typeof RECOMMENDATION_PRICE_EVIDENCE_PAYLOAD_VERSION;
  calculationIdentity: {
    pickId: string;
    generatedAt: string;
    market: RecommendationMarket;
    horizon: RecommendationHorizon;
  };
  security: NormalizedPriceSeries;
  benchmark: NormalizedPriceSeries;
}

function seriesTier(series: RecommendationPriceSeries | NormalizedPriceSeries): RecommendationEvidenceTier {
  if (series.bars.length === 0) return 'INCOMPLETE';
  const qualities = [series.qualityStatus, ...series.bars.map((bar) => bar.qualityStatus ?? series.qualityStatus)];
  if (qualities.some((quality) => quality === 'ANOMALY' || quality === 'MISSING' || quality === 'UNADJUSTED')) {
    return 'INCOMPLETE';
  }
  return qualities.every((quality) => quality === 'FULL') ? 'OFFICIAL' : 'FALLBACK';
}

function combinedSeriesTier(input: {
  security: RecommendationPriceSeries;
  benchmark: RecommendationPriceSeries;
}) {
  const securityTier = seriesTier(input.security);
  const benchmarkTier = seriesTier(input.benchmark);
  return securityTier === 'INCOMPLETE' || benchmarkTier === 'INCOMPLETE'
    ? 'INCOMPLETE'
    : securityTier === 'OFFICIAL' && benchmarkTier === 'OFFICIAL'
      ? 'OFFICIAL'
      : 'FALLBACK';
}

function canonicalGeneratedAt(value: string | Date) {
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid recommendation generated_at.');
  return instant.toISOString();
}

function slicedSeries(
  series: RecommendationPriceSeries,
  entryDate: string | null,
  evaluationDate: string | null,
) {
  const bars = !entryDate
    ? []
    : series.bars.filter((bar) => bar.date >= entryDate && (!evaluationDate || bar.date <= evaluationDate));
  return normalizedSeries({ ...series, bars });
}

function seriesSummary(series: NormalizedPriceSeries) {
  return {
    instrument: series.instrument,
    source: series.source,
    adjustmentType: series.adjustmentType,
    qualityStatus: series.qualityStatus,
    barCount: series.bars.length,
    firstDate: series.bars.at(0)?.date ?? null,
    lastDate: series.bars.at(-1)?.date ?? null,
    contentHash: stableEvidenceHash(series),
  };
}

export function buildRecommendationPriceEvidence(input: {
  pickId: string;
  generatedAt: string | Date;
  market: RecommendationMarket;
  horizon: RecommendationHorizon;
  security: RecommendationPriceSeries;
  benchmark: RecommendationPriceSeries;
}) {
  const generatedAt = canonicalGeneratedAt(input.generatedAt);
  const result = calculateRecommendationPerformance({
    generatedAt,
    market: input.market,
    horizon: input.horizon,
    bars: input.security.bars,
    benchmarkBars: input.benchmark.bars,
  });
  const sortedSecurityBars = [...input.security.bars].sort((left, right) => left.date.localeCompare(right.date));
  const candidateEntryIndex = resolveFirstTradableIndex(generatedAt, input.market, sortedSecurityBars);
  const sliceEntryDate = result.entryDate ?? sortedSecurityBars[candidateEntryIndex]?.date ?? null;
  const sliceEvaluationDate = result.evaluationDate
    ?? (result.status === 'EXCLUDED' ? sliceEntryDate : null);
  const security = slicedSeries(input.security, sliceEntryDate, sliceEvaluationDate);
  const benchmark = slicedSeries(input.benchmark, sliceEntryDate, sliceEvaluationDate);
  const sourceEvidenceTier = combinedSeriesTier({
    security: { ...input.security, bars: security.bars },
    benchmark: { ...input.benchmark, bars: benchmark.bars },
  });
  const evidenceTier: RecommendationEvidenceTier = input.horizon !== 'LIVE'
    && result.status === 'MATURED'
    ? sourceEvidenceTier
    : 'INCOMPLETE';
  const dataPayload: RecommendationPriceEvidencePayload = {
    schemaVersion: RECOMMENDATION_PRICE_EVIDENCE_PAYLOAD_VERSION,
    calculationIdentity: {
      pickId: input.pickId,
      generatedAt,
      market: input.market,
      horizon: input.horizon,
    },
    security,
    benchmark,
  };
  const dataManifestId = stableEvidenceHash(dataPayload);
  return {
    result,
    dataManifest: {
      dataManifestId,
      payloadHash: dataManifestId,
      evidenceTier,
      summary: {
        evidenceTier,
        sourceEvidenceTier,
        calculationStatus: result.status,
        security: seriesSummary(security),
        benchmark: seriesSummary(benchmark),
      },
      dataPayload,
    },
  };
}

export type RecommendationPriceEvidenceCalculation = ReturnType<typeof buildRecommendationPriceEvidence>;

export function replayRecommendationPriceEvidence(
  payload: RecommendationPriceEvidencePayload,
  expectedPayloadHash: string,
): RecommendationPerformanceResult {
  if (stableEvidenceHash(payload) !== expectedPayloadHash) {
    throw new Error('Recommendation evidence payload hash does not match its immutable identifier.');
  }
  if (payload.schemaVersion !== RECOMMENDATION_PRICE_EVIDENCE_PAYLOAD_VERSION
    || !payload.calculationIdentity
    || !Array.isArray(payload.security?.bars)
    || !Array.isArray(payload.benchmark?.bars)) {
    throw new Error('Unsupported or malformed recommendation evidence payload.');
  }
  return calculateRecommendationPerformance({
    generatedAt: payload.calculationIdentity.generatedAt,
    market: payload.calculationIdentity.market,
    horizon: payload.calculationIdentity.horizon,
    bars: payload.security.bars,
    benchmarkBars: payload.benchmark.bars,
  });
}

export function buildRecommendationEvidenceManifest(input: {
  pickId: string;
  engineId: string | null | undefined;
  strategyId?: string | null;
  promptId: string | null | undefined;
  calculation: RecommendationPriceEvidenceCalculation;
  marketRegime: string | null | undefined;
}) {
  const strategyId = input.strategyId ?? RECOMMENDATION_EVIDENCE_STRATEGY_VERSION;
  const { dataManifest, result } = input.calculation;
  const identity = dataManifest.dataPayload.calculationIdentity;
  if (identity.pickId !== input.pickId) {
    throw new Error('Recommendation evidence pick identity does not match its price payload.');
  }
  if (stableEvidenceHash(dataManifest.dataPayload) !== dataManifest.dataManifestId) {
    throw new Error('Recommendation evidence payload hash does not match its data manifest identifier.');
  }
  const missingFields: string[] = [];
  if (!input.engineId) missingFields.push('engineId');
  if (!strategyId) missingFields.push('strategyId');
  if (!input.promptId) missingFields.push('promptId');
  if (!dataManifest.dataManifestId || dataManifest.evidenceTier === 'INCOMPLETE') missingFields.push('dataManifestId');
  if (!input.marketRegime) missingFields.push('marketRegime');
  if (identity.horizon === 'LIVE') missingFields.push('maturedHorizon');
  if (result.status !== 'MATURED') missingFields.push('maturedPerformance');
  const evidenceStatus: RecommendationEvidenceStatus = missingFields.length === 0 ? 'READY' : 'INCOMPLETE';
  const manifest = {
    pickId: input.pickId,
    horizon: identity.horizon,
    generatedAt: identity.generatedAt,
    market: identity.market,
    engineId: input.engineId ?? null,
    strategyId,
    promptId: input.promptId ?? null,
    dataManifestId: dataManifest.dataManifestId,
    dataManifestSummary: dataManifest.summary,
    dataEvidenceTier: dataManifest.evidenceTier,
    calculationResult: result,
    marketRegime: input.marketRegime ?? null,
    costModelVersion: RECOMMENDATION_COST_MODEL_VERSION,
    statisticsVersion: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
    evidenceStatus,
    missingFields,
  };
  return {
    manifestHash: stableEvidenceHash(manifest),
    pickId: input.pickId,
    horizon: identity.horizon,
    calculationStatus: result.status,
    calculationResult: result,
    engineId: input.engineId ?? null,
    strategyId,
    promptId: input.promptId ?? null,
    dataManifestId: dataManifest.dataManifestId,
    dataPayloadHash: dataManifest.payloadHash,
    dataPayload: dataManifest.dataPayload,
    dataEvidenceTier: dataManifest.evidenceTier,
    marketRegime: input.marketRegime ?? null,
    costModelVersion: RECOMMENDATION_COST_MODEL_VERSION,
    statisticsVersion: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
    evidenceStatus,
    missingFields,
    manifest,
  };
}

export function shouldPersistRecommendationEvidenceManifest(
  evidence: ReturnType<typeof buildRecommendationEvidenceManifest>,
) {
  return evidence.evidenceStatus === 'READY';
}

interface CostComponentBps {
  entry: number;
  exit: number;
}

interface StandardizedCostModel {
  commission: CostComponentBps;
  tax: CostComponentBps;
  slippage: CostComponentBps;
  fx: CostComponentBps;
}

const STANDARDIZED_COSTS: Record<RecommendationMarket, StandardizedCostModel> = {
  US: {
    commission: { entry: 5, exit: 5 },
    tax: { entry: 0, exit: 0 },
    slippage: { entry: 10, exit: 10 },
    fx: { entry: 15, exit: 15 },
  },
  KR: {
    commission: { entry: 1.5, exit: 1.5 },
    tax: { entry: 0, exit: 15 },
    slippage: { entry: 10, exit: 10 },
    fx: { entry: 0, exit: 0 },
  },
};

function round(value: number) {
  return Number(value.toFixed(6));
}

function componentPct(component: CostComponentBps) {
  return round((component.entry + component.exit) / 100);
}

export function calculateNetRecommendationPerformance(input: {
  market: RecommendationMarket;
  grossReturnPct: number | null;
  benchmarkReturnPct: number | null;
}) {
  const model = STANDARDIZED_COSTS[input.market];
  const commissionCostPct = componentPct(model.commission);
  const taxCostPct = componentPct(model.tax);
  const slippageCostPct = componentPct(model.slippage);
  const fxCostPct = componentPct(model.fx);
  const base = {
    benchmarkReturnPct: input.benchmarkReturnPct,
    commissionCostPct,
    taxCostPct,
    slippageCostPct,
    fxCostPct,
    costModelVersion: RECOMMENDATION_COST_MODEL_VERSION,
    accountEvidenceStatus: 'NOT_AVAILABLE' as const,
    accountActualReturnPct: null,
  };
  if (input.grossReturnPct === null || input.benchmarkReturnPct === null
    || !Number.isFinite(input.grossReturnPct) || !Number.isFinite(input.benchmarkReturnPct)) {
    return {
      ...base,
      netReturnPct: null,
      netExcessReturnPct: null,
      totalCostPct: null,
      costEvidenceStatus: 'MISSING' as const,
    };
  }

  const entryBps = model.commission.entry + model.tax.entry + model.slippage.entry + model.fx.entry;
  const exitBps = model.commission.exit + model.tax.exit + model.slippage.exit + model.fx.exit;
  const netGrowth = (1 - entryBps / 10_000) * (1 + input.grossReturnPct / 100) * (1 - exitBps / 10_000);
  const netReturnPct = round((netGrowth - 1) * 100);
  return {
    ...base,
    netReturnPct,
    netExcessReturnPct: round(netReturnPct - input.benchmarkReturnPct),
    totalCostPct: round(input.grossReturnPct - netReturnPct),
    costEvidenceStatus: 'STANDARDIZED_MODEL' as const,
  };
}
