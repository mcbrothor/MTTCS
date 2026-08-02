import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NasdaqCurrency,
  NasdaqProductCode,
  NasdaqQualityStatus,
  NasdaqTacticalProduct,
} from './types';

export type NasdaqRepositoryClient = Pick<SupabaseClient, 'from'>;

export interface NasdaqSettingsRecord {
  ownerId: string;
  tacticalProduct: NasdaqTacticalProduct;
  baseCurrency: NasdaqCurrency;
  manualAccountValue: number | null;
  externalNasdaqValue: number;
  tqqqOptIn: boolean;
  riskPaused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NasdaqSettingsPatch {
  tacticalProduct?: NasdaqTacticalProduct;
  baseCurrency?: NasdaqCurrency;
  manualAccountValue?: number | null;
  externalNasdaqValue?: number;
  tqqqOptIn?: boolean;
  riskPaused?: boolean;
}

export interface NasdaqProductMetadataRecord {
  product: NasdaqProductCode;
  leverageMultiple: 1 | 2 | 3;
  grossExpenseRatioPct: number;
  netExpenseRatioPct: number;
  effectiveDate: string;
  reviewAfter: string;
  sourceUrl: string;
  approvedAt: string;
  updatedAt: string;
}

export interface NasdaqSnapshotRecord {
  id: string;
  ownerId: string;
  asOfDate: string;
  tacticalProduct: NasdaqTacticalProduct;
  modelVersion: string;
  dataQuality: 'READY' | 'DEGRADED' | 'BLOCKED';
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  inputHash: string;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface SettingsRow {
  owner_id: string;
  tactical_product: NasdaqTacticalProduct;
  base_currency: NasdaqCurrency;
  manual_account_value?: number | string | null;
  external_nasdaq_value: number | string;
  tqqq_opt_in: boolean;
  risk_paused: boolean;
  created_at: string;
  updated_at: string;
}

interface MetadataRow {
  product: NasdaqProductCode;
  leverage_multiple: 1 | 2 | 3;
  gross_expense_ratio_pct: number | string;
  net_expense_ratio_pct: number | string;
  effective_date: string;
  review_after: string;
  source_url: string;
  approved_at: string;
  updated_at: string;
}

interface SnapshotRow {
  id: string;
  owner_id: string;
  as_of_date: string;
  tactical_product: NasdaqTacticalProduct;
  model_version: string;
  data_quality: 'READY' | 'DEGRADED' | 'BLOCKED';
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  input_hash: string;
  observed_at: string;
  created_at: string;
  updated_at: string;
}

function ownerId(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error('Nasdaq repository ownerId is required.');
  return normalized;
}

function numeric(value: number | string, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value for ${field}.`);
  return parsed;
}

function mapSettings(row: SettingsRow): NasdaqSettingsRecord {
  return {
    ownerId: row.owner_id,
    tacticalProduct: row.tactical_product,
    baseCurrency: row.base_currency,
    manualAccountValue: row.manual_account_value === null
      || row.manual_account_value === undefined
      ? null
      : numeric(row.manual_account_value, 'manual_account_value'),
    externalNasdaqValue: numeric(row.external_nasdaq_value, 'external_nasdaq_value'),
    tqqqOptIn: row.tqqq_opt_in,
    riskPaused: row.risk_paused,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMetadata(row: MetadataRow): NasdaqProductMetadataRecord {
  return {
    product: row.product,
    leverageMultiple: row.leverage_multiple,
    grossExpenseRatioPct: numeric(row.gross_expense_ratio_pct, 'gross_expense_ratio_pct'),
    netExpenseRatioPct: numeric(row.net_expense_ratio_pct, 'net_expense_ratio_pct'),
    effectiveDate: row.effective_date,
    reviewAfter: row.review_after,
    sourceUrl: row.source_url,
    approvedAt: row.approved_at,
    updatedAt: row.updated_at,
  };
}

function mapSnapshot(row: SnapshotRow): NasdaqSnapshotRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    asOfDate: row.as_of_date,
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

export async function getNasdaqSettings(input: {
  client: NasdaqRepositoryClient;
  ownerId: string;
}) {
  const { data, error } = await input.client
    .from('nasdaq_strategy_settings')
    .select('*')
    .eq('owner_id', ownerId(input.ownerId))
    .maybeSingle();
  if (error) throw error;
  return data ? mapSettings(data as SettingsRow) : null;
}

export async function upsertNasdaqSettings(input: {
  client: NasdaqRepositoryClient;
  ownerId: string;
  settings: NasdaqSettingsPatch;
}) {
  const row: Record<string, unknown> = {
    owner_id: ownerId(input.ownerId),
    updated_at: new Date().toISOString(),
  };
  if (input.settings.tacticalProduct !== undefined) {
    row.tactical_product = input.settings.tacticalProduct;
  }
  if (input.settings.baseCurrency !== undefined) row.base_currency = input.settings.baseCurrency;
  if (input.settings.manualAccountValue !== undefined) {
    row.manual_account_value = input.settings.manualAccountValue;
  }
  if (input.settings.externalNasdaqValue !== undefined) {
    row.external_nasdaq_value = input.settings.externalNasdaqValue;
  }
  if (input.settings.tqqqOptIn !== undefined) row.tqqq_opt_in = input.settings.tqqqOptIn;
  if (input.settings.riskPaused !== undefined) row.risk_paused = input.settings.riskPaused;
  const { data, error } = await input.client
    .from('nasdaq_strategy_settings')
    .upsert(row, { onConflict: 'owner_id' })
    .select('*')
    .single();
  if (error) throw error;
  return mapSettings(data as SettingsRow);
}

export async function listNasdaqProductMetadata(input: {
  client: NasdaqRepositoryClient;
}) {
  const { data, error } = await input.client
    .from('nasdaq_product_metadata')
    .select('*')
    .order('product', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapMetadata(row as MetadataRow));
}

export async function upsertNasdaqProductMetadata(input: {
  client: NasdaqRepositoryClient;
  metadata: Omit<NasdaqProductMetadataRecord, 'approvedAt' | 'updatedAt'> & {
    approvedAt?: string;
  };
}) {
  const row = {
    product: input.metadata.product,
    leverage_multiple: input.metadata.leverageMultiple,
    gross_expense_ratio_pct: input.metadata.grossExpenseRatioPct,
    net_expense_ratio_pct: input.metadata.netExpenseRatioPct,
    effective_date: input.metadata.effectiveDate,
    review_after: input.metadata.reviewAfter,
    source_url: input.metadata.sourceUrl,
    approved_at: input.metadata.approvedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await input.client
    .from('nasdaq_product_metadata')
    .upsert(row, { onConflict: 'product' })
    .select('*')
    .single();
  if (error) throw error;
  return mapMetadata(data as MetadataRow);
}

export async function listNasdaqSnapshots(input: {
  client: NasdaqRepositoryClient;
  ownerId: string;
  product?: NasdaqTacticalProduct;
  limit?: number;
}) {
  let query = input.client
    .from('nasdaq_strategy_snapshots')
    .select('*')
    .eq('owner_id', ownerId(input.ownerId))
    .order('as_of_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.floor(input.limit ?? 30))));
  if (input.product) query = query.eq('tactical_product', input.product);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapSnapshot(row as SnapshotRow));
}

export async function upsertNasdaqSnapshot(input: {
  client: NasdaqRepositoryClient;
  ownerId: string;
  snapshot: {
    asOfDate: string;
    tacticalProduct: NasdaqTacticalProduct;
    modelVersion: string;
    dataQuality: Exclude<NasdaqQualityStatus, 'VALID'> | 'READY';
    inputs: Record<string, unknown>;
    result: Record<string, unknown>;
    inputHash: string;
    observedAt: string;
  };
}) {
  const row = {
    owner_id: ownerId(input.ownerId),
    as_of_date: input.snapshot.asOfDate,
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
    .from('nasdaq_strategy_snapshots')
    .upsert(row, { onConflict: 'owner_id,as_of_date,model_version,input_hash' })
    .select('*')
    .single();
  if (error) throw error;
  return mapSnapshot(data as SnapshotRow);
}
