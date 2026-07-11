import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { calculatePerformanceAttribution } from '@/lib/finance/core/performance-attribution';
import { supabaseServer } from '@/lib/supabase/server';
import type { Trade } from '@/types';

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const params = new URL(request.url).searchParams;
    const market = params.get('market') || 'ALL';
    const { data, error } = await supabaseServer.from('trades').select('*, trade_executions(*)').eq('status', 'COMPLETED').order('updated_at');
    if (error) throw error;
    const trades = ((data || []) as unknown as Trade[]).filter((trade) => market === 'ALL' || (market === 'KR' ? /^\d{6}$/.test(trade.ticker) : !/^\d{6}$/.test(trade.ticker)));
    const startingEquity = Number(params.get('startingEquity') || trades.at(0)?.total_equity || 0);
    return apiSuccess(calculatePerformanceAttribution(trades, startingEquity), { source: 'MTN trades', provider: 'Supabase', delay: 'EOD', modelVersion: 'performance-2026.06-v1' });
  } catch (error) {
    return apiError(getErrorMessage(error, '성과 귀속 계산 실패'), 'API_ERROR', 500);
  }
}
