import type { Trade } from '../../../types/index.ts';

function pnl(trade: Trade) {
  return Number(trade.metrics?.realizedPnL ?? trade.result_amount ?? 0) || 0;
}

export function calculatePerformanceAttribution(trades: Trade[], startingEquity: number) {
  const completed = trades.filter((trade) => trade.status === 'COMPLETED');
  const totalPnl = completed.reduce((sum, trade) => sum + pnl(trade), 0);
  const returns = completed.map((trade) => startingEquity > 0 ? pnl(trade) / startingEquity : 0);
  const wins = completed.filter((trade) => pnl(trade) > 0);
  const losses = completed.filter((trade) => pnl(trade) < 0);
  const grossWin = wins.reduce((sum, trade) => sum + pnl(trade), 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + pnl(trade), 0));
  const attribution = new Map<string, number>();
  for (const trade of completed) {
    const key = trade.risk_strategy || 'UNCLASSIFIED';
    attribution.set(key, (attribution.get(key) || 0) + pnl(trade));
  }
  let peak = 0;
  let curve = 0;
  let maxDrawdown = 0;
  for (const trade of completed) {
    curve += pnl(trade);
    peak = Math.max(peak, curve);
    maxDrawdown = Math.max(maxDrawdown, peak - curve);
  }
  return {
    totalPnl,
    twr: startingEquity > 0 ? Number((totalPnl / startingEquity * 100).toFixed(2)) : null,
    mwr: null,
    benchmarkReturn: null,
    expectancy: completed.length ? Number((totalPnl / completed.length).toFixed(2)) : 0,
    hitRate: completed.length ? Number((wins.length / completed.length * 100).toFixed(2)) : 0,
    payoffRatio: grossLoss > 0 && losses.length ? Number(((grossWin / Math.max(wins.length, 1)) / (grossLoss / losses.length)).toFixed(2)) : null,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    attribution: Array.from(attribution, ([strategy, value]) => ({ strategy, value: Number(value.toFixed(2)) })),
    riskAttribution: [],
    dataQuality: returns.length && startingEquity > 0 ? 'PARTIAL' : 'INSUFFICIENT_DATA',
    limitations: ['현금흐름과 일별 평가액이 완전하지 않아 TWR은 단순 근사치이며 MWR·벤치마크·위험 귀속은 판정 보류입니다.'],
  };
}
