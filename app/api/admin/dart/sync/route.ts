import { NextResponse } from 'next/server';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';

/**
 * DART 고유번호 동기화 API (Admin용)
 * 상위 350개 종목(KOSPI 200, KOSDAQ 150)에 대해서만 DART 고유번호를 Supabase에 저장합니다.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const apiKey = process.env.DART_API_KEY;
  const adminSecret = process.env.ADMIN_SECRET; // 보안을 위한 시크릿 (필요 시)
  
  // 간단한 보안 체크 (옵션)
  // const secret = searchParams.get('secret');
  // if (adminSecret && secret !== adminSecret) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  if (!apiKey) {
    return NextResponse.json({ error: 'DART_API_KEY is missing' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase Admin client is not configured' }, { status: 500 });
  }

  try {
    console.log('[DART-SYNC] Fetching target universe (Top 350)...');
    // 1. 대상 종목 (KOSPI 200 + KOSDAQ 150) 가져오기
    const universe = await getStandardScannerUniverse('KR');
    const targetTickers = new Set(universe.map(item => item.ticker.replace(/[^0-9]/g, '')));
    
    console.log(`[DART-SYNC] Target tickers: ${targetTickers.size}`);

    // 2. DART 전체 고유번호 ZIP 다운로드
    console.log('[DART-SYNC] Downloading DART corpCode ZIP...');
    const dartUrl = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`;
    const response = await axios.get(dartUrl, { responseType: 'arraybuffer' });
    
    // 3. 압축 해제 및 XML 파싱
    const zip = new AdmZip(Buffer.from(response.data));
    const zipEntries = zip.getEntries();
    const xmlEntry = zipEntries.find((entry: { entryName: string }) => entry.entryName === 'CORPCODE.xml');

    if (!xmlEntry) {
      throw new Error('CORPCODE.xml not found in DART ZIP');
    }

    const xmlData = xmlEntry.getData().toString('utf-8');
    const parser = new XMLParser();
    const jsonObj = parser.parse(xmlData);
    const rawList = jsonObj.result.list as Record<string, unknown>[];

    // 4. 대상 종목만 필터링
    console.log('[DART-SYNC] Filtering and preparing data for Supabase...');
    const upsertData = rawList
      .filter(item => {
        const stockCode = item.stock_code ? String(item.stock_code).trim() : '';
        return targetTickers.has(stockCode);
      })
      .map(item => ({
        corp_code: String(item.corp_code).padStart(8, '0'),
        corp_name: item.corp_name,
        stock_code: String(item.stock_code).trim(),
        modify_date: item.modify_date,
        updated_at: new Date().toISOString()
      }));

    console.log(`[DART-SYNC] Found ${upsertData.length} matching stocks in DART list.`);

    // 5. Supabase Upsert (일괄 저장)
    if (upsertData.length > 0) {
      const { error } = await supabaseAdmin
        .from('dart_corp_codes')
        .upsert(upsertData, { onConflict: 'corp_code' });

      if (error) {
        throw new Error(`Supabase upsert failed: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized ${upsertData.length} corp codes.`,
      target_count: targetTickers.size,
      matched_count: upsertData.length
    });

  } catch (error: unknown) {
    console.error('[DART-SYNC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      success: false, 
      error: message
    }, { status: 500 });
  }
}
