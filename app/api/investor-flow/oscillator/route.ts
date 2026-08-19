import { withAdminSession } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { calculateInvestorFlowOscillator } from '@/lib/recommendations/investor-flow-oscillator';
import { readInvestorFlowRows } from '@/lib/recommendations/investor-flow-read';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { KrInvestorFlowDaily } from '@/lib/recommendations/kr-investor-flow';

export const GET = withAdminSession(async (request: Request) => {
  try {
    const params = new URL(request.url).searchParams;
    const asOf = params.get('asOf') || new Date().toISOString().slice(0, 10);
    const start = new Date(`${asOf}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 30);
    const db = getSupabaseAdmin();
    const [rows, { data: profiles, error: profileError }, universeResult] = await Promise.all([
      readInvestorFlowRows({ client: db, startDate: start.toISOString().slice(0, 10), endDate: asOf }),
      db.from('security_profiles').select('ticker,sector').eq('market', 'KR').limit(1000),
      getStandardScannerUniverse('KR').catch(() => []),
    ]);
    if (profileError) throw profileError;
    const mappedRows: KrInvestorFlowDaily[] = rows.map((row) => ({
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
    const requestedStocks = Math.max(universeResult.length, new Set(mappedRows.map((row) => row.ticker)).size);
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
    return apiSuccess(snapshot, {
      observedAt: snapshot.asOf,
      provider: snapshot.provider,
      source: 'MTN Investor Flow Engine',
      delay: 'EOD',
      modelVersion: snapshot.modelVersion,
      warnings: snapshot.warnings,
      isStale: snapshot.quality === 'STALE' || snapshot.quality === 'BLOCKED',
      staleReason: snapshot.quality === 'STALE' || snapshot.quality === 'BLOCKED' ? snapshot.warnings.join(' ') : null,
    });
  } catch (error) {
    return apiError(getErrorMessage(error, '수급 오실레이터 계산에 실패했습니다.'), 'INVESTOR_FLOW_OSCILLATOR_FAILED', 500);
  }
});
