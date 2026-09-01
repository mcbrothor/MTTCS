import { US52W_UNIVERSE_DEDUPED } from './policy';
import type { Bar } from './types';
import { StrategyDataUnavailableError, type StrategyDataQuality } from '@/lib/strategy/data-quality';

const MIN_REQUIRED_BARS = 253;
const PROVIDER_CONCURRENCY = 6;

interface Dependencies { getYahooDailyPrice: (ticker: string) => Promise<Bar[]> }

function norm(rows: { date: string; open:number; high:number; low:number; close:number; volume:number }[]): Bar[] {
  return rows.map(r=>({ ...r, date:r.date.slice(0,10) })).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.close>0).sort((a,b)=>a.date.localeCompare(b.date));
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

export async function loadUs52wDataset(bars=400, injected?: Dependencies){
  const dependencies = injected || await defaultDependencies();
  const universe: Record<string, Bar[]> = {};
  const warnings: string[] = [];
  let spy: Bar[]=[];
  try {
    spy = norm(await dependencies.getYahooDailyPrice('SPY')).slice(-bars);
  } catch (error) {
    warnings.push(`SPY benchmark: Yahoo failed (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (spy.length < MIN_REQUIRED_BARS) {
    throw new StrategyDataUnavailableError(`SPY benchmark history is unavailable (${spy.length}/${MIN_REQUIRED_BARS}).`);
  }
  await mapWithConcurrency(US52W_UNIVERSE_DEDUPED, PROVIDER_CONCURRENCY, async (item) => {
    try {
      const rows = item.ticker === 'SPY'
        ? spy
        : norm(await dependencies.getYahooDailyPrice(item.ticker)).slice(-bars);
      if (rows.length >= MIN_REQUIRED_BARS) universe[item.ticker] = rows;
      else warnings.push(`${item.ticker}: Yahoo history is insufficient (${rows.length}/${MIN_REQUIRED_BARS}).`);
    } catch (error) {
      warnings.push(`${item.ticker}: Yahoo failed (${error instanceof Error ? error.message : String(error)}).`);
    }
  });
  const available = Object.keys(universe).length;
  if (available === 0) throw new StrategyDataUnavailableError('US strategy universe history is unavailable.');
  const quality: StrategyDataQuality = {
    status: available === US52W_UNIVERSE_DEDUPED.length ? 'VALID' : 'DEGRADED',
    asOf: spy.at(-1)!.date,
    requested: US52W_UNIVERSE_DEDUPED.length,
    available,
    warnings,
  };
  return { universeBars: universe, spyBars: spy, quality };
}
