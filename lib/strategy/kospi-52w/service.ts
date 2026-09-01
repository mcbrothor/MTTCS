import { KOSPI52W_UNIVERSE } from './policy';
import type { Kospi52wBar } from './types';
import { StrategyDataUnavailableError, type StrategyDataQuality } from '@/lib/strategy/data-quality';

const MIN_REQUIRED_BARS = 253;

interface Dependencies {
  getMarketDailyPrice: (ticker: string, exchange: string, bars: number) => Promise<Kospi52wBar[]>;
  getYahooDailyPrice: (ticker: string) => Promise<Kospi52wBar[]>;
}

function normalize(rows: { date: string; open: number; high: number; low: number; close: number; volume: number }[]): Kospi52wBar[] {
  return rows
    .map(r => ({ ...r, date: r.date.slice(0, 10) }))
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function defaultDependencies(): Promise<Dependencies> {
  const [{ getMarketDailyPrice }, { getYahooDailyPrice }] = await Promise.all([
    import('@/lib/finance/providers/kis-api'),
    import('@/lib/finance/providers/yahoo-api'),
  ]);
  return { getMarketDailyPrice, getYahooDailyPrice };
}

export async function loadKospi52wDataset(targetBars = 400, injected?: Dependencies) {
  const dependencies = injected || await defaultDependencies();
  const universeBars: Record<string, Kospi52wBar[]> = {};
  const warnings: string[] = [];
  for (const item of KOSPI52W_UNIVERSE) {
    try {
      const kis = normalize(await dependencies.getMarketDailyPrice(item.ticker, 'KOSPI', targetBars));
      if (kis.length >= MIN_REQUIRED_BARS) {
        universeBars[item.ticker] = kis.slice(-targetBars);
        continue;
      }
      warnings.push(`${item.ticker}: KIS history is insufficient (${kis.length}/${MIN_REQUIRED_BARS}).`);
    } catch (error) {
      warnings.push(`${item.ticker}: KIS failed (${error instanceof Error ? error.message : String(error)}).`);
    }
    try {
      const yahoo = normalize(await dependencies.getYahooDailyPrice(`${item.ticker}.KS`)).slice(-targetBars);
      if (yahoo.length >= MIN_REQUIRED_BARS) universeBars[item.ticker] = yahoo;
      else warnings.push(`${item.ticker}: Yahoo history is insufficient (${yahoo.length}/${MIN_REQUIRED_BARS}).`);
    } catch (error) {
      warnings.push(`${item.ticker}: Yahoo failed (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
  let kospiBars: Kospi52wBar[] = [];
  try {
    kospiBars = normalize(await dependencies.getYahooDailyPrice('^KS11')).slice(-targetBars);
  } catch (error) {
    warnings.push(`KOSPI benchmark: Yahoo failed (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (kospiBars.length < MIN_REQUIRED_BARS) {
    throw new StrategyDataUnavailableError(`KOSPI benchmark history is unavailable (${kospiBars.length}/${MIN_REQUIRED_BARS}).`);
  }
  const available = Object.keys(universeBars).length;
  if (available === 0) {
    throw new StrategyDataUnavailableError('KOSPI strategy universe history is unavailable.');
  }
  const quality: StrategyDataQuality = {
    status: available === KOSPI52W_UNIVERSE.length ? 'VALID' : 'DEGRADED',
    asOf: kospiBars.at(-1)!.date,
    requested: KOSPI52W_UNIVERSE.length,
    available,
    warnings,
  };
  return { universeBars, kospiBars, quality };
}
