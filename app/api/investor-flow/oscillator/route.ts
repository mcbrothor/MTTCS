import { withAdminSession } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { calculateInvestorFlowOscillator } from '@/lib/recommendations/investor-flow-oscillator';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { KrInvestorFlowDaily } from '@/lib/recommendations/kr-investor-flow';

type FlowRow = {
  ticker: string; trade_date: string; foreign_net_buy_qty: number; institution_net_buy_qty: number;
  foreign_net_buy_amount_mkrw: number; institution_net_buy_amount_mkrw: number; turnover_amount_mkrw: number;
  provider: string; quality: 'FULL' | 'STALE'; observed_at: string; raw_json: Record<string, string>;
};

export const GET = withAdminSession(async (request: Request) => {
  try {
    const params = new URL(request.url).searchParams;
    const asOf = params.get('asOf') || new Date().toISOString().slice(0, 10);
    const start = new Date(`${asOf}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 30);
    const db = getSupabaseAdmin();
    const [{ data: rows, error }, { data: profiles, error: profileError }] = await Promise.all([
      db.from('kr_investor_flow_daily').select('*').gte('trade_date', start.toISOString().slice(0, 10)).lte('trade_date', asOf).order('trade_date').limit(5000),
      db.from('security_profiles').select('ticker,sector').eq('market', 'KR').limit(1000),
    ]);
    if (error) throw error;
    if (profileError) throw profileError;
    const mappedRows: KrInvestorFlowDaily[] = ((rows || []) as FlowRow[]).map((row) => ({
      ticker: row.ticker,
      tradeDate: row.trade_date,
      foreignNetBuyQty: Number(row.foreign_net_buy_qty || 0),
      institutionNetBuyQty: Number(row.institution_net_buy_qty || 0),
      foreignNetBuyAmountMkrw: Number(row.foreign_net_buy_amount_mkrw || 0),
      institutionNetBuyAmountMkrw: Number(row.institution_net_buy_amount_mkrw || 0),
      turnoverAmountMkrw: Number(row.turnover_amount_mkrw || 0),
      provider: row.provider,
      quality: row.quality,
      observedAt: row.observed_at,
      rawJson: row.raw_json || {},
    }));
    const sectors = Object.fromEntries((profiles || []).map((row) => [String(row.ticker), row.sector]));
    const requestedStocks = Math.max((profiles || []).length, new Set(mappedRows.map((row) => row.ticker)).size);
    const snapshot = calculateInvestorFlowOscillator({
      rows: mappedRows,
      sectors,
      requestedStocks,
      asOf,
      provider: 'KIS',
      universe: 'KOSPI200_KOSDAQ150',
    });
    const { error: snapshotError } = await db.from('investor_flow_oscillator_snapshots').upsert({
      market: 'KR', universe: snapshot.universe, as_of: asOf, model_version: snapshot.modelVersion,
      provider: snapshot.provider, quality: snapshot.quality, snapshot, updated_at: new Date().toISOString(),
    }, { onConflict: 'market,universe,as_of,model_version' });
    if (snapshotError) snapshot.warnings.push(`스냅샷 저장 실패: ${snapshotError.message}`);
    return apiSuccess(snapshot, { asOf, provider: snapshot.provider, source: 'MTN Investor Flow Engine' });
  } catch (error) {
    return apiError(getErrorMessage(error, '수급 오실레이터 계산에 실패했습니다.'), 'INVESTOR_FLOW_OSCILLATOR_FAILED', 500);
  }
});
