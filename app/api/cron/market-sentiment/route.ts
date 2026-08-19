import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/auth/cron';
import { refreshMarketSentimentInputs } from '@/lib/market-sentiment/collector';
import { calculateMarketSentiment } from '@/lib/market-sentiment/model';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  try {
    const db = getSupabaseAdmin();
    const collection = await refreshMarketSentimentInputs({ client: db });
    const { data, error } = await db.from('market_sentiment_inputs').select('*').order('trade_date', { ascending: false }).limit(400);
    if (error) throw error;
    const rows = [...(data || [])].reverse();
    const snapshot = calculateMarketSentiment({
      rows: rows.map((row) => ({
        date: row.trade_date,
        indexClose: row.index_close === null ? null : Number(row.index_close),
        putCall: row.put_call === null ? null : Number(row.put_call),
        vkospi: row.vkospi === null ? null : Number(row.vkospi),
        bond10: row.bond_10y === null ? null : Number(row.bond_10y),
        bond5: row.bond_5y === null ? null : Number(row.bond_5y),
      })),
      provider: rows.at(-1)?.provider || collection.provider,
    });
    const { error: snapshotError } = await db.from('market_sentiment_snapshots').upsert({
      market: 'KR',
      as_of: snapshot.asOf.slice(0, 10),
      model_version: snapshot.modelVersion,
      provider: snapshot.provider,
      quality: snapshot.quality,
      snapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'market,as_of,model_version' });
    if (snapshotError) throw snapshotError;
    return apiSuccess({ collection, snapshot }, {
      observedAt: snapshot.asOf,
      provider: snapshot.provider,
      source: 'KIS Korean market sentiment collector',
      delay: 'EOD',
      modelVersion: snapshot.modelVersion,
      warnings: [...collection.warnings, ...snapshot.warnings],
      isStale: snapshot.quality === 'BLOCKED',
      staleReason: snapshot.quality === 'BLOCKED' ? snapshot.warnings.join(' ') : null,
    });
  } catch (error) {
    return apiError(getErrorMessage(error, '시장 심리 수집에 실패했습니다.'), 'MARKET_SENTIMENT_CRON_FAILED', 500);
  }
}
