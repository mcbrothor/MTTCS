import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/auth/session';
import {
  buildTradePerformanceRecord,
  calculateAccountBalanceDelta,
  inferTradeMarket,
} from '@/lib/finance/core/account-performance';
import { calculateTradeMetrics, deriveTradeStatus } from '@/lib/finance/core/trade-metrics';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { Trade, TradeExecution, TradeExecutionSide, TradeLegLabel, TradeMetrics } from '@/types';

const VALID_SIDES: TradeExecutionSide[] = ['ENTRY', 'EXIT'];
const VALID_LEGS: TradeLegLabel[] = ['E1', 'E2', 'E3', 'MANUAL'];

class InputError extends Error {
  constructor(message: string, readonly code = 'INVALID_INPUT') { super(message); }
}

function apiError(message: string, code: string, status = 400) {
  return NextResponse.json({ message, code, recoverable: status < 500 }, { status });
}

function numberField(value: unknown, field: string, min = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= min) throw new InputError(`${field} 값은 ${min}보다 커야 합니다.`);
  return numeric;
}

function nonNegativeNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new InputError('fees 값은 0 이상이어야 합니다.');
  return numeric;
}

function textOrNull(value: unknown, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function normalizeExecution(row: Record<string, unknown>): TradeExecution {
  return {
    id: String(row.id), trade_id: String(row.trade_id), created_at: String(row.created_at),
    updated_at: String(row.updated_at), side: row.side as TradeExecutionSide,
    executed_at: String(row.executed_at), price: Number(row.price), shares: Number(row.shares),
    fees: Number(row.fees || 0), leg_label: row.leg_label as TradeLegLabel,
    note: row.note == null ? null : String(row.note),
  };
}

async function getTradeWithExecutions(tradeId: string, ownerId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('trades').select('*, trade_executions(*)')
    .eq('id', tradeId).eq('user_id', ownerId).single();
  if (error) throw error;
  const row = data as unknown as Trade & { trade_executions?: Record<string, unknown>[] };
  const executions = (row.trade_executions || []).map(normalizeExecution)
    .sort((a, b) => a.executed_at.localeCompare(b.executed_at));
  const trade = { ...row, executions } as Trade;
  delete (trade as Trade & { trade_executions?: unknown }).trade_executions;
  return trade;
}

function validateExitShares(trade: Trade, executions: TradeExecution[]) {
  if (calculateTradeMetrics(trade, executions).invalidExitShares) {
    throw new InputError('청산 수량이 누적 진입 수량을 초과할 수 없습니다.', 'EXIT_SHARES_EXCEED_ENTRY_SHARES');
  }
}

function requestHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function mutationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('VERSION_CONFLICT')) return apiError('다른 요청이 먼저 반영되었습니다. 새로고침 후 다시 시도하세요.', 'VERSION_CONFLICT', 409);
  if (message.includes('IDEMPOTENCY_CONFLICT')) return apiError('같은 멱등 키가 다른 요청에 사용되었습니다.', 'IDEMPOTENCY_CONFLICT', 409);
  if (message.includes('NOT_FOUND')) return apiError('거래 또는 체결을 찾을 수 없습니다.', 'NOT_FOUND', 404);
  console.error('Trade execution mutation failed:', error);
  return apiError('체결 변경을 저장하지 못했습니다.', 'TRADE_EXECUTION_FAILED', 500);
}

async function buildCompletionPatches(trade: Trade, metrics: TradeMetrics) {
  if (!metrics.isFullyClosed || metrics.realizedPnL === null) {
    return { portfolioPatch: null, portfolioVersion: null, performancePatch: null };
  }
  const db = getSupabaseAdmin();
  const market = inferTradeMarket(trade.ticker);
  const completedAt = new Date().toISOString();
  const performancePatch = buildTradePerformanceRecord(trade, metrics, completedAt);
  const [{ data: existing }, { data: settings }] = await Promise.all([
    db.from('trade_performance_records').select('realized_pnl').eq('trade_id', trade.id).maybeSingle(),
    db.from('portfolio_settings').select('*').eq('market', market).maybeSingle(),
  ]);
  const delta = calculateAccountBalanceDelta({
    market, realizedPnl: performancePatch.realized_pnl,
    previousRecordedPnl: existing?.realized_pnl, currentSettings: settings,
    fallbackEquity: trade.total_equity,
  });
  const portfolioPatch = delta.realizedPnLDelta !== 0 && delta.equityAfter > 0
    ? { market, total_equity: delta.equityAfter, cash: delta.cashAfter }
    : null;
  return { portfolioPatch, portfolioVersion: settings?.version ?? null, performancePatch };
}

async function commitMutation(args: {
  operation: 'CREATE' | 'UPDATE' | 'DELETE'; trade: Trade; ownerId: string;
  nextExecutions: TradeExecution[]; execution?: Record<string, unknown>; executionId?: string;
  idempotencyKey: string; hash: string; expectedVersion?: number;
}) {
  const metrics = calculateTradeMetrics(args.trade, args.nextExecutions);
  const tradePatch = {
    status: deriveTradeStatus(args.trade.status, metrics),
    result_amount: metrics.hasExecutions ? metrics.realizedPnL : null,
    exit_price: metrics.hasExecutions ? metrics.avgExitPrice : null,
  };
  const patches = await buildCompletionPatches(args.trade, metrics);
  const { error } = await getSupabaseAdmin().rpc('mutate_trade_execution_v2', {
    p_operation: args.operation, p_trade_id: args.trade.id, p_owner_id: args.ownerId,
    p_expected_trade_version: args.expectedVersion ?? args.trade.version ?? 0,
    p_execution: args.execution ?? null, p_execution_id: args.executionId ?? null,
    p_idempotency_key: args.idempotencyKey, p_request_hash: args.hash,
    p_trade_patch: tradePatch, p_portfolio_patch: patches.portfolioPatch,
    p_expected_portfolio_version: patches.portfolioVersion, p_performance_patch: patches.performancePatch,
  });
  if (error) throw error;
  const saved = await getTradeWithExecutions(args.trade.id, args.ownerId);
  return { ...saved, metrics: calculateTradeMetrics(saved, saved.executions || []) };
}

