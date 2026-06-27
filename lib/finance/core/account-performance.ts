import type { PyramidPlan, Trade, TradeExecution, TradeMetrics } from '../../../types/index.ts';

export interface TradePerformanceRecord {
  trade_id: string;
  market: 'US' | 'KR';
  ticker: string;
  completed_at: string;
  entry_value: number;
  exit_value: number;
  fees: number;
  realized_pnl: number;
  r_multiple: number | null;
  return_pct: number | null;
  pyramid_compliant: boolean | null;
  stop_raise_compliant: boolean | null;
  performance_snapshot: {
    version: 'trade-performance-v1';
    captured_at: string;
    metrics: {
      entryShares: number;
      exitShares: number;
      avgEntryPrice: number | null;
      avgExitPrice: number | null;
      realizedPnL: number;
      rMultiple: number | null;
      returnPct: number | null;
      fees: number;
    };
    pyramid: {
      planned: PyramidPlan | null;
      entryLegs: { leg: string; price: number; shares: number }[];
      compliant: boolean | null;
      stopRaiseCompliant: boolean | null;
    };
  };
}

export interface AccountBalanceDelta {
  market: 'US' | 'KR';
  previousRecordedPnL: number;
  nextRecordedPnL: number;
  realizedPnLDelta: number;
  equityBefore: number;
  equityAfter: number;
  cashBefore: number;
  cashAfter: number;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finite(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function inferTradeMarket(ticker: string): 'US' | 'KR' {
  return /^\d{6}$/.test(ticker) ? 'KR' : 'US';
}

function sortedExecutions(executions: TradeExecution[] = []) {
  return [...executions].sort((left, right) => {
    const executedDiff = new Date(left.executed_at).getTime() - new Date(right.executed_at).getTime();
    if (executedDiff !== 0) return executedDiff;
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

function getPyramidPlan(trade: Pick<Trade, 'risk_policy_snapshot'> & { riskPlan?: { pyramidPlan?: PyramidPlan | null } }): PyramidPlan | null {
  const policy = trade.risk_policy_snapshot as (Trade['risk_policy_snapshot'] & { pyramidPlan?: PyramidPlan | null }) | null | undefined;
  return trade.riskPlan?.pyramidPlan ?? policy?.pyramidPlan ?? null;
}

export function evaluatePyramidExecutionCompliance(trade: Pick<Trade, 'executions' | 'direction'>): boolean | null {
  const entries = sortedExecutions(trade.executions || []).filter((execution) => execution.side === 'ENTRY');
  if (entries.length <= 1) return null;

  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (trade.direction === 'SHORT') {
      if (current.price >= previous.price) return false;
    } else if (current.price <= previous.price) {
      return false;
    }
  }
  return true;
}

export function evaluateStopRaiseCompliance(
  trade: Pick<Trade, 'executions' | 'stoploss_price' | 'entry_targets' | 'trailing_stops'> & { riskPlan?: { pyramidPlan?: PyramidPlan | null } }
): boolean | null {
  const hasE3 = (trade.executions || []).some((execution) => execution.side === 'ENTRY' && execution.leg_label === 'E3');
  if (!hasE3) return null;

  const requiredStop = trade.riskPlan?.pyramidPlan?.minimumStopAfterEntry3
    ?? trade.trailing_stops?.afterEntry3
    ?? trade.entry_targets?.e3.stopPrice
    ?? null;
  if (typeof requiredStop !== 'number' || requiredStop <= 0) return null;
  return finite(trade.stoploss_price) >= requiredStop;
}

export function buildTradePerformanceRecord(
  trade: Trade,
  metrics: TradeMetrics,
  completedAt: string = new Date().toISOString()
): TradePerformanceRecord {
  const executions = sortedExecutions(trade.executions || []);
  const entries = executions.filter((execution) => execution.side === 'ENTRY');
  const exits = executions.filter((execution) => execution.side === 'EXIT');
  const entryValue = entries.reduce((sum, execution) => sum + execution.price * execution.shares, 0);
  const exitValue = exits.reduce((sum, execution) => sum + execution.price * execution.shares, 0);
  const realizedPnl = finite(metrics.realizedPnL);
  const returnPct = entryValue > 0 ? (realizedPnl / entryValue) * 100 : null;
  const pyramidPlan = getPyramidPlan(trade);
  const pyramidCompliant = evaluatePyramidExecutionCompliance(trade);
  const stopRaiseCompliant = evaluateStopRaiseCompliance(trade);

  return {
    trade_id: trade.id,
    market: inferTradeMarket(trade.ticker),
    ticker: trade.ticker,
    completed_at: completedAt,
    entry_value: round(entryValue),
    exit_value: round(exitValue),
    fees: round(metrics.fees),
    realized_pnl: round(realizedPnl),
    r_multiple: metrics.rMultiple,
    return_pct: returnPct === null ? null : round(returnPct, 2),
    pyramid_compliant: pyramidCompliant,
    stop_raise_compliant: stopRaiseCompliant,
    performance_snapshot: {
      version: 'trade-performance-v1',
      captured_at: completedAt,
      metrics: {
        entryShares: metrics.entryShares,
        exitShares: metrics.exitShares,
        avgEntryPrice: metrics.avgEntryPrice,
        avgExitPrice: metrics.avgExitPrice,
        realizedPnL: round(realizedPnl),
        rMultiple: metrics.rMultiple,
        returnPct: returnPct === null ? null : round(returnPct, 2),
        fees: round(metrics.fees),
      },
      pyramid: {
        planned: pyramidPlan,
        entryLegs: entries.map((execution) => ({
          leg: execution.leg_label,
          price: execution.price,
          shares: execution.shares,
        })),
        compliant: pyramidCompliant,
        stopRaiseCompliant,
      },
    },
  };
}

export function calculateAccountBalanceDelta(input: {
  market: 'US' | 'KR';
  realizedPnl: number;
  previousRecordedPnl?: number | null;
  currentSettings?: { total_equity?: number | string | null; cash?: number | string | null } | null;
  fallbackEquity?: number | null;
}): AccountBalanceDelta {
  const previousRecordedPnL = finite(input.previousRecordedPnl);
  const nextRecordedPnL = finite(input.realizedPnl);
  const realizedPnLDelta = round(nextRecordedPnL - previousRecordedPnL);
  const equityBefore = finite(input.currentSettings?.total_equity ?? input.fallbackEquity);
  const cashBefore = finite(input.currentSettings?.cash);
  const equityAfter = round(Math.max(equityBefore + realizedPnLDelta, 0));
  const cashAfter = round(Math.max(cashBefore + realizedPnLDelta, 0));

  return {
    market: input.market,
    previousRecordedPnL: round(previousRecordedPnL),
    nextRecordedPnL: round(nextRecordedPnL),
    realizedPnLDelta,
    equityBefore: round(equityBefore),
    equityAfter,
    cashBefore: round(cashBefore),
    cashAfter,
  };
}
