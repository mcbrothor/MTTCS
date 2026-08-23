import type { Bar } from '@/lib/strategy/us-52w/types';
function ma(bars: Bar[], p:number){ if(bars.length<p) return null; return bars.slice(-p).reduce((s,b)=>s+b.close,0)/p; }
export function breadthUS(universe: Record<string, Bar[]>): number {
  let a=0,t=0; for(const bars of Object.values(universe)){ if(bars.length<120) continue; const m=ma(bars,120); if(m===null) continue; t++; if(bars.at(-1)!.close>m) a++; }
  return t? a/t*100:0;
}
export function nasdaqDominance(nasdaqBars: Bar[], spBars: Bar[]): boolean {
  if(nasdaqBars.length<200||spBars.length<126) return false;
  const nasdaqAbove = nasdaqBars.at(-1)!.close > (ma(nasdaqBars,200)??0);
  const rs = (nasdaqBars.at(-1)!.close/nasdaqBars[nasdaqBars.length-127].close) - (spBars.at(-1)!.close/spBars[spBars.length-127].close);
  return nasdaqAbove && rs>0.05;
}
