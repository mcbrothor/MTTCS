import { round } from './_shared.ts';

export interface TradeRecord {
  id?: string;
  ticker: string;
  entryPrice: number;
  exitPrice: number;
  initialStopPrice: number;
  highestPriceWhileOpen?: number;
  lowestPriceWhileOpen?: number;
  direction?: 'LONG' | 'SHORT';
  pnl?: number;
  rMultiple?: number; // 사후 확정 R-Multiple
}

export interface ExpectancyResult {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  scratchTrades: number; // 손익 0 근처
  winRate: number; // 0 ~ 1 (예: 0.55 = 55%)
  lossRate: number;
  avgWinR: number;
  avgLossR: number;
  winLossRatio: number; // avgWinR / avgLossR
  expectancyR: number; // (WinRate * AvgWinR) - (LossRate * AvgLossR)
  profitFactor: number;
  grade: 'EXCELLENT' | 'GOOD' | 'NEUTRAL' | 'POOR';
}

export interface MaeMfeResult {
  maePercent: number; // 최대 불리 변동 (%)
  maeR: number; // 최대 불리 변동 (R-단위)
  mfePercent: number; // 최대 유리 변동 (%)
  mfeR: number; // 최대 유리 변동 (R-단위)
  efficiencyRatio: number; // 실현 R / MFE R (익절 효율성, 0 ~ 1)
  stopLossAdequacy: 'SAFE' | 'DANGEROUS' | 'OPTIMAL';
}

export interface RDistributionBucket {
  rangeLabel: string;
  count: number;
  percentage: number;
}

/**
 * 트레이더의 실질 수익 기대값 (Expectancy) 및 통계 분석
 */
export function calculateTradeExpectancy(trades: TradeRecord[]): ExpectancyResult {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      scratchTrades: 0,
      winRate: 0,
      lossRate: 0,
      avgWinR: 0,
      avgLossR: 0,
      winLossRatio: 0,
      expectancyR: 0,
      profitFactor: 0,
      grade: 'POOR',
    };
  }

  let winCount = 0;
  let lossCount = 0;
  let scratchCount = 0;
  let totalWinR = 0;
  let totalLossR = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const trade of trades) {
    const riskPerShare = Math.max(0.0001, Math.abs(trade.entryPrice - trade.initialStopPrice));
    const isLong = (trade.direction ?? 'LONG') === 'LONG';
    const rawR = typeof trade.rMultiple === 'number'
      ? trade.rMultiple
      : isLong
      ? (trade.exitPrice - trade.entryPrice) / riskPerShare
      : (trade.entryPrice - trade.exitPrice) / riskPerShare;

    const r = round(rawR, 2);

    if (r > 0.05) {
      winCount++;
      totalWinR += r;
      grossProfit += trade.pnl !== undefined ? Math.max(0, trade.pnl) : r;
    } else if (r < -0.05) {
      lossCount++;
      totalLossR += Math.abs(r);
      grossLoss += trade.pnl !== undefined ? Math.abs(Math.min(0, trade.pnl)) : Math.abs(r);
    } else {
      scratchCount++;
    }
  }

  const totalTrades = trades.length;
  const winRate = round(winCount / totalTrades, 4);
  const lossRate = round(lossCount / totalTrades, 4);

  const avgWinR = winCount > 0 ? round(totalWinR / winCount, 2) : 0;
  const avgLossR = lossCount > 0 ? round(totalLossR / lossCount, 2) : 0;

  const winLossRatio = avgLossR > 0 ? round(avgWinR / avgLossR, 2) : avgWinR > 0 ? 99 : 0;
  const expectancyR = round(winRate * avgWinR - lossRate * avgLossR, 2);
  const profitFactor = grossLoss > 0 ? round(grossProfit / grossLoss, 2) : grossProfit > 0 ? 99 : 0;

  let grade: ExpectancyResult['grade'] = 'POOR';
  if (expectancyR >= 0.5 && profitFactor >= 2.0) {
    grade = 'EXCELLENT';
  } else if (expectancyR >= 0.2 && profitFactor >= 1.4) {
    grade = 'GOOD';
  } else if (expectancyR >= 0 && profitFactor >= 1.0) {
    grade = 'NEUTRAL';
  }

  return {
    totalTrades,
    winTrades: winCount,
    lossTrades: lossCount,
    scratchTrades: scratchCount,
    winRate,
    lossRate,
    avgWinR,
    avgLossR,
    winLossRatio,
    expectancyR,
    profitFactor,
    grade,
  };
}

