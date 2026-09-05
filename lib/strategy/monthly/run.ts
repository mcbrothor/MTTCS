import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/api/response';
import { isStrategyDataUnavailableError } from '@/lib/strategy/data-quality';
import { loadStrategyHoldings } from '@/lib/strategy/holdings';
import { KOSPI_MONTHLY_POLICY } from '@/lib/strategy/kospi-monthly/policy';
import { loadKospiMonthlyDataset } from '@/lib/strategy/kospi-monthly/service';
import { US_MONTHLY_POLICY } from '@/lib/strategy/us-monthly-v7/policy';
import { loadUsMonthlyDataset } from '@/lib/strategy/us-monthly-v7/service';
import { buildMonthlySnapshot } from './core';
import { loadLatestMonthlySnapshot, upsertMonthlySnapshot } from './repository';
import type { MonthlyMarket } from './types';

export interface MonthlyStrategyRunResult {
  snapshot: ReturnType<typeof buildMonthlySnapshot>;
  holdings: string[];
  inputHash: string | null;
  provider: string;
  source: string;
}

export async function runMonthlyStrategy(input: {
  client: SupabaseClient;
  ownerId: string;
  market: MonthlyMarket;
  strictPersistence?: boolean;
}): Promise<MonthlyStrategyRunResult> {
  const policy = input.market === 'KR' ? KOSPI_MONTHLY_POLICY : US_MONTHLY_POLICY;
  const provider = input.market === 'KR' ? 'KIS→Yahoo fallback' : 'Yahoo Finance';
  const source = input.market === 'KR'
    ? 'KOSPI 8-sector cluster-balanced Breadth MA120 + 3/6/12-1M momentum'
    : 'US 11-sector Breadth MA120 + 3/6/12-1M momentum';
  const tradableUniverse = [
    ...policy.universe.map((item) => item.ticker),
    ...(policy.crashTarget ? [policy.crashTarget.ticker] : []),
  ];
  let previousWarning: string | null = null;
  const previousPromise = loadLatestMonthlySnapshot({
    client: input.client,
    ownerId: input.ownerId,
    market: input.market,
  }).catch((error) => {
    previousWarning = `이전 월간 스냅샷 조회 실패: ${getErrorMessage(error, 'unknown')}`;
    return null;
  });
  const datasetPromise = input.market === 'KR'
    ? loadKospiMonthlyDataset(520)
    : loadUsMonthlyDataset(520);
  const [dataset, holdings, previous] = await Promise.all([
    datasetPromise,
    loadStrategyHoldings({ client: input.client, ownerId: input.ownerId, universe: tradableUniverse }),
    previousPromise,
  ]);
  const snapshot = buildMonthlySnapshot({
    policy,
    benchmarkBars: dataset.benchmarkBars,
    barsByTicker: dataset.universeBars,
    previousHoldings: holdings,
    previousRegime: previous?.regime?.regime,
  });
  snapshot.quality.warnings.push(
    ...dataset.quality.warnings,
    ...(previousWarning ? [previousWarning] : []),
  );

  let inputHash: string | null = null;
  if (snapshot.status === 'FINAL' && snapshot.quality.status === 'FULL') {
    try {
      ({ inputHash } = await upsertMonthlySnapshot({
        client: input.client,
        ownerId: input.ownerId,
        provider,
        snapshot,
      }));
    } catch (error) {
      if (input.strictPersistence) throw error;
      snapshot.quality.warnings.push(`월간 스냅샷 저장 실패: ${getErrorMessage(error, 'unknown')}`);
    }
  }
  return { snapshot, holdings, inputHash, provider, source };
}

export { isStrategyDataUnavailableError };
