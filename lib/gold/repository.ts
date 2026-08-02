import type { SupabaseClient } from '@supabase/supabase-js';

export type GoldRepositoryClient = Pick<SupabaseClient, 'from'>;
export type StoredGoldProductCode = 'GLD' | '411060' | '132030';
export type GoldBaseCurrency = 'KRW' | 'USD';
export type GoldDataQuality = 'READY' | 'DEGRADED' | 'BLOCKED';
export type GoldEtfFlowDirection = 'INFLOW' | 'FLAT' | 'OUTFLOW';
export type GoldCentralBankDemandStatus =
  | 'STRENGTHENING'
  | 'STABLE'
  | 'WEAKENING'
  | 'UNKNOWN';

export interface GoldStrategySettingsRecord {
  ownerId: string;
  coreProduct: StoredGoldProductCode;
  tacticalProduct: StoredGoldProductCode;
  baseCurrency: GoldBaseCurrency;
  manualAccountValue: number | null;
  externalGoldValue: number;
  physicalGoldValue: number;
  executionLevels: Record<string, unknown>;
  referenceScenario: Record<string, unknown>;
  riskPaused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoldStrategySettingsUpsert {
  coreProduct?: StoredGoldProductCode;
  tacticalProduct?: StoredGoldProductCode;
  baseCurrency?: GoldBaseCurrency;
  manualAccountValue?: number | null;
  externalGoldValue?: number;
  physicalGoldValue?: number;
  executionLevels?: Record<string, unknown>;
  referenceScenario?: Record<string, unknown>;
  riskPaused?: boolean;
}

export interface GoldMacroObservationRecord {
  id: string;
  ownerId: string;
  observationMonth: string;
  etfNetFlowUsd: number;
  holdingsChangeTonnes: number | null;
  etfFlowDirection: GoldEtfFlowDirection;
  centralBankDemandStatus: GoldCentralBankDemandStatus;
  sourceUrl: string;
  sourceExcerpt: string | null;
  centralBankSourceUrl: string | null;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoldMacroObservationUpsert {
  observationMonth: string;
  etfNetFlowUsd: number;
  holdingsChangeTonnes?: number | null;
  centralBankDemandStatus?: GoldCentralBankDemandStatus;
  sourceUrl: string;
  sourceExcerpt?: string | null;
  centralBankSourceUrl?: string | null;
  approvedAt: string;
}

export interface GoldStrategySnapshotRecord {
  id: string;
  ownerId: string;
  asOfDate: string;
  coreProduct: StoredGoldProductCode;
  tacticalProduct: StoredGoldProductCode;
  modelVersion: string;
  dataQuality: GoldDataQuality;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  inputHash: string;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoldStrategySnapshotUpsert {
  asOfDate: string;
  coreProduct: StoredGoldProductCode;
  tacticalProduct: StoredGoldProductCode;
  modelVersion: string;
  dataQuality: GoldDataQuality;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  inputHash: string;
  observedAt: string;
}

interface SettingsRow {
  owner_id: string;
  core_product: StoredGoldProductCode;
  tactical_product: StoredGoldProductCode;
  base_currency: GoldBaseCurrency;
  manual_account_value?: number | string | null;
  external_gold_value: number | string;
  physical_gold_value: number | string;
  execution_levels: Record<string, unknown>;
  reference_scenario: Record<string, unknown>;
  risk_paused: boolean;
  created_at: string;
  updated_at: string;
}

interface MacroObservationRow {
  id: string;
  owner_id: string;
  observation_month: string;
  etf_net_flow_usd: number | string;
  holdings_change_tonnes: number | string | null;
  etf_flow_direction: GoldEtfFlowDirection;
  central_bank_demand_status: GoldCentralBankDemandStatus;
  source_url: string;
  source_excerpt: string | null;
  central_bank_source_url: string | null;
  approved_at: string;
  created_at: string;
  updated_at: string;
}

interface SnapshotRow {
  id: string;
  owner_id: string;
  as_of_date: string;
  core_product: StoredGoldProductCode;
  tactical_product: StoredGoldProductCode;
  model_version: string;
  data_quality: GoldDataQuality;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  input_hash: string;
  observed_at: string;
  created_at: string;
  updated_at: string;
}

function requireOwnerId(ownerId: string) {
  const normalized = ownerId.trim();
  if (!normalized) throw new Error('Gold repository ownerId is required.');
  return normalized;
}

function numberFromDatabase(value: number | string, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${field}.`);
  }
  return parsed;
}

function nullableNumberFromDatabase(
  value: number | string | null | undefined,
  field: string,
) {
  return value === null || value === undefined
    ? null
    : numberFromDatabase(value, field);
}

function mapSettings(row: SettingsRow): GoldStrategySettingsRecord {
  return {
    ownerId: row.owner_id,
    coreProduct: row.core_product,
    tacticalProduct: row.tactical_product,
    baseCurrency: row.base_currency,
    manualAccountValue: nullableNumberFromDatabase(
      row.manual_account_value,
      'manual_account_value',
    ),
    externalGoldValue: numberFromDatabase(row.external_gold_value, 'external_gold_value'),
    physicalGoldValue: numberFromDatabase(row.physical_gold_value, 'physical_gold_value'),
    executionLevels: row.execution_levels,
    referenceScenario: row.reference_scenario,
    riskPaused: row.risk_paused,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMacroObservation(row: MacroObservationRow): GoldMacroObservationRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    observationMonth: row.observation_month,
    etfNetFlowUsd: numberFromDatabase(row.etf_net_flow_usd, 'etf_net_flow_usd'),
    holdingsChangeTonnes: nullableNumberFromDatabase(
      row.holdings_change_tonnes,
      'holdings_change_tonnes',
    ),
    etfFlowDirection: row.etf_flow_direction,
    centralBankDemandStatus: row.central_bank_demand_status,
    sourceUrl: row.source_url,
    sourceExcerpt: row.source_excerpt,
    centralBankSourceUrl: row.central_bank_source_url,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSnapshot(row: SnapshotRow): GoldStrategySnapshotRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    asOfDate: row.as_of_date,
    coreProduct: row.core_product,
    tacticalProduct: row.tactical_product,
    modelVersion: row.model_version,
    dataQuality: row.data_quality,
    inputs: row.inputs,
    result: row.result,
    inputHash: row.input_hash,
    observedAt: row.observed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getGoldStrategySettings(input: {
  client: GoldRepositoryClient;
  ownerId: string;
}) {
  const ownerId = requireOwnerId(input.ownerId);
  const { data, error } = await input.client
    .from('gold_strategy_settings')
    .select('*')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSettings(data as SettingsRow) : null;
}

export async function upsertGoldStrategySettings(input: {
  client: GoldRepositoryClient;
  ownerId: string;
  settings: GoldStrategySettingsUpsert;
}) {
  const ownerId = requireOwnerId(input.ownerId);
  const row: Record<string, unknown> = {
    owner_id: ownerId,
    updated_at: new Date().toISOString(),
  };
  if (input.settings.coreProduct !== undefined) row.core_product = input.settings.coreProduct;
  if (input.settings.tacticalProduct !== undefined) {
    row.tactical_product = input.settings.tacticalProduct;
  }
  if (input.settings.baseCurrency !== undefined) row.base_currency = input.settings.baseCurrency;
  if (input.settings.manualAccountValue !== undefined) {
    row.manual_account_value = input.settings.manualAccountValue;
  }
  if (input.settings.externalGoldValue !== undefined) {
    row.external_gold_value = input.settings.externalGoldValue;
  }
  if (input.settings.physicalGoldValue !== undefined) {
    row.physical_gold_value = input.settings.physicalGoldValue;
  }
  if (input.settings.executionLevels !== undefined) {
    row.execution_levels = input.settings.executionLevels;
  }
  if (input.settings.referenceScenario !== undefined) {
    row.reference_scenario = input.settings.referenceScenario;
  }
  if (input.settings.riskPaused !== undefined) row.risk_paused = input.settings.riskPaused;

  const { data, error } = await input.client
    .from('gold_strategy_settings')
    .upsert(row, { onConflict: 'owner_id' })
    .select('*')
    .single();
  if (error) throw error;
  return mapSettings(data as SettingsRow);
}

export async function getLatestGoldMacroObservation(input: {
  client: GoldRepositoryClient;
  ownerId: string;
}) {
  const ownerId = requireOwnerId(input.ownerId);
  const { data, error } = await input.client
    .from('gold_macro_observations')
    .select('*')
    .eq('owner_id', ownerId)
    .order('observation_month', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMacroObservation(data as MacroObservationRow) : null;
}

export async function upsertGoldMacroObservation(input: {
  client: GoldRepositoryClient;
  ownerId: string;
  observation: GoldMacroObservationUpsert;
}) {
  const ownerId = requireOwnerId(input.ownerId);
  const row = {
    owner_id: ownerId,
    observation_month: input.observation.observationMonth,
    etf_net_flow_usd: input.observation.etfNetFlowUsd,
    holdings_change_tonnes: input.observation.holdingsChangeTonnes ?? null,
    central_bank_demand_status:
      input.observation.centralBankDemandStatus ?? 'UNKNOWN',
    source_url: input.observation.sourceUrl,
    source_excerpt: input.observation.sourceExcerpt ?? null,
    central_bank_source_url: input.observation.centralBankSourceUrl ?? null,
    approved_at: input.observation.approvedAt,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await input.client
    .from('gold_macro_observations')
    .upsert(row, { onConflict: 'owner_id,observation_month' })
    .select('*')
    .single();
  if (error) throw error;
  return mapMacroObservation(data as MacroObservationRow);
}

export async function listGoldStrategySnapshots(input: {
  client: GoldRepositoryClient;
  ownerId: string;
  product?: StoredGoldProductCode;
  limit?: number;
}) {
  const ownerId = requireOwnerId(input.ownerId);
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 30)));
  let query = input.client
    .from('gold_strategy_snapshots')
    .select('*')
    .eq('owner_id', ownerId)
    .order('as_of_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (input.product) {
    query = query.or(
      `core_product.eq.${input.product},tactical_product.eq.${input.product}`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapSnapshot(row as SnapshotRow));
}

export async function upsertGoldStrategySnapshot(input: {
  client: GoldRepositoryClient;
  ownerId: string;
  snapshot: GoldStrategySnapshotUpsert;
}) {
  const ownerId = requireOwnerId(input.ownerId);
  const row = {
    owner_id: ownerId,
    as_of_date: input.snapshot.asOfDate,
    core_product: input.snapshot.coreProduct,
    tactical_product: input.snapshot.tacticalProduct,
    model_version: input.snapshot.modelVersion,
    data_quality: input.snapshot.dataQuality,
    inputs: input.snapshot.inputs,
    result: input.snapshot.result,
    input_hash: input.snapshot.inputHash,
    observed_at: input.snapshot.observedAt,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await input.client
    .from('gold_strategy_snapshots')
    .upsert(row, {
      onConflict:
        'owner_id,as_of_date,core_product,tactical_product,input_hash',
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapSnapshot(data as SnapshotRow);
}
