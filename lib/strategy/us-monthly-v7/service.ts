import { StrategyDataUnavailableError, type StrategyDataQuality } from '@/lib/strategy/data-quality';
import type { MonthlyBar } from '@/lib/strategy/monthly/types';
import { US_MONTHLY_POLICY } from './policy';

const MIN_REQUIRED_BARS = 253;
const PROVIDER_CONCURRENCY = 6;

interface Dependencies {
  getYahooDailyPrice: (ticker: string) => Promise<MonthlyBar[]>;
}

function normalize(rows: MonthlyBar[]) {
  return rows
    .map((row) => ({ ...row, date: row.date.slice(0, 10) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function mapWithConcurrency<T>(items: readonly T[], concurrency: number, handler: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await handler(items[index]);
    }
  }));
}

async function defaultDependencies(): Promise<Dependencies> {
  const { getYahooDailyPrice } = await import('@/lib/finance/providers/yahoo-api');
  return { getYahooDailyPrice };
}

export async function loadUsMonthlyDataset(targetBars = 520, injected?: Dependencies) {
  const dependencies = injected || await defaultDependencies();
  const warnings: string[] = [];
  let benchmarkBars: MonthlyBar[] = [];
  try {
    benchmarkBars = normalize(await dependencies.getYahooDailyPrice(US_MONTHLY_POLICY.benchmarkSymbol)).slice(-targetBars);
  } catch (error) {
    warnings.push(`SPY benchmark: Yahoo failed (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (benchmarkBars.length < MIN_REQUIRED_BARS) {
    throw new StrategyDataUnavailableError(`US monthly benchmark history is unavailable (${benchmarkBars.length}/${MIN_REQUIRED_BARS}).`);
  }
  const universeBars: Record<string, MonthlyBar[]> = {};
  await mapWithConcurrency(US_MONTHLY_POLICY.universe, PROVIDER_CONCURRENCY, async (asset) => {
    try {
      const rows = normalize(await dependencies.getYahooDailyPrice(asset.providerSymbol)).slice(-targetBars);
      if (rows.length >= MIN_REQUIRED_BARS) universeBars[asset.ticker] = rows;
      else warnings.push(`${asset.ticker}: Yahoo history is insufficient (${rows.length}/${MIN_REQUIRED_BARS}).`);
    } catch (error) {
      warnings.push(`${asset.ticker}: Yahoo failed (${error instanceof Error ? error.message : String(error)}).`);
    }
  });
  const available = Object.keys(universeBars).length;
  const requested = US_MONTHLY_POLICY.universe.length;
  if (available === 0) throw new StrategyDataUnavailableError('US monthly sector universe history is unavailable.');
  if (US_MONTHLY_POLICY.crashTarget?.ticker === US_MONTHLY_POLICY.benchmarkSymbol) {
    universeBars[US_MONTHLY_POLICY.crashTarget.ticker] = benchmarkBars;
  }
  const quality: StrategyDataQuality = {
    status: available === requested ? 'VALID' : 'DEGRADED',
    asOf: benchmarkBars.at(-1)!.date,
    requested,
    available,
    warnings,
  };
  return { universeBars, benchmarkBars, quality };
}
