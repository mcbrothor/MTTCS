import { NextResponse } from 'next/server';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getYahooFundamentals } from '@/lib/finance/providers/yahoo-api';
import { getNaverFinanceFundamentals } from '@/lib/finance/providers/naver-api';

/**
 * DART 고유번호 동기화 API (Admin용)
 *
 * Phase 1 — DART corpCode 동기화
 *   KOSPI 200 + KOSDAQ 150 종목의 DART 고유번호를 dart_corp_codes 테이블에 저장합니다.
 *   1차: stock_code 정확 매칭
 *   2차: corp_name 정규화 매칭 (법인명에서 주식회사/㈜ 등 제거 후 비교)
 *
 * Phase 2 — 펀더멘탈 보강 (DART 미매칭 종목)
 *   Yahoo Finance → Naver Finance 순으로 시도합니다.
 */

/** 회사명에서 법인 접미사를 제거하고 공백을 없애 정규화합니다. */
function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/주식회사|㈜|\(주\)|\(株\)/g, '')
    .trim();
}

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
    const xmlData = xmlEntry.getData().toString('utf-8');
    const parser = new XMLParser({ parseTagValue: false });
    const jsonObj = parser.parse(xmlData);
    const rawList = jsonObj.result?.list as Record<string, unknown>[] | undefined;

    if (!rawList || rawList.length === 0) {
      throw new Error('DART XML list is empty or malformed');
    }

    console.log(`[DART-SYNC] DART XML total entries: ${rawList.length}`);

    // ── Phase 4a: stock_code 정확 매칭 ─────────────────────────────────────
    console.log('[DART-SYNC] Phase 4a: stock_code exact matching...');
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

    // stock_code 기반 1차 매칭
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

    console.log(`[DART-SYNC] Phase 4a result: ${dedupMap.size} matched by stock_code`);

    // ── Phase 4b: corp_name 정규화 2차 매칭 ────────────────────────────────
    // stock_code로 매칭된 종목 집합
    const codeMatchedSet = new Set(dedupMap.keys());
    const codeUnmatched = [...targetMap.keys()].filter((t) => !codeMatchedSet.has(t));

    if (codeUnmatched.length > 0) {
      console.log(`[DART-SYNC] Phase 4b: name matching for ${codeUnmatched.length} unmatched tickers...`);

      // DART에서 stock_code가 있는 종목의 정규화 이름 → entry 인덱스 구성
      const dartNameIndex = new Map<
        string,
        { corp_code: string; corp_name: string; modify_date: string }
      >();

      for (const item of rawList) {
        if (!item.stock_code) continue;
        const corpName = String(item.corp_name ?? '').trim();
        const normalized = normalizeName(corpName);
        if (normalized.length < 2) continue;

        const existing = dartNameIndex.get(normalized);
        const modDate = String(item.modify_date ?? '').trim();
        if (!existing || modDate > existing.modify_date) {
          dartNameIndex.set(normalized, {
            corp_code: String(item.corp_code ?? '').trim().padStart(8, '0'),
            corp_name: corpName,
            modify_date: modDate,
          });
        }
      }

      let nameMatchCount = 0;
      for (const stockCode of codeUnmatched) {
        const info = targetMap.get(stockCode)!;
        const normalizedUniverseName = normalizeName(info.name);
        const dartEntry = dartNameIndex.get(normalizedUniverseName);

        if (dartEntry) {
          console.log(
            `[DART-SYNC] NAME-MATCH: "${info.name}" (${stockCode}) → DART "${dartEntry.corp_name}" corp_code=${dartEntry.corp_code}`
          );
          dedupMap.set(stockCode, {
            corp_code: dartEntry.corp_code,
            corp_name: dartEntry.corp_name,
            stock_code: stockCode,
            modify_date: dartEntry.modify_date,
            updated_at: new Date().toISOString(),
          });
          nameMatchCount++;
        }
      }

      console.log(`[DART-SYNC] Phase 4b result: ${nameMatchCount} additional matches by name`);
    }

    // ── Phase 5: Supabase upsert ─────────────────────────────────────────
    const upsertData = [...dedupMap.values()];
    console.log(`[DART-SYNC] Total matched (code+name): ${upsertData.length}`);

    if (upsertData.length > 0) {
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

    // ── Phase 6: Yahoo → Naver 폴백 (최종 미매칭 종목 펀더멘탈 보강) ─────
    const matchedTickers = new Set(upsertData.map((d) => d.stock_code));
    const unmatchedTickers = [...targetMap.keys()].filter((t) => !matchedTickers.has(t));

    // 미매칭 종목 상세 정보 (로그 및 응답용)
    const unmatchedDetails = unmatchedTickers.map((ticker) => {
      const info = targetMap.get(ticker)!;
      return { ticker, name: info.name, exchange: info.exchange };
    });

    if (unmatchedDetails.length > 0) {
      console.log('[DART-SYNC] Final unmatched tickers:');
      for (const d of unmatchedDetails) {
        console.log(`  [UNMATCHED] ${d.ticker} "${d.name}" (${d.exchange})`);
      }
    }

    console.log(
      `[DART-SYNC] ${unmatchedTickers.length} unmatched → Yahoo Finance → Naver Finance fallback...`
    );

    let yahooFilled = 0;
    let yahooFailed = 0;
    let naverFilled = 0;
    let naverFailed = 0;
    const yahooCacheRows: Array<Record<string, unknown>> = [];

    const BATCH_SIZE = 5;
    for (let i = 0; i < unmatchedTickers.length; i += BATCH_SIZE) {
      const batch = unmatchedTickers.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (ticker) => {
          const info = targetMap.get(ticker);
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
              return;
            }
          } catch {
            // Yahoo 실패 시 Naver로 폴백
          }
          yahooFailed++;

          // 2차: Naver Finance 폴백
          try {
            const naverData = await getNaverFinanceFundamentals(ticker);
            const hasNaverData =
              naverData &&
              (naverData.epsGrowthPct !== null ||
                naverData.revenueGrowthPct !== null ||
                naverData.roePct !== null);

            if (hasNaverData && naverData) {
              yahooCacheRows.push({
                ticker,
                market: 'KR',
                eps_growth_pct: naverData.epsGrowthPct,
                revenue_growth_pct: naverData.revenueGrowthPct,
                roe_pct: naverData.roePct,
                debt_to_equity_pct: naverData.debtToEquityPct,
                source: `Naver Finance (${info?.name ?? ticker})`,
                updated_at: new Date().toISOString(),
              });
              naverFilled++;
              console.log(`[DART-SYNC] Naver fallback success: ${ticker} "${info?.name}"`);
            } else {
              naverFailed++;
              console.log(`[DART-SYNC] Naver fallback failed: ${ticker} "${info?.name}"`);
            }
          } catch {
            naverFailed++;
            console.log(`[DART-SYNC] Naver fallback error: ${ticker} "${info?.name}"`);
          }
        })
      );

      if (i + BATCH_SIZE < unmatchedTickers.length) {
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    // Yahoo + Naver 결과를 fundamental_cache에 저장
    if (yahooCacheRows.length > 0) {
      const { error: cacheError } = await supabaseAdmin
        .from('fundamental_cache')
        .upsert(yahooCacheRows, { onConflict: 'ticker,market' });

      if (cacheError) {
        console.warn('[DART-SYNC] fundamental_cache upsert warning:', cacheError.message);
      }
    }

    const codeMatchedCount = codeMatchedSet.size;
    const nameMatchedCount = upsertData.length - codeMatchedCount;

    return NextResponse.json({
      success: true,
      message:
        upsertData.length === targetMap.size
          ? `전체 ${upsertData.length}개 종목 DART 동기화 완료.`
          : `DART ${upsertData.length}개 매칭(코드 ${codeMatchedCount}개+이름 ${nameMatchedCount}개), 미매칭 ${unmatchedTickers.length}개 중 Yahoo ${yahooFilled}개·Naver ${naverFilled}개 보강 완료.`,
      target_count: targetMap.size,
      matched_count: upsertData.length,
      code_matched_count: codeMatchedCount,
      name_matched_count: nameMatchedCount,
      unmatched_count: unmatchedTickers.length,
      yahoo_filled: yahooFilled,
      yahoo_failed: yahooFailed,
      naver_filled: naverFilled,
      naver_failed: naverFailed,
      unmatched_details: unmatchedDetails,
    });
  } catch (error: unknown) {
    console.error('[DART-SYNC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
