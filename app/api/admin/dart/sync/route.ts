import { NextResponse } from 'next/server';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';

/**
 * DART 고유번호 동기화 API — Phase 1~5 (매칭 + DB 저장)
 *
 * Phase 6 (Yahoo/Naver 폴백)은 별도 /api/admin/dart/fallback 배치 API에서 처리합니다.
 */

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
    const codeMatchedSet = new Set(dedupMap.keys());
    const codeUnmatched = [...targetMap.keys()].filter((t) => !codeMatchedSet.has(t));

    let nameMatchCount = 0;
    if (codeUnmatched.length > 0) {
      console.log(`[DART-SYNC] Phase 4b: name matching for ${codeUnmatched.length} unmatched tickers...`);

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

      for (const stockCode of codeUnmatched) {
        const info = targetMap.get(stockCode)!;
        const normalizedUniverseName = normalizeName(info.name);
        const dartEntry = dartNameIndex.get(normalizedUniverseName);

        if (dartEntry) {
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

    // ── 미매칭 종목 정보 (Phase 6 fallback은 /api/admin/dart/fallback에서 처리) ──
    const matchedTickers = new Set(upsertData.map((d) => d.stock_code));
    const unmatchedTickers = [...targetMap.keys()].filter((t) => !matchedTickers.has(t));
    const unmatchedDetails = unmatchedTickers.map((ticker) => {
      const info = targetMap.get(ticker)!;
      return { ticker, name: info.name, exchange: info.exchange };
    });

    const codeMatchedCount = codeMatchedSet.size;
    const nameMatchedCount = upsertData.length - codeMatchedCount;

    return NextResponse.json({
      success: true,
      message:
        upsertData.length === targetMap.size
          ? `전체 ${upsertData.length}개 종목 DART 동기화 완료.`
          : `DART ${upsertData.length}개 매칭(코드 ${codeMatchedCount}개+이름 ${nameMatchedCount}개), 미매칭 ${unmatchedTickers.length}개.`,
      target_count: targetMap.size,
      matched_count: upsertData.length,
      code_matched_count: codeMatchedCount,
      name_matched_count: nameMatchedCount,
      unmatched_count: unmatchedTickers.length,
      unmatched_details: unmatchedDetails,
    });
  } catch (error: unknown) {
    console.error('[DART-SYNC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
