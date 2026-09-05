import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MonthlyMarket, MonthlyStrategySnapshot } from './types';

type MonthlyRepositoryClient = Pick<SupabaseClient, 'from'>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function hashMonthlySnapshot(snapshot: MonthlyStrategySnapshot) {
  const stableSnapshot = {
    ...snapshot,
    quality: { ...snapshot.quality, warnings: [] },
  };
  return createHash('sha256').update(JSON.stringify(canonicalize(stableSnapshot))).digest('hex');
}

export async function loadLatestMonthlySnapshot(input: {
  client: MonthlyRepositoryClient;
  ownerId: string;
  market: MonthlyMarket;
}) {
  const { data, error } = await input.client
    .from('monthly_strategy_snapshots')
    .select('snapshot')
    .eq('owner_id', input.ownerId)
    .eq('market', input.market)
    .order('signal_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.snapshot as MonthlyStrategySnapshot | undefined) ?? null;
}

export async function upsertMonthlySnapshot(input: {
  client: MonthlyRepositoryClient;
  ownerId: string;
  provider: string;
  snapshot: MonthlyStrategySnapshot;
}) {
  if (!input.snapshot.signalAt) throw new Error('Monthly strategy snapshot signalAt is required.');
  const inputHash = hashMonthlySnapshot(input.snapshot);
  const row = {
    owner_id: input.ownerId,
    market: input.snapshot.market,
    signal_at: input.snapshot.signalAt,
    effective_at: input.snapshot.effectiveAt,
    model_version: input.snapshot.modelVersion,
    model_status: input.snapshot.modelStatus,
    signal_status: input.snapshot.status,
    provider: input.provider,
    quality: input.snapshot.quality.status,
    input_hash: inputHash,
    snapshot: input.snapshot,
    observed_at: input.snapshot.latestObservationAt || input.snapshot.signalAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = await input.client
    .from('monthly_strategy_snapshots')
    .upsert(row, { onConflict: 'owner_id,market,signal_at,model_version,input_hash' });
  if (error) throw error;
  return { inputHash };
}
