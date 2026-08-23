import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { US52W_UNIVERSE_DEDUPED } from './policy';
import type { Bar } from './types';
function norm(rows: { date: string; open:number; high:number; low:number; close:number; volume:number }[]): Bar[] {
  return rows.map(r=>({ ...r, date:r.date.slice(0,10) })).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.close>0).sort((a,b)=>a.date.localeCompare(b.date));
}
export async function loadUs52wDataset(bars=400){
  const universe: Record<string, Bar[]> = {};
  for(const u of US52W_UNIVERSE_DEDUPED){
    try{ const y=await getYahooDailyPrice(u.ticker); universe[u.ticker]=norm(y as Bar[]).slice(-bars); }catch{}
  }
  let spy: Bar[]=[]; try{ spy=norm(await getYahooDailyPrice('SPY') as Bar[]).slice(-bars);}catch{}
  return { universeBars: universe, spyBars: spy };
}