async function requireContext(request: Request) {
  const session = await getRequestSession(request);
  if (!session) throw new InputError('Authentication required.', 'AUTH_REQUIRED');
  const key = request.headers.get('idempotency-key')?.trim();
  if (!key || key.length > 200) throw new InputError('Idempotency-Key 헤더가 필요합니다.', 'IDEMPOTENCY_REQUIRED');
  return { session, key };
}

export async function POST(request: Request) {
  try {
    const { session, key } = await requireContext(request);
    const body = await request.json();
    const tradeId = String(body.trade_id || '').trim();
    const side = String(body.side || '').toUpperCase() as TradeExecutionSide;
    const leg = String(body.leg_label || 'MANUAL').toUpperCase() as TradeLegLabel;
    if (!tradeId) throw new InputError('체결을 연결할 매매 계획 ID가 필요합니다.', 'MISSING_TRADE_ID');
    if (!VALID_SIDES.includes(side) || !VALID_LEGS.includes(leg)) throw new InputError('체결 구분 또는 단계가 올바르지 않습니다.');
    const trade = await getTradeWithExecutions(tradeId, session.systemId);
    if (trade.status === 'CANCELLED') throw new InputError('취소된 계획에는 체결을 추가할 수 없습니다.', 'TRADE_CANCELLED');
    const execution = { side, leg_label: leg,
      executed_at: body.executed_at ? new Date(body.executed_at).toISOString() : new Date().toISOString(),
      price: numberField(body.price, 'price'), shares: numberField(body.shares, 'shares'),
      fees: nonNegativeNumber(body.fees), note: textOrNull(body.note) };
    const next = [...(trade.executions || []), { ...execution, id: '', trade_id: trade.id, created_at: '', updated_at: '' } as TradeExecution];
    validateExitShares(trade, next);
    return NextResponse.json({ data: await commitMutation({ operation: 'CREATE', trade, ownerId: session.systemId,
      nextExecutions: next, execution, idempotencyKey: key, hash: requestHash(execution), expectedVersion: body.expected_version }) });
  } catch (error) {
    if (error instanceof InputError) return apiError(error.message, error.code, error.code === 'AUTH_REQUIRED' ? 401 : 400);
    return mutationError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { session, key } = await requireContext(request);
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) throw new InputError('수정할 체결 ID가 필요합니다.', 'MISSING_EXECUTION_ID');
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('trade_executions').select('*').eq('id', id).single();
    if (error) throw error;
    const current = normalizeExecution(data as Record<string, unknown>);
    const trade = await getTradeWithExecutions(current.trade_id, session.systemId);
    const execution = { side: body.side ? String(body.side).toUpperCase() : current.side,
      leg_label: body.leg_label ? String(body.leg_label).toUpperCase() : current.leg_label,
      executed_at: body.executed_at ? new Date(body.executed_at).toISOString() : current.executed_at,
      price: body.price === undefined ? current.price : numberField(body.price, 'price'),
      shares: body.shares === undefined ? current.shares : numberField(body.shares, 'shares'),
      fees: body.fees === undefined ? current.fees : nonNegativeNumber(body.fees),
      note: body.note === undefined ? current.note : textOrNull(body.note) };
    if (!VALID_SIDES.includes(execution.side as TradeExecutionSide) || !VALID_LEGS.includes(execution.leg_label as TradeLegLabel)) throw new InputError('체결 구분 또는 단계가 올바르지 않습니다.');
    const replacement = { ...current, ...execution } as TradeExecution;
    const next = (trade.executions || []).map((item) => item.id === id ? replacement : item);
    validateExitShares(trade, next);
    return NextResponse.json({ data: await commitMutation({ operation: 'UPDATE', trade, ownerId: session.systemId,
      nextExecutions: next, execution, executionId: id, idempotencyKey: key, hash: requestHash(execution), expectedVersion: body.expected_version }) });
  } catch (error) {
    if (error instanceof InputError) return apiError(error.message, error.code, error.code === 'AUTH_REQUIRED' ? 401 : 400);
    return mutationError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { session, key } = await requireContext(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    if (!id) throw new InputError('삭제할 체결 ID가 필요합니다.', 'MISSING_EXECUTION_ID');
    const { data, error } = await getSupabaseAdmin().from('trade_executions').select('*').eq('id', id).single();
    if (error) throw error;
    const current = normalizeExecution(data as Record<string, unknown>);
    const trade = await getTradeWithExecutions(current.trade_id, session.systemId);
    const next = (trade.executions || []).filter((item) => item.id !== id);
    validateExitShares(trade, next);
    return NextResponse.json({ data: await commitMutation({ operation: 'DELETE', trade, ownerId: session.systemId,
      nextExecutions: next, executionId: id, idempotencyKey: key, hash: requestHash({ id }),
      expectedVersion: Number(searchParams.get('expected_version')) || undefined }) });
  } catch (error) {
    if (error instanceof InputError) return apiError(error.message, error.code, error.code === 'AUTH_REQUIRED' ? 401 : 400);
    return mutationError(error);
  }
}
