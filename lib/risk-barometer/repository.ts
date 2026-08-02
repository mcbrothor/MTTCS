import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RiskBarometerHistoryPoint,
  RiskBarometerIndicator,
  RiskBarometerIndicatorKey,
  RiskBarometerResponse,
} from '@/types';
import {
  RISK_BAROMETER_DEFINITIONS,
  RISK_BAROMETER_MODEL_VERSION,
  evaluateRiskThreshold,
} from './model';

export const MANUAL_RISK_KEYS = [
  'margin_debt',
  'capital_market_frenzy',
  'equity_risk_premium',
] as const satisfies readonly RiskBarometerIndicatorKey[];

export interface ManualRiskObservationInput {
  key: (typeof MANUAL_RISK_KEYS)[number];
  period: string;
  value: number;
  unit: string;
  sourceUrl: string;
  observedAt: string;
  approvedBy: string;
  approvedAt: string;
  note: string;
}

function definitionFor(key: RiskBarometerIndicatorKey) {
  const definition = RISK_BAROMETER_DEFINITIONS.find((item) => item.key === key);
  if (!definition) throw new Error(`Unknown risk barometer indicator: ${key}`);
  return definition;
}

function manualStatus(input: ManualRiskObservationInput) {
  if (input.key === 'margin_debt' || input.key === 'capital_market_frenzy') {
    return evaluateRiskThreshold(input.key, input.value);
  }
  return null;
}

export async function upsertManualRiskObservation(
  client: SupabaseClient,
  input: ManualRiskObservationInput,
) {
  const definition = definitionFor(input.key);
  const triggered = manualStatus(input);
  const { data, error } = await client
    .from('risk_barometer_indicator_observations')
    .upsert({
      market: 'US',
      calc_date: input.period,
      indicator_key: input.key,
      observation_kind: 'SOURCE',
      value: input.value,
      display_value: String(input.value),
      unit: input.unit,
      threshold: definition.threshold,
      status: triggered === null ? 'UNKNOWN' : triggered ? 'TRIGGERED' : 'SAFE',
      contribution: triggered ? 1 : 0,
      method: 'MANUAL',
      provider: definition.provider,
      source_url: input.sourceUrl,
      observed_at: input.observedAt,
      freshness_seconds: definition.freshnessHours * 3_600,
      is_stale: false,
      model_version: RISK_BAROMETER_MODEL_VERSION,
      approved_by: input.approvedBy,
      approved_at: input.approvedAt,
      source_excerpt: input.note,
      metadata: { inputType: input.key === 'equity_risk_premium' ? 'forward_pe' : input.key },
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'market,calc_date,indicator_key,observation_kind,model_version',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestManualRiskObservations(client: SupabaseClient) {
  const { data, error } = await client
    .from('risk_barometer_indicator_observations')
    .select('*')
    .eq('market', 'US')
    .eq('observation_kind', 'SOURCE')
    .eq('model_version', RISK_BAROMETER_MODEL_VERSION)
    .in('indicator_key', [...MANUAL_RISK_KEYS])
    .order('observed_at', { ascending: false });
  if (error) throw error;

  const latest = new Map<string, Record<string, unknown>>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const key = String(row.indicator_key);
    if (!latest.has(key)) latest.set(key, row);
  }
  return MANUAL_RISK_KEYS.map((key) => latest.get(key) ?? null);
}

function indicatorObservationRow(
  indicator: RiskBarometerIndicator,
  calcDate: string,
  asOf: string,
) {
  return {
    market: 'US',
    calc_date: calcDate,
    indicator_key: indicator.key,
    observation_kind: 'SNAPSHOT',
    value: indicator.value,
    display_value: indicator.displayValue,
    unit: indicator.unit,
    threshold: indicator.threshold,
    status: indicator.status,
    contribution: indicator.contribution,
    method: indicator.method,
    provider: indicator.provider,
    source_url: indicator.sourceUrl,
    observed_at: indicator.observedAt || asOf,
    freshness_seconds: indicator.freshness.limitHours * 3_600,
    is_stale: indicator.freshness.stale,
    model_version: RISK_BAROMETER_MODEL_VERSION,
    metadata: {
      detail: indicator.detail,
      actualObservedAt: indicator.observedAt,
      ageHours: indicator.freshness.ageHours,
    },
    updated_at: new Date().toISOString(),
  };
}

export async function persistRiskBarometerSnapshot(input: {
  client: SupabaseClient;
  response: RiskBarometerResponse;
  inputHash: string;
  calcDate: string;
}) {
  const { client, response, inputHash, calcDate } = input;
  const observationRows = response.indicators.map((indicator) =>
    indicatorObservationRow(indicator, calcDate, response.asOf));
  const { error: indicatorError } = await client
    .from('risk_barometer_indicator_observations')
    .upsert(observationRows, {
      onConflict: 'market,calc_date,indicator_key,observation_kind,model_version',
    });
  if (indicatorError) throw indicatorError;

  const { data, error } = await client
    .from('risk_barometer_snapshots')
    .upsert({
      market: 'US',
      calc_date: calcDate,
      score: response.score,
      raw_score: response.rawScore,
      band: response.band,
      quality: response.quality,
      coverage: response.coverage.valid,
      total_indicators: response.coverage.total,
      model_version: response.modelVersion,
      input_hash: inputHash,
      indicators: response.indicators,
      observed_at: response.asOf,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'market,calc_date,model_version,input_hash',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function mapSnapshot(row: Record<string, unknown>): RiskBarometerResponse {
  return {
    score: row.score === null ? null : Number(row.score),
    rawScore: Number(row.raw_score),
    band: row.band as RiskBarometerResponse['band'],
    quality: row.quality as RiskBarometerResponse['quality'],
    coverage: {
      valid: Number(row.coverage),
      total: 10,
    },
    asOf: String(row.observed_at),
    modelVersion: RISK_BAROMETER_MODEL_VERSION,
    modelStatus: 'RESEARCH_ONLY',
    indicators: (row.indicators || []) as unknown as RiskBarometerIndicator[],
  };
}

export async function getLatestRiskBarometerSnapshot(client: SupabaseClient) {
  const { data, error } = await client
    .from('risk_barometer_snapshots')
    .select('*')
    .eq('market', 'US')
    .eq('model_version', RISK_BAROMETER_MODEL_VERSION)
    .order('calc_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSnapshot(data as Record<string, unknown>) : null;
}

export async function getRiskBarometerHistory(
  client: SupabaseClient,
  days: number,
): Promise<RiskBarometerHistoryPoint[]> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, days - 1));
  const { data, error } = await client
    .from('risk_barometer_snapshots')
    .select('calc_date,score,raw_score,quality,coverage,created_at')
    .eq('market', 'US')
    .eq('model_version', RISK_BAROMETER_MODEL_VERSION)
    .gte('calc_date', cutoff.toISOString().slice(0, 10))
    .order('calc_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  const byDate = new Map<string, RiskBarometerHistoryPoint>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    byDate.set(String(row.calc_date), {
      date: String(row.calc_date),
      score: row.score === null ? null : Number(row.score),
      rawScore: Number(row.raw_score),
      quality: row.quality as RiskBarometerHistoryPoint['quality'],
      coverage: Number(row.coverage),
    });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
