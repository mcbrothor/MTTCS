import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { buildLivePriceMap } from '@/lib/finance/core/live-trade-pricing';
import { buildEntrySnapshot } from '@/lib/finance/core/snapshot';
import { attachTradeMetrics } from '@/lib/finance/core/trade-metrics';
import { getKisDomesticPrice } from '@/lib/finance/providers/kis-api';
import { getYahooQuotes } from '@/lib/finance/providers/yahoo-api';
import { supabaseServer } from '@/lib/supabase/server';
import type { Trade, TradeStatus } from '@/types';

const VALID_STATUSES: TradeStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
const SNAPSHOT_RELEVANT_FIELDS = new Set([
  'ticker',
  'direction',
  'chk_sepa',
  'chk_market',
  'chk_risk',
  'chk_entry',
  'chk_stoploss',
  'chk_exit',
  'chk_psychology',
  'total_equity',
  'planned_risk',
  'risk_percent',
  'entry_price',
  'stoploss_price',
  'position_size',
  'total_shares',
  'entry_targets',
  'trailing_stops',
  'sepa_evidence',
  'vcp_analysis',
  'plan_note',
  'invalidation_note',
]);

type TradeRecordForSnapshot = Pick<
  Trade,
  | 'ticker'
  | 'direction'
  | 'chk_sepa'
  | 'chk_market'
  | 'chk_risk'
  | 'chk_entry'
  | 'chk_stoploss'
  | 'chk_exit'
  | 'chk_psychology'
  | 'sepa_evidence'
  | 'total_equity'
  | 'planned_risk'
  | 'risk_percent'
  | 'entry_price'
  | 'stoploss_price'
  | 'position_size'
  | 'total_shares'
  | 'entry_targets'
  | 'trailing_stops'
  | 'plan_note'
  | 'invalidation_note'
> & {
  vcp_analysis?: unknown;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function apiError(message: string, code: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      message,
      code,
      details,
      recoverable: status < 500,
    },
    { status }
  );
}

function normalizeRiskPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 1 ? numeric / 100 : numeric;
}