/**
 * MAE (최대 불리 변동) 및 MFE (최대 유리 변동) 정량 분석
 */
export function calculateMaeMfe(trade: TradeRecord): MaeMfeResult {
  const isLong = (trade.direction ?? 'LONG') === 'LONG';
  const entry = trade.entryPrice;
  const initialStop = trade.initialStopPrice;
  const riskPerShare = Math.max(0.0001, Math.abs(entry - initialStop));

  const highest = trade.highestPriceWhileOpen ?? Math.max(trade.entryPrice, trade.exitPrice);
  const lowest = trade.lowestPriceWhileOpen ?? Math.min(trade.entryPrice, trade.exitPrice);

  let maeDistance = 0;
  let mfeDistance = 0;

  if (isLong) {
    maeDistance = Math.max(0, entry - lowest);
    mfeDistance = Math.max(0, highest - entry);
  } else {
    maeDistance = Math.max(0, highest - entry);
    mfeDistance = Math.max(0, entry - lowest);
  }

  const maePercent = round((maeDistance / entry) * 100, 2);
  const maeR = round(maeDistance / riskPerShare, 2);

  const mfePercent = round((mfeDistance / entry) * 100, 2);
  const mfeR = round(mfeDistance / riskPerShare, 2);

  const actualR = typeof trade.rMultiple === 'number'
    ? trade.rMultiple
    : isLong
    ? (trade.exitPrice - entry) / riskPerShare
    : (entry - trade.exitPrice) / riskPerShare;

  const efficiencyRatio = mfeR > 0 ? round(Math.max(0, actualR) / mfeR, 2) : actualR > 0 ? 1 : 0;

  let stopLossAdequacy: MaeMfeResult['stopLossAdequacy'] = 'OPTIMAL';
  if (maeR >= 0.9) {
    stopLossAdequacy = 'DANGEROUS'; // 손절선에 극도로 근접
  } else if (maeR <= 0.3 && actualR >= 1.5) {
    stopLossAdequacy = 'SAFE'; // 노이즈 없이 순항
  }

  return {
    maePercent,
    maeR,
    mfePercent,
    mfeR,
    efficiencyRatio,
    stopLossAdequacy,
  };
}

/**
 * 손익의 R-Multiple 분포 히스토그램 데이터 생성
 */
export function computeRMultipleDistribution(trades: TradeRecord[]): RDistributionBucket[] {
  const buckets = [
    { label: '< -1.0R', min: -Infinity, max: -1.0, count: 0 },
    { label: '-1.0R ~ 0.0R', min: -1.0, max: 0.0, count: 0 },
    { label: '0.0R ~ +1.0R', min: 0.0, max: 1.0, count: 0 },
    { label: '+1.0R ~ +2.0R', min: 1.0, max: 2.0, count: 0 },
    { label: '+2.0R ~ +3.0R', min: 2.0, max: 3.0, count: 0 },
    { label: '> +3.0R', min: 3.0, max: Infinity, count: 0 },
  ];

  if (!trades || trades.length === 0) {
    return buckets.map((b) => ({ rangeLabel: b.label, count: 0, percentage: 0 }));
  }

  for (const trade of trades) {
    const riskPerShare = Math.max(0.0001, Math.abs(trade.entryPrice - trade.initialStopPrice));
    const isLong = (trade.direction ?? 'LONG') === 'LONG';
    const r = typeof trade.rMultiple === 'number'
      ? trade.rMultiple
      : isLong
      ? (trade.exitPrice - trade.entryPrice) / riskPerShare
      : (trade.entryPrice - trade.exitPrice) / riskPerShare;

    for (const bucket of buckets) {
      if (r >= bucket.min && r < bucket.max) {
        bucket.count++;
        break;
      }
    }
  }

  const total = trades.length;
  return buckets.map((b) => ({
    rangeLabel: b.label,
    count: b.count,
    percentage: round((b.count / total) * 100, 1),
  }));
}
