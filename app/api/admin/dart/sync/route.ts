import { NextResponse } from 'next/server';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getYahooFundamentals } from '@/lib/finance/providers/yahoo-api';

/**
 * DART 고유번호 동기화 API (Admin용)
 *
 * Phase 1 — DART corpCode 동기화
 *   KOSPI 200 + KOSDAQ 150 (최대 350개) 종목의 DART 고유번호를 dart_corp_codes 테이블에 저장합니다.
 *   ※ XMLParser에 parseTagValue: false를 설정해 '005930' 같은 숫자형 문자열의 앞 0이
 *      손실되는 버그를 수정합니다.
 *
 * Phase 2 — Yahoo Finance 펀더멘탈 보강 (DART 미매칭 종목)
 *   DART에서 찾지 못한 종목에 대해 Yahoo Finance(quoteSummary)로
 *   EPS·매출·ROE·부채비율을 조회하여 fundamental_cache 테이블을 미리 채웁니다.
 */
export async function GET(_req: Request) {
  const apiKey = process.env.DART_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'DART_API_KEY is missing' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase Admin client is not configured' }, { status: 500 });
  }

  try {
    // ── Phase 1: 대상 유니버스 로드 ─────────────────────────────────────────
    console.log('[DART-SYNC] Fetching target universe (KOSPI200 + KOSDAQ150)...');
    const universe = await getStandardScannerUniverse('KR');

    // 6자리 zero-pad 정규화 (Naver에서 이미 6자리지만 방어 처리)
    const pad6 = (t: string) => t.replace(/[^0-9]/g, '').padStart(6, '0');
    const targetMap = new Map<string, { exchange: string; name: string }>(
      universe.map((item) => [pad6(item.ticker), { exchange: item.exchange, name: item.name }])
    );

    console.log(`[DART-SYNC] Target tickers: ${targetMap.size}`);

    // ── Phase 2: DART 전체 corpCode ZIP 다운로드 ──────────────────────────
    console.log('[DART-SYNC] Downloading DART corpCode ZIP...');
    const dartUrl = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`;
    const response = await axios.get(dartUrl, { responseType: 'arraybuffer' });

    const zip = new AdmZip(Buffer.from(response.data));
    const xmlEntry = zip.getEntries().find(
      (entry: { entryName: string }) => entry.entryName === 'CORPCODE.xml'
    );

    if (!xmlEntry) {
      throw new Error('CORPCODE.xml not found in DART ZIP');
    }

    // ── Phase 3: XML 파싱 (leading zero 보존) ────────────────────────────────
    // parseTagValue: false 없이는 '005930' → 숫자 5930 → String(5930) = '5930' 으로 앞 0 소실됨
    const xmlData = xmlEntry.getData().toString('utf-8');
    const parser = new XMLParser({ parseTagValue: false });
    const jsonObj = parser.parse(xmlData);
    const rawList = jsonObj.result?.list as Record<string, unknown>[] | undefined;

    if (!rawList || rawList.length === 0) {
      throw new Error('DART XML list is empty or malformed');
    }

    // ── Phase 4: 대상 종목 필터링 및 Supabase upsert ─────────────────────────
    // DART XML에는 같은 stock_code에 과거/신규 corp_code가 중복 존재할 수 있으므로
    // stock_code 기준으로 dedupe (modify_date 최신 우선) 후 stock_code를 conflict target으로 사용.
    console.log('[DART-SYNC] Filtering and preparing data for Supabase...');
    const dedupMap = new Map<
      string,
      {
        corp_code: string;
        corp_name: string;
        stock_code: string;
        modify_date: string;
        updated_at: string;
      }
    >();

    for (const item of rawList) {
      if (!item.stock_code) continue;
      const stockCode = pad6(String(item.stock_code));
      if (!targetMap.has(stockCode)) continue;

      const row = {
        corp_code: String(item.corp_code ?? '').trim().padStart(8, '0'),
        corp_name: String(item.corp_name ?? '').trim(),
        stock_code: stockCode,
        modify_date: String(item.modify_date ?? '').trim(),
        updated_at: new Date().toISOString(),
      };

      const existing = dedupMap.get(stockCode);
      if (!existing || row.modify_date > existing.modify_date) {
        dedupMap.set(stockCode, row);
      }
    }

    const upsertData = [...dedupMap.values()];

    console.log(`[DART-SYNC] Found ${upsertData.length} matching stocks in DART list.`);

    if (upsertData.length > 0) {
      // stock_code와 corp_code 모두 UNIQUE 제약이 있으므로, 양쪽으로 삭제 후 insert
      const stockCodes = upsertData.map((d) => d.stock_code);
      const corpCodes = upsertData.map((d) => d.corp_code);

      const { error: deleteByStockError } = await supabaseAdmin
        .from('dart_corp_codes')
        .delete()
        .in('stock_code', stockCodes);
      if (deleteByStockError) {
        throw new Error(`Supabase dart_corp_codes delete(stock_code) failed: ${deleteByStockError.message}`);
      }

      const { error: deleteByCorpError } = await supabaseAdmin
        .from('dart_corp_codes')
        .delete()
        .in('corp_code', corpCodes);
      if (deleteByCorpError) {
        throw new Error(`Supabase dart_corp_codes delete(corp_code) failed: ${deleteByCorpError.message}`);
      }

      const { error } = await supabaseAdmin.from('dart_corp_codes').insert(upsertData);

      if (error) {
        throw new Error(`Supabase dart_corp_codes insert failed: ${error.message}`);
      }
    }

    // ── Phase 5: Yahoo Finance fallback (DART 미매칭 종목 펀더멘탈 보강) ────
    const matchedTickers = new Set(upsertData.map((d) => d.stock_code));
    const unmatchedTickers = [...targetMap.keys()].filter((t) => !matchedTickers.has(t));

    console.log(
      `[DART-SYNC] ${unmatchedTickers.length} unmatched tickers → trying Yahoo Finance...`
    );

    let yahooFilled = 0;
    let yahooFailed = 0;
    const yahooCacheRows: Array<Record<string, unknown>> = [];

    // 동시 5개씩 처리 (Yahoo 레이트 리밋 방어)
    const BATCH_SIZE = 5;
    for (let i = 0; i < unmatchedTickers.length; i += BATCH_SIZE) {
      const batch = unmatchedTickers.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (ticker) => {
          const info = targetMap.get(ticker);
          const suffix = info?.exchange === 'KOSDAQ' ? '.KQ' : '.KS';
          const yahooTicker = `${ticker}${suffix}`;

          try {
            const data = await getYahooFundamentals(yahooTicker);
            const hasData =
              data &&
              (data.epsGrowthPct !== null ||
                data.revenueGrowthPct !== null ||
                data.roePct !== null);

            if (hasData && data) {
              yahooCacheRows.push({
                ticker,
                market: 'KR',
                eps_growth_pct: data.epsGrowthPct,
                revenue_growth_pct: data.revenueGrowthPct,
                roe_pct: data.roePct,
                debt_to_equity_pct: data.debtToEquityPct,
                source: `Yahoo Finance (${info?.name ?? ticker})`,
                updated_at: new Date().toISOString(),
              });
              yahooFilled++;
            } else {
              yahooFailed++;
            }
          } catch {
            yahooFailed++;
          }
        })
      );

      // 배치 간 짧은 대기 (Yahoo 레이트 리밋 방어)
      if (i + BATCH_SIZE < unmatchedTickers.length) {
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    // Yahoo 결과를 fundamental_cache에 저장
    if (yahooCacheRows.length > 0) {
      const { error: cacheError } = await supabaseAdmin
        .from('fundamental_cache')
        .upsert(yahooCacheRows, { onConflict: 'ticker,market' });

      if (cacheError) {
        console.warn('[DART-SYNC] fundamental_cache upsert warning:', cacheError.message);
      }
    }

    return NextResponse.json({
      success: true,
      message:
        upsertData.length === targetMap.size
          ? `전체 ${upsertData.length}개 종목 DART 동기화 완료.`
          : `DART ${upsertData.length}개 매칭, 미매칭 ${unmatchedTickers.length}개 중 Yahoo Finance ${yahooFilled}개 보강 완료.`,
      target_count: targetMap.size,
      matched_count: upsertData.length,
      unmatched_count: unmatchedTickers.length,
      yahoo_filled: yahooFilled,
      yahoo_failed: yahooFailed,
    });
  } catch (error: unknown) {
    console.error('[DART-SYNC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
