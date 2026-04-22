import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getYahooFundamentals } from '@/lib/finance/providers/yahoo-api';
import { getNaverFinanceFundamentals } from '@/lib/finance/providers/naver-api';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

/**
 * DART 미매칭 종목 Yahoo/Naver 폴백 배치 API
 *
 * dart_corp_codes에 없는 유니버스 종목을 찾아 Yahoo → Naver 순으로
 * 펀더멘탈을 보강하고 fundamental_cache에 저장합니다.
 *
 * ?offset=0&limit=10 파라미터로 배치를 나눠 호출합니다.
 */
export async function GET(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase Admin client is not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)));

  try {
    // 유니버스 로드 (Naver scraping — Next.js fetch cache로 30분 캐시)
    const universe = await getStandardScannerUniverse('KR');
    const pad6 = (t: string) => t.replace(/[^0-9]/g, '').padStart(6, '0');
    const universeMap = new Map<string, { name: string; exchange: string }>(
      universe.map((item) => [pad6(item.ticker), { name: item.name, exchange: item.exchange }])
    );

    // dart_corp_codes에서 이미 매칭된 stock_code 조회
    const universeKeys = [...universeMap.keys()];
    const { data: matched, error: dbError } = await supabaseAdmin
      .from('dart_corp_codes')
      .select('stock_code')
      .in('stock_code', universeKeys);

    if (dbError) {
      throw new Error(`dart_corp_codes query failed: ${dbError.message}`);
    }

    const matchedSet = new Set((matched ?? []).map((r: { stock_code: string }) => r.stock_code));
    const unmatched = universeKeys.filter((t) => !matchedSet.has(t));

    const slice = unmatched.slice(offset, offset + limit);
    const hasMore = offset + limit < unmatched.length;

    console.log(`[DART-FALLBACK] offset=${offset} limit=${limit} slice=${slice.length} total_unmatched=${unmatched.length}`);

    let filled = 0;
    let failed = 0;
    const cacheRows: Array<Record<string, unknown>> = [];

    const CONCURRENT = 5;
    for (let i = 0; i < slice.length; i += CONCURRENT) {
      const batch = slice.slice(i, i + CONCURRENT);

      await Promise.allSettled(
        batch.map(async (ticker) => {
          const info = universeMap.get(ticker);
          const suffix = info?.exchange === 'KOSDAQ' ? '.KQ' : '.KS';
          const yahooTicker = `${ticker}${suffix}`;

          // 1차: Yahoo Finance
          try {
            const data = await getYahooFundamentals(yahooTicker);
            const hasData =
              data &&
              (data.epsGrowthPct !== null ||
                data.revenueGrowthPct !== null ||
                data.roePct !== null);

            if (hasData && data) {
              cacheRows.push({
                ticker,
                market: 'KR',
                eps_growth_pct: data.epsGrowthPct,
                revenue_growth_pct: data.revenueGrowthPct,
                roe_pct: data.roePct,
                debt_to_equity_pct: data.debtToEquityPct,
                source: `Yahoo Finance (${info?.name ?? ticker})`,
                updated_at: new Date().toISOString(),
              });
              filled++;
              return;
            }
          } catch {
            // Yahoo 실패 시 Naver로 폴백
          }

          // 2차: Naver Finance 폴백
          try {
            const naverData = await getNaverFinanceFundamentals(ticker);
            const hasNaverData =
              naverData &&
              (naverData.epsGrowthPct !== null ||
                naverData.revenueGrowthPct !== null ||
                naverData.roePct !== null);

            if (hasNaverData && naverData) {
              cacheRows.push({
                ticker,
                market: 'KR',
                eps_growth_pct: naverData.epsGrowthPct,
                revenue_growth_pct: naverData.revenueGrowthPct,
                roe_pct: naverData.roePct,
                debt_to_equity_pct: naverData.debtToEquityPct,
                source: `Naver Finance (${info?.name ?? ticker})`,
                updated_at: new Date().toISOString(),
              });
              filled++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        })
      );

      if (i + CONCURRENT < slice.length) {
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    if (cacheRows.length > 0) {
      const { error: cacheError } = await supabaseAdmin
        .from('fundamental_cache')
        .upsert(cacheRows, { onConflict: 'ticker,market' });

      if (cacheError) {
        console.warn('[DART-FALLBACK] fundamental_cache upsert warning:', cacheError.message);
      }
    }

    return NextResponse.json({
      success: true,
      total_count: unmatched.length,
      offset,
      processed: slice.length,
      filled,
      failed,
      has_more: hasMore,
    });
  } catch (error: unknown) {
    console.error('[DART-FALLBACK] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
