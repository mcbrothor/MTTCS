import { validateCronRequest } from '@/lib/contest-cron';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { collectKrInvestorFlows, upsertKrInvestorFlowDaily } from '@/lib/recommendations/kr-investor-flow';
import { selectInvestorFlowBatch } from '@/lib/recommendations/investor-flow-batch';
import { collectKrSecurityProfiles, upsertKrSecurityProfiles } from '@/lib/recommendations/kr-security-profile';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  const params = new URL(request.url).searchParams;
  const asOfDate = params.get('date') || new Date().toISOString().slice(0, 10);
  const cursor = Math.max(0, Number(params.get('cursor') || 0));
  const batchSize = Math.min(40, Math.max(1, Number(params.get('size') || 20)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !Number.isInteger(cursor) || !Number.isInteger(batchSize)) {
    return apiError('date, cursor 또는 size 형식이 올바르지 않습니다.', 'INVALID_INPUT', 400);
  }
  try {
    const universe = await getStandardScannerUniverse('KR');
    const selection = selectInvestorFlowBatch({ tickers: universe.map((item) => item.ticker), cursor, batchSize });
    const db = getSupabaseAdmin();
    const collection = await collectKrInvestorFlows({
      tickers: selection.tickers,
      asOfDate,
      batchSize,
      concurrency: 2,
    });
    const rows = [...collection.results.values()].flat();
    await upsertKrInvestorFlowDaily(db, rows);
    const { data: existingProfiles, error: profileReadError } = await db
      .from('security_profiles')
      .select('ticker,sector')
      .eq('market', 'KR')
      .in('ticker', selection.tickers);
    if (profileReadError) throw profileReadError;
    const completeProfiles = new Set((existingProfiles || [])
      .filter((profile) => Boolean(profile.sector))
      .map((profile) => String(profile.ticker)));
    const profileItems = universe
      .filter((item) => selection.tickers.includes(item.ticker) && !completeProfiles.has(item.ticker))
      .map((item) => ({ ticker: item.ticker, exchange: item.exchange, name: item.name }));
    const profileCollection = await collectKrSecurityProfiles({ items: profileItems, concurrency: 2 });
    const profileSaved = await upsertKrSecurityProfiles(db, profileCollection.profiles);
    const warnings = [
      ...[...collection.errors].map(([ticker, message]) => `${ticker}: ${message}`),
      ...[...profileCollection.errors].map(([ticker, message]) => `${ticker} 업종: ${message}`),
    ];
    return apiSuccess({
      asOf: asOfDate,
      provider: collection.provider,
      quality: collection.errors.size === 0 && profileCollection.errors.size === 0 ? 'FULL' : rows.length > 0 ? 'DEGRADED' : 'BLOCKED',
      modelVersion: 'kr-investor-flow-collection-v2',
      warnings,
      cursor,
      nextCursor: selection.nextCursor,
      totalTickers: selection.allTickers.length,
      processedTickers: selection.tickers.length,
      savedRows: rows.length,
      profileSaved,
      retryCursor: collection.errors.size > 0 ? cursor : null,
    }, {
      observedAt: asOfDate,
      provider: collection.provider,
      source: 'KIS KR investor flow batch',
      delay: 'EOD',
      modelVersion: 'kr-investor-flow-collection-v2',
      warnings,
    });
  } catch (error) {
    return apiError(getErrorMessage(error, '수급 청크 수집에 실패했습니다.'), 'INVESTOR_FLOW_BATCH_FAILED', 500);
  }
}
