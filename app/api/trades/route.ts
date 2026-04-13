import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import type { TradeStatus } from '@/types';

const VALID_STATUSES: TradeStatus[] = ['PLANNED', 'COMPLETED', 'CANCELLED'];

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
      return apiError('v3.0 분석 근거와 피라미딩 계획이 필요합니다.', 'MISSING_V3_FIELDS');
    }

    const { data, error } = await supabase
      .from('trades')
      .insert([
        {
          ...body,
          ticker: String(body.ticker).toUpperCase(),
          chk_market: body.chk_market ?? body.chk_sepa,
          risk_percent: riskPercent,
          status: 'PLANNED',
          updated_at: new Date().toISOString(),
        },
      ])
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
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
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
    if (body.entry_targets !== undefined) update.entry_targets = body.entry_targets;
    if (body.trailing_stops !== undefined) update.trailing_stops = body.trailing_stops;
    if (body.sepa_evidence !== undefined) update.sepa_evidence = body.sepa_evidence;

    const { data, error } = await supabase
      .from('trades')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
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
    const { error } = await supabase.from('trades').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ data: { id } });
  } catch (error: unknown) {
    console.error('Delete Trade Error:', error);
    return apiError(getErrorMessage(error) || '매매 계획 삭제 중 오류가 발생했습니다.', 'DELETE_TRADE_FAILED', 500);
  }
}
