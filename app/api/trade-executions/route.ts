import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculateTradeMetrics, deriveTradeStatus } from '@/lib/finance/trade-metrics';
import type { Trade, TradeExecution, TradeExecutionSide, TradeLegLabel } from '@/types';

const VALID_SIDES: TradeExecutionSide[] = ['ENTRY', 'EXIT'];
const VALID_LEGS: TradeLegLabel[] = ['E1', 'E2', 'E3', 'MANUAL'];

class InputError extends Error {
  code: string;

  constructor(message: string, code = 'INVALID_INPUT') {
    super(message);
    this.code = code;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}

function apiError(message: string, code: string, status = 400, details?: unknown) {
  return NextResponse.json({ message, code, details, recoverable: status < 500 }, { status });
}

function numberField(value: unknown, field: string, min = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= min) {
    throw new InputError(`${field} 값은 ${min}보다 커야 합니다.`);
  }
  return numeric;
}

function nonNegativeNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new InputError('fees 값은 0 이상이어야 합니다.');
  }
  return numeric;
}

function textOrNull(value: unknown, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function normalizeExecution(row: Record<string, unknown>): TradeExecution {
  return {
    id: String(row.id),
    trade_id: String(row.trade_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    side: row.side as TradeExecutionSide,
    executed_at: String(row.executed_at),
    price: Number(row.price),
    shares: Number(row.shares),
    fees: Number(row.fees || 0),
    leg_label: row.leg_label as TradeLegLabel,
    note: row.note === null || row.note === undefined ? null : String(row.note),
  };
}

async function getTradeWithExecutions(tradeId: string) {
  const { data, error } = await supabaseServer
    .from('trades')
    .select('*, trade_executions(*)')
    .eq('id', tradeId)
    .single();

  if (error) throw error;
  const trade = data as unknown as Trade & { trade_executions?: Record<string, unknown>[] };
  const executions = (trade.trade_executions || [])
    .map(normalizeExecution)
    .sort((a, b) => a.executed_at.localeCompare(b.executed_at));

  return {
    ...trade,
    executions,
  } as Trade;
}

function ensureExitSharesAreValid(trade: Trade, nextExecutions: TradeExecution[]) {
  const metrics = calculateTradeMetrics(trade, nextExecutions);
  if (metrics.invalidExitShares) {
    throw new InputError('청산 수량이 누적 진입 수량을 초과할 수 없습니다.', 'EXIT_SHARES_EXCEED_ENTRY_SHARES');
  }
}

async function syncTrade(tradeId: string) {
  const trade = await getTradeWithExecutions(tradeId);
  const metrics = calculateTradeMetrics(trade, trade.executions || []);
  const nextStatus = deriveTradeStatus(trade.status, metrics);
  const update: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (metrics.hasExecutions) {
    update.result_amount = metrics.realizedPnL;
    update.exit_price = metrics.avgExitPrice;
  }

  const { data, error } = await supabaseServer
    .from('trades')
    .update(update)
    .eq('id', tradeId)
    .select('*, trade_executions(*)')
    .single();

  if (error) throw error;
  const synced = data as unknown as Trade & { trade_executions?: Record<string, unknown>[] };
  const executions = (synced.trade_executions || [])
    .map(normalizeExecution)
    .sort((a, b) => a.executed_at.localeCompare(b.executed_at));
  const rest = { ...synced, executions } as Trade;
  delete (rest as unknown as { trade_executions?: unknown }).trade_executions;

  return {
    ...rest,
    metrics: calculateTradeMetrics(rest, executions),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tradeId = String(body.trade_id || '').trim();
    const side = String(body.side || '').trim().toUpperCase() as TradeExecutionSide;
    const legLabel = String(body.leg_label || 'MANUAL').trim().toUpperCase() as TradeLegLabel;

    if (!tradeId) return apiError('체결을 연결할 매매 계획 ID가 필요합니다.', 'MISSING_TRADE_ID');
    if (!VALID_SIDES.includes(side)) return apiError('체결 구분은 ENTRY 또는 EXIT이어야 합니다.', 'INVALID_SIDE');
    if (!VALID_LEGS.includes(legLabel)) return apiError('체결 단계는 E1, E2, E3, MANUAL 중 하나여야 합니다.', 'INVALID_LEG');

    const trade = await getTradeWithExecutions(tradeId);
    if (trade.status === 'CANCELLED') {
      return apiError('취소된 계획에는 체결을 추가할 수 없습니다.', 'TRADE_CANCELLED');
    }
    const record = {
      trade_id: tradeId,
      side,
      executed_at: body.executed_at ? new Date(body.executed_at).toISOString() : new Date().toISOString(),
      price: numberField(body.price, 'price'),
      shares: numberField(body.shares, 'shares'),
      fees: nonNegativeNumber(body.fees),
      leg_label: legLabel,
      note: textOrNull(body.note),
      updated_at: new Date().toISOString(),
    };

    ensureExitSharesAreValid(trade, [...(trade.executions || []), record as TradeExecution]);

    const { error } = await supabaseServer.from('trade_executions').insert([record]);
    if (error) throw error;

    const syncedTrade = await syncTrade(tradeId);
    return NextResponse.json({ data: syncedTrade });
  } catch (error: unknown) {
    console.error('Save Trade Execution Error:', error);
    if (error instanceof InputError) return apiError(error.message, error.code);
    return apiError(getErrorMessage(error), 'SAVE_TRADE_EXECUTION_FAILED', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) return apiError('수정할 체결 ID가 필요합니다.', 'MISSING_EXECUTION_ID');

    const { data: current, error: currentError } = await supabaseServer
      .from('trade_executions')
      .select('*')
      .eq('id', id)
      .single();
    if (currentError) throw currentError;

    const currentExecution = normalizeExecution(current as Record<string, unknown>);
    const trade = await getTradeWithExecutions(currentExecution.trade_id);
    const nextExecution: TradeExecution = {
      ...currentExecution,
      side: body.side ? (String(body.side).trim().toUpperCase() as TradeExecutionSide) : currentExecution.side,
      leg_label: body.leg_label
        ? (String(body.leg_label).trim().toUpperCase() as TradeLegLabel)
        : currentExecution.leg_label,
      executed_at: body.executed_at ? new Date(body.executed_at).toISOString() : currentExecution.executed_at,
      price: body.price !== undefined ? numberField(body.price, 'price') : currentExecution.price,
      shares: body.shares !== undefined ? numberField(body.shares, 'shares') : currentExecution.shares,
      fees: body.fees !== undefined ? nonNegativeNumber(body.fees) : currentExecution.fees,
      note: body.note !== undefined ? textOrNull(body.note) : currentExecution.note,
      updated_at: new Date().toISOString(),
    };

    if (!VALID_SIDES.includes(nextExecution.side)) return apiError('체결 구분은 ENTRY 또는 EXIT이어야 합니다.', 'INVALID_SIDE');
    if (!VALID_LEGS.includes(nextExecution.leg_label)) {
      return apiError('체결 단계는 E1, E2, E3, MANUAL 중 하나여야 합니다.', 'INVALID_LEG');
    }

    const nextExecutions = (trade.executions || []).map((execution) =>
      execution.id === id ? nextExecution : execution
    );
    ensureExitSharesAreValid(trade, nextExecutions);

    const { error } = await supabaseServer
      .from('trade_executions')
      .update({
        side: nextExecution.side,
        leg_label: nextExecution.leg_label,
        executed_at: nextExecution.executed_at,
        price: nextExecution.price,
        shares: nextExecution.shares,
        fees: nextExecution.fees,
        note: nextExecution.note,
        updated_at: nextExecution.updated_at,
      })
      .eq('id', id);
    if (error) throw error;

    const syncedTrade = await syncTrade(currentExecution.trade_id);
    return NextResponse.json({ data: syncedTrade });
  } catch (error: unknown) {
    console.error('Update Trade Execution Error:', error);
    if (error instanceof InputError) return apiError(error.message, error.code);
    return apiError(getErrorMessage(error), 'UPDATE_TRADE_EXECUTION_FAILED', 500);
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return apiError('삭제할 체결 ID가 필요합니다.', 'MISSING_EXECUTION_ID');

  try {
    const { data: current, error: currentError } = await supabaseServer
      .from('trade_executions')
      .select('trade_id')
      .eq('id', id)
      .single();
    if (currentError) throw currentError;
    const tradeId = String(current.trade_id);

    const { error } = await supabaseServer.from('trade_executions').delete().eq('id', id);
    if (error) throw error;

    const syncedTrade = await syncTrade(tradeId);
    return NextResponse.json({ data: syncedTrade });
  } catch (error: unknown) {
    console.error('Delete Trade Execution Error:', error);
    return apiError(getErrorMessage(error), 'DELETE_TRADE_EXECUTION_FAILED', 500);
  }
}
