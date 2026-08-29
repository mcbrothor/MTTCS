import type { Bar } from '@/lib/strategy/us-52w/types';

function ma(bars: Bar[], p: number) {
  if (bars.length < p) return null;
  return bars.slice(-p).reduce((s, b) => s + b.close, 0) / p;
}

export function rs6m(etf: Bar[], kospi: Bar[]) {
  if (etf.length < 126 || kospi.length < 126) return null;
  return (etf.at(-1)!.close / etf[etf.length - 127].close) - (kospi.at(-1)!.close / kospi[kospi.length - 127].close);
}
export function breadth(universe: Record<string, Bar[]>): number {
  let above=0, total=0;
  for(const bars of Object.values(universe)){
    if(bars.length<120) continue;
    const m=ma(bars,120); if(m===null) continue;
    total++; if(bars.at(-1)!.close > m) above++;
  }
  return total? (above/total)*100:0;
}
export function decideRegime(breadthVal: number, dd: number, rsAvg: number|null){
  if(breadthVal>=60) return { regime:'TREND', weight:100 };
  if(breadthVal>=40){
    // 비추세: RS 강도에 따라 25/50/75/100
    const avg = rsAvg ?? 0;
    if(avg>0.05) return { regime:'NON_TREND_STRONG', weight:100 };
    if(avg>0.02) return { regime:'NON_TREND', weight:50 };
    return { regime:'NON_TREND_WEAK', weight:25 };
  }
  if(breadthVal>=30) return { regime:'RECOVERY', weight:50 };
  if(dd<=-24) return { regime:'CRASH_100', weight:100 };
  if(dd<=-18) return { regime:'CRASH_75', weight:75 };
  if(dd<=-12) return { regime:'CRASH_50', weight:50 };
  return { regime:'CASH', weight:0 };
}
