import { US52W_POLICY } from './policy';
import { generateSignal, screenCandidates } from './engine';
import type { Bar } from './types';
export function backtest(universe: Record<string, Bar[]>, spy: Bar[], dates: string[]){
  let holdings: string[]=[]; const out=[];
  for(const d of dates){
    const cands=screenCandidates(universe, spy, d);
    const sig=generateSignal(holdings, cands, universe, d);
    holdings=[...sig.holdTickers, ...sig.buyTickers];
    out.push({ date:d, holdings:[...holdings], cash:sig.cashSlots/US52W_POLICY.maxHoldings, buy:sig.buyTickers, sell:sig.sellTickers, watch:sig.watchTickers });
  }
  return out;
}
