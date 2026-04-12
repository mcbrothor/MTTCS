import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sepaStatus = body.sepa_evidence?.status;
    const totalShares = Number(body.total_shares ?? body.position_size ?? 0);
    const plannedRisk = Number(body.planned_risk ?? 0);

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
