import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getYahooFundamentals } from '@/lib/finance/providers/yahoo-api';
import { getSecFundamentals } from '@/lib/finance/providers/sec-edgar-api';

// Hobby 플랜 10초 제한에 맞게 한 번 호출당 처리할 최대 종목 수
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

/**
 * 미국 시장 펀더멘탈 캐시 구축 API (Admin용)
 *
 * ?offset=0&limit=30 파라미터로 배치를 나눠 호출합니다.
 * 클라이언트(admin 페이지)가 has_more=true인 동안 offset을 올려가며 반복 호출합니다.
 *
 * 예: offset=0→30→60→...→480 (500개 ÷ 30 = 17번 호출)
 */
export async function GET(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase Admin client is not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)));

  try {
    const universe = await getStandardScannerUniverse('US');
    const slice = universe.slice(offset, offset + limit);
    const hasMore = offset + limit < universe.length;

    console.log(`[US-SYNC] offset=${offset} limit=${limit} slice=${slice.length} total=${universe.length}`);

    let filled = 0;
    let failed = 0;
    const cacheRows: Array<Record<string, unknown>> = [];

    const CONCURRENT = 5;
    for (let i = 0; i < slice.length; i += CONCURRENT) {
      const batch = slice.slice(i, i + CONCURRENT);

      await Promise.allSettled(
        batch.map(async (item) => {
          const ticker = item.ticker;
          try {
            const yahoo = await getYahooFundamentals(ticker);

            let edgar = null;
            try {
              edgar = await getSecFundamentals(ticker);
            } catch {
              // EDGAR 실패는 무시
            }

            const merged = edgar
              ? {
                  epsGrowthPct: yahoo?.epsGrowthPct ?? edgar.epsGrowthPct,
                  revenueGrowthPct: yahoo?.revenueGrowthPct ?? edgar.revenueGrowthPct,
                  roePct: yahoo?.roePct ?? edgar.roePct,
                  debtToEquityPct: yahoo?.debtToEquityPct ?? edgar.debtToEquityPct,
                  source: `${edgar.source} + Yahoo`,
                }
              : yahoo;

            const hasData =
              merged &&
              (merged.epsGrowthPct !== null ||
                merged.revenueGrowthPct !== null ||
                merged.roePct !== null);

            if (hasData && merged) {
              cacheRows.push({
                ticker,
                market: 'US',
                eps_growth_pct: merged.epsGrowthPct,
                revenue_growth_pct: merged.revenueGrowthPct,
                roe_pct: merged.roePct,
                debt_to_equity_pct: merged.debtToEquityPct,
                source: merged.source,
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
      const { error } = await supabaseAdmin
        .from('fundamental_cache')
        .upsert(cacheRows, { onConflict: 'ticker,market' });
      if (error) {
        console.warn('[US-SYNC] upsert warning:', error.message);
      }
    }

    return NextResponse.json({
      success: true,
      total_count: universe.length,
      offset,
      processed: slice.length,
      filled,
      failed,
      has_more: hasMore,
    });
  } catch (error: unknown) {
    console.error('[US-SYNC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
