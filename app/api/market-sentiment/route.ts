import { withAdminSession } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { calculateMarketSentiment } from '@/lib/market-sentiment/model';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const GET = withAdminSession(async () => {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('market_sentiment_inputs').select('*').order('trade_date', { ascending: false }).limit(400);
    if (error) throw error;
    const ordered = [...(data || [])].reverse();
    const snapshot = calculateMarketSentiment({
      rows: ordered.map((row) => ({
        date: row.trade_date,
        indexClose: row.index_close === null ? null : Number(row.index_close),
        putCall: row.put_call === null ? null : Number(row.put_call),
        vkospi: row.vkospi === null ? null : Number(row.vkospi),
        bond10: row.bond_10y === null ? null : Number(row.bond_10y),
        bond5: row.bond_5y === null ? null : Number(row.bond_5y),
      })),
      provider: ordered.at(-1)?.provider || 'UNAVAILABLE',
    });
    const { error: snapshotError } = await db.from('market_sentiment_snapshots').upsert({
      market: 'KR', as_of: snapshot.asOf.slice(0, 10), model_version: snapshot.modelVersion,
      provider: snapshot.provider, quality: snapshot.quality, snapshot, updated_at: new Date().toISOString(),
    }, { onConflict: 'market,as_of,model_version' });
    if (snapshotError) snapshot.warnings.push(`스냅샷 저장 실패: ${snapshotError.message}`);
    return apiSuccess(snapshot, { asOf: snapshot.asOf, provider: snapshot.provider, source: 'MTN Korean Fear & Greed' });
  } catch (error) {
    return apiError(getErrorMessage(error, '시장 심리를 계산하지 못했습니다.'), 'MARKET_SENTIMENT_FAILED', 500);
  }
});
