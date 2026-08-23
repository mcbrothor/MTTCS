import { KOSPI52W_POLICY, KOSPI52W_UNIVERSE } from './policy';
import type { Kospi52wBar, Kospi52wCandidate, Kospi52wSignal } from './types';

const NAME_MAP = new Map<string, string>(KOSPI52W_UNIVERSE.map(u => [u.ticker, u.name] as [string, string]));

function ma(bars: Kospi52wBar[], period: number): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  return slice.reduce((s, b) => s + b.close, 0) / period;
}

// 6M RS = (ETF 126일 수익률 - KOSPI 126일 수익률)
export function calcRs(etfBars: Kospi52wBar[], kospiBars: Kospi52wBar[], lookback = 126): number | null {
  if (etfBars.length < lookback + 1 || kospiBars.length < lookback + 1) return null;
  const etfNow = etfBars.at(-1)!.close;
  const etfPrev = etfBars[etfBars.length - 1 - lookback].close;
  const kospiNow = kospiBars.at(-1)!.close;
  const kospiPrev = kospiBars[kospiBars.length - 1 - lookback].close;
  if (!etfPrev || !kospiPrev) return null;
  const etfRet = etfNow / etfPrev - 1;
  const kospiRet = kospiNow / kospiPrev - 1;
  return (etfRet - kospiRet) * 100; // %p
}

export function is52wHigh(bars: Kospi52wBar[], lookback = 252): boolean {
  if (bars.length < lookback + 1) return false;
  const todayClose = bars.at(-1)!.close;
  const priorHigh = Math.max(...bars.slice(-lookback - 1, -1).map(b => b.high));
  return todayClose > priorHigh;
}

export function high252(bars: Kospi52wBar[]): number {
  return Math.max(...bars.map(b => b.high));
}

export function screenCandidates(
  universeBars: Record<string, Kospi52wBar[]>,
  kospiBars: Kospi52wBar[],
  asOf: string,
): Kospi52wCandidate[] {
  const candidates: Kospi52wCandidate[] = [];
  for (const [ticker, bars] of Object.entries(universeBars)) {
    const filtered = bars.filter(b => b.date <= asOf);
    const kospiFiltered = kospiBars.filter(b => b.date <= asOf);
    const rs = calcRs(filtered, kospiFiltered, KOSPI52W_POLICY.rsLookbackDays);
    if (rs === null) continue;
    const ma10Val = ma(filtered, KOSPI52W_POLICY.maPeriod);
    const close = filtered.at(-1)?.close ?? 0;
    candidates.push({
      ticker,
      name: NAME_MAP.get(ticker) ?? ticker,
      rs,
      isNewHigh: is52wHigh(filtered, KOSPI52W_POLICY.highLookbackDays),
      high252: high252(filtered),
      ma10: ma10Val,
      close,
    });
  }
  // RS Top12
  return candidates.sort((a, b) => b.rs - a.rs).slice(0, KOSPI52W_POLICY.rsTopN);
}

export function generateSignal(
  prevHoldings: string[],
  candidates: Kospi52wCandidate[],
  barsByTicker: Record<string, Kospi52wBar[]>,
  asOf: string,
): Kospi52wSignal {
  // Top12 중 신고가만 매수 후보
  const buyPool = candidates.filter(c => c.isNewHigh).map(c => c.ticker);
  // 기존 보유 중 MA10 이탈은 매도
  const sellTickers: string[] = [];
  const holdTickers: string[] = [];
  for (const t of prevHoldings) {
    const bars = (barsByTicker[t] || []).filter(b => b.date <= asOf);
    const m = ma(bars, KOSPI52W_POLICY.maPeriod);
    const close = bars.at(-1)?.close ?? 0;
    if (m !== null && close < m) sellTickers.push(t);
    else holdTickers.push(t);
  }
  // 재진입: RS Top12+신고가 재충족 시 재매수 (buyPool에 포함되면 자연 재매수)
  const availableSlots = KOSPI52W_POLICY.maxHoldings - holdTickers.length;
  const buyTickers = buyPool.filter(t => !holdTickers.includes(t)).slice(0, Math.max(0, availableSlots));
  const rsRank = candidates.map((c, i) => ({ ticker: c.ticker, name: c.name, rs: c.rs, rank: i + 1 }));
  const cashSlots = KOSPI52W_POLICY.maxHoldings - holdTickers.length - buyTickers.length;
  return { date: asOf, buyTickers, sellTickers, holdTickers, cashSlots, rsRank };
}
