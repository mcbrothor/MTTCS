import type { Trade, TradeExecution, TradeMetrics, TradeStatus } from '@/types';

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateTradeMetrics(
  trade: Pick<
    Trade,
    | 'entry_price'
    | 'exit_price'
    | 'planned_risk'
    | 'result_amount'
    | 'stoploss_price'
    | 'total_shares'
    | 'position_size'
  >,
  executions: TradeExecution[] = [],
  currentPrice: number | null = null
): TradeMetrics {
  const normalized = executions
    .filter((execution) => Number.isFinite(Number(execution.price)) && Number.isFinite(Number(execution.shares)))
    .map((execution, orderIndex) => ({
      ...execution,
      orderIndex,
      price: Number(execution.price),
      shares: Number(execution.shares),
      fees: Number(execution.fees || 0),
    }));

  const orderedExecutions = [...normalized].sort((a, b) => {
    const executedDiff = new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime();
    if (executedDiff !== 0) return executedDiff;
    const createdDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.orderIndex - b.orderIndex;
  });
  const entries = orderedExecutions.filter((execution) => execution.side === 'ENTRY');
  const exits = orderedExecutions.filter((execution) => execution.side === 'EXIT');
  const entryShares = entries.reduce((sum, execution) => sum + execution.shares, 0);
  const exitShares = exits.reduce((sum, execution) => sum + execution.shares, 0);
  const entryValue = entries.reduce((sum, execution) => sum + execution.price * execution.shares, 0);
  const exitValue = exits.reduce((sum, execution) => sum + execution.price * execution.shares, 0);
  const fees = normalized.reduce((sum, execution) => sum + execution.fees, 0);
  const hasExecutions = normalized.length > 0;
  const historicalAvgEntryPrice = entryShares > 0 ? entryValue / entryShares : finiteNumber(trade.entry_price);
  const avgExitPrice = exitShares > 0 ? exitValue / exitShares : finiteNumber(trade.exit_price);
  const plannedRisk = finiteNumber(trade.planned_risk);
  const plannedShares = finiteNumber(trade.total_shares ?? trade.position_size);
  const plannedEntry = finiteNumber(trade.entry_price);
  const stopLoss = finiteNumber(trade.stoploss_price);

  let runningShares = 0;
  let runningCost = 0;
  let realizedGross = 0;
  let invalidExitShares = false;

  for (const execution of orderedExecutions) {
    if (execution.side === 'ENTRY') {
      runningShares += execution.shares;
      runningCost += execution.price * execution.shares;
      continue;
    }

    const avgCost = runningShares > 0 ? runningCost / runningShares : historicalAvgEntryPrice;
    const closedShares = Math.min(execution.shares, runningShares);
    if (execution.shares > runningShares) invalidExitShares = true;
    if (closedShares > 0 && avgCost !== null) {
      realizedGross += (execution.price - avgCost) * closedShares;
      runningCost = Math.max(0, runningCost - avgCost * closedShares);
      runningShares = Math.max(0, runningShares - closedShares);
    }
  }

  const netShares = runningShares;
  const avgEntryPrice = netShares > 0
    ? runningCost / netShares
    : historicalAvgEntryPrice;

  const realizedPnL = hasExecutions ? realizedGross - fees : finiteNumber(trade.result_amount);

  const rMultiple = realizedPnL !== null && plannedRisk && plannedRisk > 0 ? realizedPnL / plannedRisk : null;
  const entrySlippagePct =
    avgEntryPrice !== null && plannedEntry && plannedEntry > 0
      ? ((avgEntryPrice - plannedEntry) / plannedEntry) * 100
      : null;
  const executionProgressPct =
    plannedShares && plannedShares > 0 ? Math.min((entryShares / plannedShares) * 100, 100) : hasExecutions ? 100 : 0;
  const openRisk =
    netShares > 0 && avgEntryPrice !== null && stopLoss !== null ? Math.max(avgEntryPrice - stopLoss, 0) * netShares : 0;

  const unrealizedPnL =
    netShares > 0 && avgEntryPrice !== null && currentPrice !== null
      ? (currentPrice - avgEntryPrice) * netShares
      : null;
  const unrealizedR =
    unrealizedPnL !== null && plannedRisk && plannedRisk > 0 ? unrealizedPnL / plannedRisk : null;

  return {
    entryShares: round(entryShares, 4),
    exitShares: round(exitShares, 4),
    netShares: round(netShares, 4),
    avgEntryPrice: avgEntryPrice === null ? null : round(avgEntryPrice, 4),
    historicalAvgEntryPrice: historicalAvgEntryPrice === null ? null : round(historicalAvgEntryPrice, 4),
    avgExitPrice: avgExitPrice === null ? null : round(avgExitPrice, 4),
    realizedPnL: realizedPnL === null ? null : round(realizedPnL, 2),
    fees: round(fees, 2),
    plannedRisk,
    rMultiple: rMultiple === null ? null : round(rMultiple, 2),
    entrySlippagePct: entrySlippagePct === null ? null : round(entrySlippagePct, 2),
    executionProgressPct: round(executionProgressPct, 1),
    openRisk: round(openRisk, 2),
    hasExecutions,
    hasEntries: entryShares > 0,
    isFullyClosed: entryShares > 0 && exitShares >= entryShares,
    invalidExitShares: invalidExitShares || exitShares > entryShares,

    // Real-time fields
    currentPrice,
    unrealizedPnL: unrealizedPnL === null ? null : round(unrealizedPnL, 2),
    unrealizedR: unrealizedR === null ? null : round(unrealizedR, 2),
  };
}

export function deriveTradeStatus(currentStatus: TradeStatus, metrics: TradeMetrics): TradeStatus {
  if (currentStatus === 'CANCELLED') return 'CANCELLED';
  if (!metrics.hasEntries) return 'PLANNED';
  if (metrics.isFullyClosed) return 'COMPLETED';
  return 'ACTIVE';
}

export function attachTradeMetrics<T extends Trade>(trade: T, currentPrice: number | null = null): T {
  const executions = trade.executions || [];
  return {
    ...trade,
    executions,
    metrics: calculateTradeMetrics(trade, executions, currentPrice),
  };
}
