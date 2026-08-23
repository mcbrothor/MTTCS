import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { KOSPI52W_UNIVERSE } from './policy';
import type { Kospi52wBar } from './types';

function normalize(rows: { date: string; open: number; high: number; low: number; close: number; volume: number }[]): Kospi52wBar[] {
  return rows
    .map(r => ({ ...r, date: r.date.slice(0, 10) }))
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function loadKospi52wDataset(targetBars = 400) {
  const universeBars: Record<string, Kospi52wBar[]> = {};
  for (const item of KOSPI52W_UNIVERSE) {
    try {
      const kis = await getMarketDailyPrice(item.ticker, 'KRX', targetBars);
      if (kis.length >= 260) {
        universeBars[item.ticker] = normalize(kis as Kospi52wBar[]);
        continue;
      }
    } catch {}
    // Yahoo fallback: interpret ticker as .KS
    try {
      const y = await getYahooDailyPrice(`${item.ticker}.KS`);
      universeBars[item.ticker] = normalize(y as Kospi52wBar[]).slice(-targetBars);
    } catch {}
  }
  // KOSPI 지수: ^KS11
  let kospiBars: Kospi52wBar[] = [];
  try {
    kospiBars = normalize(await getMarketDailyPrice('000020', 'KRX', targetBars) as Kospi52wBar[]);
  } catch {}
  if (kospiBars.length < 260) {
    try { kospiBars = normalize(await getYahooDailyPrice('^KS11') as Kospi52wBar[]).slice(-targetBars); } catch {}
  }
  return { universeBars, kospiBars };
}
