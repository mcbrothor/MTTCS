import { US52W_POLICY } from './policy';
import type { Bar, Candidate, Signal } from './types';
function ma(bars: Bar[], p: number): number | null { if (bars.length < p) return null; return bars.slice(-p).reduce((s,b)=>s+b.close,0)/p; }
function calcRs(etf: Bar[], spy: Bar[], lb=126): number|null {
  if (etf.length < lb+1 || spy.length < lb+1) return null;
  const eNow=etf.at(-1)!.close, ePrev=etf[etf.length-1-lb].close, sNow=spy.at(-1)!.close, sPrev=spy[spy.length-1-lb].close;
  return (eNow/ePrev - sNow/sPrev)*100;
}
function isNewHigh(bars: Bar[], lb=252): boolean {
  if (bars.length < lb+1) return false;
  const c=bars.at(-1)!.close; const prior=Math.max(...bars.slice(-lb-1,-1).map(b=>b.high));
  return c>prior;
}
function distToHigh(bars: Bar[]): number {
  const c=bars.at(-1)!.close; const h=Math.max(...bars.map(b=>b.high));
  return h? (c/h-1)*100:0;
}
export function screenCandidates(universe: Record<string, Bar[]>, spy: Bar[], asOf: string): Candidate[] {
  const out: Candidate[]=[];
  for (const [ticker,bars] of Object.entries(universe)){
    const f=bars.filter(b=>b.date<=asOf); const s=spy.filter(b=>b.date<=asOf);
    const rs=calcRs(f,s,US52W_POLICY.rsLookbackDays); if(rs===null) continue;
    const m=ma(f,US52W_POLICY.maPeriod); const close=f.at(-1)?.close??0;
    out.push({ ticker, rs, isNewHigh:isNewHigh(f), ma10:m, close, distanceToHighPct: distToHigh(f) });
  }
  return out.sort((a,b)=>b.rs-a.rs).slice(0, US52W_POLICY.rsTopN);
}
export function generateSignal(prev:string[], cands:Candidate[], bars:Record<string,Bar[]>, asOf:string): Signal {
  const buyPool=cands.filter(c=>c.isNewHigh).map(c=>c.ticker);
  const sell: string[]=[]; const hold: string[]=[];
  for(const t of prev){
    const b=(bars[t]||[]).filter(x=>x.date<=asOf); const m=ma(b,US52W_POLICY.maPeriod); const close=b.at(-1)?.close??0;
    if(m!==null && close < m) sell.push(t); else hold.push(t);
  }
  const avail=US52W_POLICY.maxHoldings - hold.length;
  const buy=buyPool.filter(t=>!hold.includes(t)).slice(0, Math.max(0,avail));
  // WATCH: -1/-3/-5% 이내 후보 사전 감시 (매도 아님)
  const watch=cands.filter(c=>!buy.includes(c.ticker) && !hold.includes(c.ticker) && c.distanceToHighPct >= -5 && c.distanceToHighPct <0).map(c=>c.ticker).slice(0,6);
  const rsRank=cands.map((c,i)=>({ticker:c.ticker, rs:c.rs}));
  const cash=US52W_POLICY.maxHoldings - hold.length - buy.length;
  return { date:asOf, buyTickers:buy, sellTickers:sell, holdTickers:hold, watchTickers:watch, cashSlots:cash, rsRank };
}
