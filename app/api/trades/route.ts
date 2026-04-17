import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { attachTradeMetrics, calculateTradeMetrics } from '@/lib/finance/trade-metrics';
import { getKisDomesticPrice } from '@/lib/finance/kis-api';
import { getYahooQuotes } from '@/lib/finance/yahoo-api';
import type { Trade, TradeStatus } from '@/types';

const VALID_STATUSES: TradeStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류';
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

function isKorean(ticker: string) {
  return /^\d{6}$/.test(ticker);
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sepaStatus = body.sepa_evidence?.status;
    const totalShares = Number(body.total_shares ?? body.position_size ?? 0);
    const plannedRisk = Number(body.planned_risk ?? 0);
    const riskPercent = normalizeRiskPercent(body.risk_percent ?? 0.03);

    if (!body.ticker) {
      return apiError('티커가 필요합니다.', 'MISSING_TICKER');
    }
    if (sepaStatus === 'fail' || body.chk_sepa === false) {
      return apiError('SEPA 실패 조건이 있어 매매 계획을 저장할 수 없습니다.', 'SEPA_FAILED');
    }
    if (!Number.isFinite(totalShares) || totalShares <= 0) {
      return apiError('계획 수량은 1주 이상이어야 합니다.', 'INVALID_POSITION_SIZE');
    }
    if (!Number.isFinite(plannedRisk) || plannedRisk <= 0) {
      return apiError('계획 리스크 금액이 유효하지 않습니다.', 'INVALID_PLANNED_RISK');
    }
    if (!riskPercent || riskPercent > 0.1) {
      return apiError('허용 손실 비율은 0% 초과 10% 이하로 저장해야 합니다.', 'INVALID_RISK_PERCENT');
    }
    if (!body.entry_targets || !body.trailing_stops || !body.sepa_evidence) {
      return apiError('SEPA 분석 근거와 Minervini 진입 계획이 필요합니다.', 'MISSING_STRATEGY_FIELDS');
    }

    const record = {
      ticker: String(body.ticker).toUpperCase(),
      direction: body.direction || 'LONG',
      status: 'PLANNED' as const,
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

    const { data, error } = await supabaseServer
      .from('trades')
      .insert([record])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Save Trade Error:', error);
    return apiError(getErrorMessage(error) || '매매 계획 저장 중 오류가 발생했습니다.', 'SAVE_TRADE_FAILED', 500);
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
    const activeTrades = allRecords.filter((t) => t.status === 'ACTIVE');
    
    // 1. ACTIVE 종목들의 실시간 가격 병렬 조회
    const priceMap = new Map<string, number | null>();
    
    const usTickers = [...new Set(activeTrades.filter((t) => !isKorean(t.ticker)).map((t) => t.ticker))];
    const krTickers = [...new Set(activeTrades.filter((t) => isKorean(t.ticker)).map((t) => t.ticker))];

    // US 가격 (Yahoo - batch)
    const usQuotesPromise = usTickers.length > 0 ? getYahooQuotes(usTickers) : Promise.resolve([]);
    
    // KR 가격 (KIS)
    const krQuotesPromises = krTickers.map(async (ticker) => ({
      symbol: ticker,
      price: await getKisDomesticPrice(ticker)
    }));

    const [usQuotes, krQuotes] = await Promise.all([
      usQuotesPromise,
      Promise.all(krQuotesPromises)
    ]);

    usQuotes.forEach((q) => priceMap.set(q.symbol, q.regularMarketPrice));
    krQuotes.forEach((q) => priceMap.set(q.symbol, q.price));

    // 2. 전체 매매 데이터 구성 및 매트릭스 부착
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
    return apiError(getErrorMessage(error) || '매매 데이터를 불러오는 중 오류가 발생했습니다.', 'FETCH_TRADES_FAILED', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();

    if (!id) {
      return apiError('수정할 매매 계획 ID가 필요합니다.', 'MISSING_TRADE_ID');
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.ticker !== undefined) {
      const ticker = String(body.ticker).trim().toUpperCase();
      if (!ticker) return apiError('티커가 필요합니다.', 'MISSING_TICKER');
      update.ticker = ticker;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return apiError('상태 값이 유효하지 않습니다.', 'INVALID_STATUS', 400, { allowed: VALID_STATUSES });
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
        return apiError(`${field} 값은 숫자여야 합니다.`, 'INVALID_NUMBER', 400, { field });
      }
      update[field] = value;
    }

    if (body.risk_percent !== undefined) {
      const riskPercent = normalizeRiskPercent(body.risk_percent);
      if (!riskPercent || riskPercent > 0.1) {
        return apiError('허용 손실 비율은 0% 초과 10% 이하로 입력해 주세요.', 'INVALID_RISK_PERCENT');
      }
      update.risk_percent = riskPercent;
    }

    if (body.total_shares !== undefined && body.position_size === undefined) {
      update.position_size = update.total_shares;
    }

    if (body.emotion_note !== undefined) {
      update.emotion_note = body.emotion_note === null ? null : String(body.emotion_note);
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
    return apiError(getErrorMessage(error) || '매매 계획 수정 중 오류가 발생했습니다.', 'UPDATE_TRADE_FAILED', 500);
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();

  if (!id) {
    return apiError('삭제할 매매 계획 ID가 필요합니다.', 'MISSING_TRADE_ID');
  }

  try {
    const { error } = await supabaseServer.from('trades').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ data: { id } });
  } catch (error: unknown) {
    console.error('Delete Trade Error:', error);
    return apiError(getErrorMessage(error) || '매매 계획 삭제 중 오류가 발생했습니다.', 'DELETE_TRADE_FAILED', 500);
  }
}
