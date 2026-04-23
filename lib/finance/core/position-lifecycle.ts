import type { Trade, TradeExecution, TradeLegLabel } from '../../../types/index.ts';

export interface PositionLifecycleEvent {
  id: string;
  executedAt: string;
  side: 'ENTRY' | 'EXIT';
  legLabel: TradeLegLabel;
  price: number;
  shares: number;
  fees: number;
  positionAfter: number;
  averageCostAfter: number | null;
  realizedPnLDelta: number | null;
  action: 'INITIAL_ENTRY' | 'PYRAMID' | 'PARTIAL_EXIT' | 'FULL_EXIT' | 'MANUAL_EXIT' | 'UNWIND';
}

export interface PositionLifecycleSummary {
  events: PositionLifecycleEvent[];
  entryCount: number;
  exitCount: number;
  pyramidCount: number;
  partialExitCount: number;
  realizedPnL: number;
}

function normalizeExecution(execution: TradeExecution, orderIndex: number) {
  return {
    ...execution,
    orderIndex,
    price: Number(execution.price),
    shares: Number(execution.shares),
    fees: Number(execution.fees || 0),
  };
}

function sortExecutions(left: ReturnType<typeof normalizeExecution>, right: ReturnType<typeof normalizeExecution>) {
  const executedDiff = new Date(left.executed_at).getTime() - new Date(right.executed_at).getTime();
  if (executedDiff !== 0) return executedDiff;
  const createdDiff = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  if (createdDiff !== 0) return createdDiff;
  return left.orderIndex - right.orderIndex;
}

export function buildPositionLifecycle(executions: TradeExecution[] = []): PositionLifecycleSummary {
  const orderedExecutions = executions
    .filter((execution) => Number.isFinite(Number(execution.price)) && Number.isFinite(Number(execution.shares)))
    .map(normalizeExecution)
    .sort(sortExecutions);

  let runningShares = 0;
  let runningCost = 0;
  let realizedPnL = 0;
  let entryCount = 0;
  let exitCount = 0;
  let pyramidCount = 0;
  let partialExitCount = 0;

  const events: PositionLifecycleEvent[] = [];

  for (const execution of orderedExecutions) {
    if (execution.side === 'ENTRY') {
      const action = runningShares > 0 ? 'PYRAMID' : 'INITIAL_ENTRY';
      if (action === 'PYRAMID') pyramidCount += 1;
      runningShares += execution.shares;
      runningCost += execution.price * execution.shares;
      entryCount += 1;

      events.push({
        id: execution.id,
        executedAt: execution.executed_at,
        side: execution.side,
        legLabel: execution.leg_label,
        price: execution.price,
        shares: execution.shares,
        fees: execution.fees,
        positionAfter: runningShares,
        averageCostAfter: runningShares > 0 ? runningCost / runningShares : null,
        realizedPnLDelta: null,
        action,
      });
      continue;
    }

    const sharesBefore = runningShares;
    const avgCostBefore = runningShares > 0 ? runningCost / runningShares : null;
    const closedShares = Math.min(execution.shares, runningShares);
    let realizedPnLDelta: number | null = null;

    if (closedShares > 0 && avgCostBefore !== null) {
      realizedPnLDelta = (execution.price - avgCostBefore) * closedShares - execution.fees;
      realizedPnL += realizedPnLDelta;
      runningCost = Math.max(0, runningCost - avgCostBefore * closedShares);
      runningShares = Math.max(0, runningShares - closedShares);
    } else if (execution.fees > 0) {
      realizedPnLDelta = -execution.fees;
      realizedPnL += realizedPnLDelta;
    }

    exitCount += 1;
    const action =
      sharesBefore > 0 && runningShares === 0
        ? 'FULL_EXIT'
        : closedShares > 0 && closedShares < sharesBefore
          ? 'PARTIAL_EXIT'
          : sharesBefore > 0
            ? 'MANUAL_EXIT'
            : 'UNWIND';
    if (action === 'PARTIAL_EXIT') partialExitCount += 1;

    events.push({
      id: execution.id,
      executedAt: execution.executed_at,
      side: execution.side,
      legLabel: execution.leg_label,
      price: execution.price,
      shares: execution.shares,
      fees: execution.fees,
      positionAfter: runningShares,
      averageCostAfter: runningShares > 0 ? runningCost / runningShares : null,
      realizedPnLDelta,
      action,
    });
  }

  return {
    events,
    entryCount,
    exitCount,
    pyramidCount,
    partialExitCount,
    realizedPnL,
  };
}

export function buildTradePositionLifecycle(trade: Pick<Trade, 'executions'>) {
  return buildPositionLifecycle(trade.executions || []);
}
