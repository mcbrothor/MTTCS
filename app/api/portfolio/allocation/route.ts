import { withAdminSession } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { calculateHaaAllocation, HAA_CANARY, HAA_CASH, HAA_DEFENSIVE_UNIVERSE, HAA_OFFENSIVE_UNIVERSE } from '@/lib/finance/core/asset-allocation';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { OHLCData } from '@/types';

function toMonthly(rows: OHLCData[]) {
  const byMonth = new Map<string, OHLCData>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) byMonth.set(row.date.slice(0, 7), row);
  return [...byMonth.values()].map((row) => ({ date: row.date, close: row.close }));
}

export const GET = withAdminSession(async (_request: Request, _context, session) => {
  try {
    const tickers = [...HAA_OFFENSIVE_UNIVERSE, ...HAA_DEFENSIVE_UNIVERSE, HAA_CANARY, HAA_CASH];
    const [priceResults, settingsResult, tradesResult] = await Promise.all([
      Promise.allSettled(tickers.map((ticker) => getYahooDailyPrice(ticker, { range: '2y' }))),
      getSupabaseAdmin().from('portfolio_settings').select('total_equity').eq('market', 'US').maybeSingle(),
      getSupabaseAdmin().from('trades').select('ticker,position_size,entry_price,status').eq('status', 'ACTIVE'),
    ]);
    const monthlyPrices = Object.fromEntries(tickers.map((ticker, index) => [
      ticker,
      priceResults[index].status === 'fulfilled' ? toMonthly(priceResults[index].value) : [],
    ]));
    const accountValue = Number(settingsResult.data?.total_equity || 0) || null;
    const positionValues = Object.fromEntries((tradesResult.data || []).map((row) => [
      String(row.ticker).toUpperCase(), Number(row.position_size || 0) * Number(row.entry_price || 0),
    ]));
    const currentWeightsPct = Object.fromEntries(tickers.map((ticker) => [
      ticker,
      accountValue ? ((positionValues[ticker] || 0) / accountValue) * 100 : null,
    ]));
    const asOf = priceResults.flatMap((result) => result.status === 'fulfilled' ? [result.value.at(-1)?.date] : []).filter(Boolean).sort().at(-1)
      || new Date().toISOString().slice(0, 10);
    const recommendation = calculateHaaAllocation({ monthlyPrices, asOf, provider: 'Yahoo Finance', accountValue, currentWeightsPct });
    if (settingsResult.error) recommendation.warnings.push('포트폴리오 기준금액을 불러오지 못해 금액 차이를 생략했습니다.');
    if (tradesResult.error) recommendation.warnings.push('현재 보유비중을 불러오지 못해 증감액을 생략했습니다.');
    const { error: snapshotError } = await getSupabaseAdmin().from('asset_allocation_snapshots').upsert({
      user_id: session.systemId, strategy: 'HAA', as_of: recommendation.asOf.slice(0, 10),
      model_version: recommendation.modelVersion, provider: recommendation.provider,
      quality: recommendation.quality, snapshot: recommendation, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,strategy,as_of,model_version' });
    if (snapshotError) recommendation.warnings.push(`스냅샷 저장 실패: ${snapshotError.message}`);
    return apiSuccess(recommendation, { asOf: recommendation.asOf, provider: recommendation.provider, source: 'MTN HAA Engine' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'HAA 비중 제안을 만들지 못했습니다.'), 'ALLOCATION_FAILED', 500);
  }
});