function nullableNumber(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function normalizeStringArray(value: unknown, max = 12) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function nullableText(value: unknown, max = 2000) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function buildTradeEntrySnapshot(trade: TradeRecordForSnapshot) {
  const positionSize =
    typeof trade.position_size === 'number'
      ? trade.position_size
      : typeof trade.total_shares === 'number'
        ? trade.total_shares
        : null;
  const totalShares =
    typeof trade.total_shares === 'number'
      ? trade.total_shares
      : typeof trade.position_size === 'number'
        ? trade.position_size
        : null;

  return buildEntrySnapshot({
    ticker: trade.ticker,
    direction: trade.direction,
    checklist: {
      chk_sepa: trade.chk_sepa,
      chk_market: trade.chk_market,
      chk_risk: trade.chk_risk,
      chk_entry: trade.chk_entry,
      chk_stoploss: trade.chk_stoploss,
      chk_exit: trade.chk_exit,
      chk_psychology: trade.chk_psychology,
    },
    sepaEvidence: trade.sepa_evidence,
    vcpAnalysis: trade.vcp_analysis as never,
    totalEquity: trade.total_equity,
    plannedRisk: trade.planned_risk,
    riskPercent: trade.risk_percent,
    entryPrice: trade.entry_price,
    stoplossPrice: trade.stoploss_price,
    positionSize,
    totalShares,
    entryTargets: trade.entry_targets,
    trailingStops: trade.trailing_stops,
    planNote: trade.plan_note,
    invalidationNote: trade.invalidation_note,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ticker = String(body.ticker || '').trim().toUpperCase();
    const totalShares = Number(body.total_shares ?? body.position_size ?? 0);
    const plannedRisk = Number(body.planned_risk ?? 0);
    const riskPercent = normalizeRiskPercent(body.risk_percent ?? 0.03);
    const direction = body.direction === 'SHORT' ? 'SHORT' : 'LONG';

    if (!ticker) {
      return apiError('Ticker is required.', 'MISSING_TICKER');
    }
    if (body.sepa_evidence?.status === 'fail' || body.chk_sepa === false) {
      return apiError('SEPA conditions failed.', 'SEPA_FAILED');
    }
    if (!Number.isFinite(totalShares) || totalShares <= 0) {
      return apiError('Position size must be at least 1 share.', 'INVALID_POSITION_SIZE');
    }
    if (!Number.isFinite(plannedRisk) || plannedRisk <= 0) {
      return apiError('Planned risk must be greater than zero.', 'INVALID_PLANNED_RISK');
    }
    if (!riskPercent || riskPercent > 0.1) {
      return apiError('Risk percent must be greater than 0 and at most 10%.', 'INVALID_RISK_PERCENT');
    }
    if (!body.entry_targets || !body.trailing_stops || !body.sepa_evidence) {
      return apiError('SEPA evidence and entry plan fields are required.', 'MISSING_STRATEGY_FIELDS');
    }

    const record: Record<string, unknown> & TradeRecordForSnapshot = {
      ticker,
      direction,
      status: 'PLANNED',
      chk_sepa: Boolean(body.chk_sepa),
      chk_market: body.chk_market ?? body.chk_sepa,
      chk_risk: Boolean(body.chk_risk),
      chk_entry: Boolean(body.chk_entry),
      chk_stoploss: Boolean(body.chk_stoploss),
      chk_exit: Boolean(body.chk_exit),
      chk_psychology: Boolean(body.chk_psychology),
      sepa_evidence: body.sepa_evidence,
      vcp_analysis: body.vcp_analysis ?? null,
      total_equity: Number(body.total_equity) || null,
      planned_risk: plannedRisk,
      risk_percent: riskPercent,
      atr_value: Number(body.atr_value) || null,
      entry_price: Number(body.entry_price) || null,
      stoploss_price: Number(body.stoploss_price) || null,
      position_size: totalShares,
      total_shares: totalShares,
      entry_targets: body.entry_targets,
      trailing_stops: body.trailing_stops,
      setup_tags: normalizeStringArray(body.setup_tags) ?? [],
      mistake_tags: normalizeStringArray(body.mistake_tags) ?? [],
      plan_note: nullableText(body.plan_note),
      invalidation_note: nullableText(body.invalidation_note),
      review_note: nullableText(body.review_note),
      review_action: nullableText(body.review_action, 500),
      updated_at: new Date().toISOString(),
    };

    record.entry_snapshot = buildTradeEntrySnapshot(record as TradeRecordForSnapshot);

    const session = await getServerSession();
    if (session) {
      record.user_id = session.systemId;
    }

    const { data, error } = await supabaseServer
      .from('trades')
      .insert([record])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Save Trade Error:', error);
    return apiError(getErrorMessage(error), 'SAVE_TRADE_FAILED', 500);
  }
}

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('trades')
      .select('*, trade_executions(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const allRecords = (data || []) as unknown as (Trade & { trade_executions?: Trade['executions'] })[];
    const priceMap = await buildLivePriceMap(allRecords, {
      getUsQuotes: getYahooQuotes,
      getKrPrice: getKisDomesticPrice,
    });

    const trades = allRecords.map((trade) => {
      const { trade_executions: tradeExecutions, ...rest } = trade;
      const currentPrice = trade.status === 'ACTIVE' ? (priceMap.get(trade.ticker) || null) : null;

      return attachTradeMetrics({
        ...rest,
        executions: tradeExecutions || [],
      } as Trade, currentPrice);
    });

    return NextResponse.json({ data: trades });
  } catch (error: unknown) {
    console.error('Fetch Trades Error:', error);
    return apiError(getErrorMessage(error), 'FETCH_TRADES_FAILED', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();

    if (!id) {
      return apiError('Trade ID is required.', 'MISSING_TRADE_ID');
    }

    const { data: existingTrade, error: existingTradeError } = await supabaseServer
      .from('trades')
      .select('*')
      .eq('id', id)
      .single();

    if (existingTradeError) throw existingTradeError;

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.direction !== undefined) {
      if (body.direction !== 'LONG' && body.direction !== 'SHORT') {
        return apiError('Direction must be LONG or SHORT.', 'INVALID_DIRECTION', 400, { allowed: ['LONG', 'SHORT'] });
      }
      update.direction = body.direction;
    }

    if (body.ticker !== undefined) {
      const ticker = String(body.ticker).trim().toUpperCase();
      if (!ticker) return apiError('Ticker is required.', 'MISSING_TICKER');
      update.ticker = ticker;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return apiError('Invalid trade status.', 'INVALID_STATUS', 400, { allowed: VALID_STATUSES });
      }
      update.status = body.status;
    }

    const numericFields = [
      'total_equity',
      'planned_risk',
      'atr_value',
      'entry_price',
      'stoploss_price',
      'position_size',
      'total_shares',
      'exit_price',
      'result_amount',
      'final_discipline',
    ];

    for (const field of numericFields) {
      const value = nullableNumber(body[field]);
      if (value === undefined) continue;
      if (Number.isNaN(value)) {
        return apiError(`${field} must be a number.`, 'INVALID_NUMBER', 400, { field });
      }
      update[field] = value;
    }

    if (body.risk_percent !== undefined) {
      const riskPercent = normalizeRiskPercent(body.risk_percent);
      if (!riskPercent || riskPercent > 0.1) {
        return apiError('Risk percent must be greater than 0 and at most 10%.', 'INVALID_RISK_PERCENT');
      }
      update.risk_percent = riskPercent;
    }

    if (body.total_shares !== undefined && body.position_size === undefined) {
      update.position_size = update.total_shares;
    }

    if (body.emotion_note !== undefined) {
      update.emotion_note = body.emotion_note === null ? null : String(body.emotion_note);
    }

    const checklistFields = ['chk_sepa', 'chk_market', 'chk_risk', 'chk_entry', 'chk_stoploss', 'chk_exit', 'chk_psychology'] as const;
    for (const field of checklistFields) {
      if (body[field] !== undefined) {
        update[field] = Boolean(body[field]);
      }
    }

    if (body.exit_reason !== undefined) {
      update.exit_reason = body.exit_reason === null ? null : String(body.exit_reason);
    }

    const setupTags = normalizeStringArray(body.setup_tags);
    if (setupTags !== undefined) update.setup_tags = setupTags;
    const mistakeTags = normalizeStringArray(body.mistake_tags);
    if (mistakeTags !== undefined) update.mistake_tags = mistakeTags;
    const planNote = nullableText(body.plan_note);
    if (planNote !== undefined) update.plan_note = planNote;
    const invalidationNote = nullableText(body.invalidation_note);
    if (invalidationNote !== undefined) update.invalidation_note = invalidationNote;
    const reviewNote = nullableText(body.review_note);
    if (reviewNote !== undefined) update.review_note = reviewNote;
    const reviewAction = nullableText(body.review_action, 500);
    if (reviewAction !== undefined) update.review_action = reviewAction;
    if (body.entry_targets !== undefined) update.entry_targets = body.entry_targets;
    if (body.trailing_stops !== undefined) update.trailing_stops = body.trailing_stops;
    if (body.sepa_evidence !== undefined) update.sepa_evidence = body.sepa_evidence;
    if (body.vcp_analysis !== undefined) update.vcp_analysis = body.vcp_analysis;

    if (Object.keys(body).some((field) => SNAPSHOT_RELEVANT_FIELDS.has(field))) {
      const mergedTrade = {
        ...(existingTrade as TradeRecordForSnapshot),
        ...update,
      };
      update.entry_snapshot = buildTradeEntrySnapshot(mergedTrade);
    }

    const { data, error } = await supabaseServer
      .from('trades')
      .update(update)
      .eq('id', id)
      .select('*, trade_executions(*)')
      .single();

    if (error) throw error;

    const trade = data as unknown as Trade & { trade_executions?: Trade['executions'] };
    const { trade_executions: tradeExecutions, ...rest } = trade;

    return NextResponse.json({
      data: attachTradeMetrics({
        ...rest,
        executions: tradeExecutions || [],
      } as Trade),
    });
  } catch (error: unknown) {
    console.error('Update Trade Error:', error);
    return apiError(getErrorMessage(error), 'UPDATE_TRADE_FAILED', 500);
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();

  if (!id) {
    return apiError('Trade ID is required.', 'MISSING_TRADE_ID');
  }

  try {
    const { error } = await supabaseServer.from('trades').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ data: { id } });
  } catch (error: unknown) {
    console.error('Delete Trade Error:', error);
    return apiError(getErrorMessage(error), 'DELETE_TRADE_FAILED', 500);
  }
}
