import { KOSPI52W_POLICY } from './policy';
import { generateSignal, screenCandidates } from './engine';
import type { Kospi52wBar } from './types';

export interface BacktestPoint { date: string; holdings: string[]; cashWeight: number; buyTickers: string[]; sellTickers: string[]; }

export function backtest(
  universeBars: Record<string, Kospi52wBar[]>,
  kospiBars: Kospi52wBar[],
  dates: string[], // 정렬된 거래일
): BacktestPoint[] {
  let holdings: string[] = [];
  const points: BacktestPoint[] = [];
  const barsByTicker = universeBars;
  for (const date of dates) {
    const candidates = screenCandidates(universeBars, kospiBars, date);
    const signal = generateSignal(holdings, candidates, barsByTicker, date);
    // 실제 수익은 다음 거래일부터 반영 — 홀딩은 당일 종가에 변경되지만 성과는 익일 반영 (미래정보 방지)
    holdings = [...signal.holdTickers, ...signal.buyTickers];
    // drift: 비중 재조정 없음 — holdings 유지, cash는 빈 슬롯
    const cashWeight = signal.cashSlots / KOSPI52W_POLICY.maxHoldings;
    points.push({ date, holdings: [...holdings], cashWeight, buyTickers: signal.buyTickers, sellTickers: signal.sellTickers });
  }
  return points;
}
