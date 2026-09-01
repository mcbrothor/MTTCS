import { StrategyDataUnavailableError, type StrategyDataQuality } from '@/lib/strategy/data-quality';
import type { MonthlyBar } from '@/lib/strategy/monthly/types';
import { KOSPI_MONTHLY_POLICY } from './policy';

const MIN_REQUIRED_BARS = 253;
const PROVIDER_CONCURRENCY = 3;
const KIS_ASSET_TIMEOUT_MS = 5_000;

interface Dependencies {
  getMarketDailyPrice: (
    ticker: string,
    exchange: string,
    bars: number,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) => Promise<MonthlyBar[]>;
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

async function loadKisBars(dependencies: Dependencies, ticker: string, targetBars: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`KIS monthly history timed out after ${KIS_ASSET_TIMEOUT_MS}ms.`)),
    KIS_ASSET_TIMEOUT_MS,
  );
  try {
    return await dependencies.getMarketDailyPrice(ticker, 'KOSPI', targetBars, {
      signal: controller.signal,
      timeoutMs: KIS_ASSET_TIMEOUT_MS,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function defaultDependencies(): Promise<Dependencies> {
  const [{ getMarketDailyPrice }, { getYahooDailyPrice }] = await Promise.all([
    import('@/lib/finance/providers/kis-api'),
    import('@/lib/finance/providers/yahoo-api'),
  ]);
  return { getMarketDailyPrice, getYahooDailyPrice };
}

export async function loadKospiMonthlyDataset(targetBars = 520, injected?: Dependencies) {
  const dependencies = injected || await defaultDependencies();
  const universeBars: Record<string, MonthlyBar[]> = {};
  const warnings: string[] = [];
  await mapWithConcurrency(KOSPI_MONTHLY_POLICY.universe, PROVIDER_CONCURRENCY, async (asset) => {
    try {
      const kis = normalize(await loadKisBars(dependencies, asset.ticker, targetBars));
      if (kis.length >= MIN_REQUIRED_BARS) {
        universeBars[asset.ticker] = kis.slice(-targetBars);
        return;
      }
      warnings.push(`${asset.ticker}: KIS history is insufficient (${kis.length}/${MIN_REQUIRED_BARS}).`);
    } catch (error) {
      warnings.push(`${asset.ticker}: KIS failed (${error instanceof Error ? error.message : String(error)}).`);
    }
    try {
      const yahoo = normalize(await dependencies.getYahooDailyPrice(asset.providerSymbol)).slice(-targetBars);
      if (yahoo.length >= MIN_REQUIRED_BARS) universeBars[asset.ticker] = yahoo;
      else warnings.push(`${asset.ticker}: Yahoo history is insufficient (${yahoo.length}/${MIN_REQUIRED_BARS}).`);
    } catch (error) {
      warnings.push(`${asset.ticker}: Yahoo failed (${error instanceof Error ? error.message : String(error)}).`);
    }
  });
  let benchmarkBars: MonthlyBar[] = [];
  try {
    benchmarkBars = normalize(await dependencies.getYahooDailyPrice(KOSPI_MONTHLY_POLICY.benchmarkSymbol)).slice(-targetBars);
  } catch (error) {
    warnings.push(`KOSPI benchmark: Yahoo failed (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (benchmarkBars.length < MIN_REQUIRED_BARS) {
    throw new StrategyDataUnavailableError(`KOSPI monthly benchmark history is unavailable (${benchmarkBars.length}/${MIN_REQUIRED_BARS}).`);
  }
  const available = Object.keys(universeBars).length;
  const requested = KOSPI_MONTHLY_POLICY.universe.length;
  const crashTarget = KOSPI_MONTHLY_POLICY.crashTarget;
  if (crashTarget && !universeBars[crashTarget.ticker]) {
    try {
      const kis = normalize(await loadKisBars(dependencies, crashTarget.ticker, targetBars));
      if (kis.length >= MIN_REQUIRED_BARS) universeBars[crashTarget.ticker] = kis.slice(-targetBars);
      else {
        const yahoo = normalize(await dependencies.getYahooDailyPrice(crashTarget.providerSymbol)).slice(-targetBars);
        if (yahoo.length >= MIN_REQUIRED_BARS) universeBars[crashTarget.ticker] = yahoo;
        else warnings.push(`${crashTarget.ticker}: crash target history is insufficient.`);
      }
    } catch (error) {
      warnings.push(`${crashTarget.ticker}: crash target failed (${error instanceof Error ? error.message : String(error)}).`);
    }
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
