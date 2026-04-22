import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getYahooFundamentals } from '@/lib/finance/providers/yahoo-api';
import { getSecFundamentals } from '@/lib/finance/providers/sec-edgar-api';

// Vercel Pro 플랜 최대 실행 시간 (S&P500 500개 순차 처리)
export const maxDuration = 300;

/**
 * 미국 시장 펀더멘탈 캐시 구축 API (Admin용)
 *
 * S&P 500 종목의 Yahoo Finance + SEC EDGAR 펀더멘탈 데이터를
 * fundamental_cache 테이블에 미리 적재합니다.
 * 스캐너 실행 시 API 호출 없이 캐시에서 즉시 로드할 수 있습니다.
 */
export async function GET(_req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase Admin client is not configured' }, { status: 500 });
  }

  try {
    console.log('[US-SYNC] Fetching S&P 500 universe...');
    const universe = await getStandardScannerUniverse('US');
    console.log(`[US-SYNC] Target tickers: ${universe.length}`);

    let filled = 0;
    let failed = 0;
    const cacheRows: Array<Record<string, unknown>> = [];

    const BATCH_SIZE = 5;
    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (item) => {
          const ticker = item.ticker;
          try {
            // Yahoo Finance 기본 데이터
            const yahoo = await getYahooFundamentals(ticker);

            // SEC EDGAR 보강
            let edgar = null;
            try {
              edgar = await getSecFundamentals(ticker);
            } catch {
              // EDGAR 실패는 무시 (Yahoo만으로도 유효)
            }

            const merged = edgar
              ? {
                  epsGrowthPct: yahoo?.epsGrowthPct ?? edgar.epsGrowthPct,
                  revenueGrowthPct: yahoo?.revenueGrowthPct ?? edgar.revenueGrowthPct,
                  roePct: yahoo?.roePct ?? edgar.roePct,
                  debtToEquityPct: yahoo?.debtToEquityPct ?? edgar.debtToEquityPct,
                  source: edgar
                    ? `${edgar.source} + Yahoo`
                    : (yahoo?.source ?? 'Yahoo Finance'),
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
              console.log(`[US-SYNC] No data for ${ticker}`);
            }
          } catch (err) {
            failed++;
            console.log(`[US-SYNC] Error for ${ticker}: ${err instanceof Error ? err.message : 'unknown'}`);
          }
        })
      );

      // 배치 간 대기 (Yahoo 레이트 리밋 방어)
      if (i + BATCH_SIZE < universe.length) {
        await new Promise((res) => setTimeout(res, 400));
      }

      // 50개마다 중간 upsert (메모리 절약 + 부분 실패 보호)
      if (cacheRows.length >= 50) {
        const chunk = cacheRows.splice(0, cacheRows.length);
        const { error } = await supabaseAdmin
          .from('fundamental_cache')
          .upsert(chunk, { onConflict: 'ticker,market' });
        if (error) {
          console.warn('[US-SYNC] chunk upsert warning:', error.message);
        }
      }
    }

    // 남은 rows 저장
    if (cacheRows.length > 0) {
      const { error } = await supabaseAdmin
        .from('fundamental_cache')
        .upsert(cacheRows, { onConflict: 'ticker,market' });
      if (error) {
        console.warn('[US-SYNC] final upsert warning:', error.message);
      }
    }

    console.log(`[US-SYNC] Done. filled=${filled}, failed=${failed}`);

    return NextResponse.json({
      success: true,
      message: `S&P 500 ${filled}개 펀더멘탈 캐시 구축 완료 (실패 ${failed}개).`,
      target_count: universe.length,
      filled,
      failed,
    });
  } catch (error: unknown) {
    console.error('[US-SYNC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
