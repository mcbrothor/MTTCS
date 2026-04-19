import axios from 'axios';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * DART API Provider
 * 대한민국 금융감독원 Open DART 연동 (Supabase 기반)
 */

const DART_API_BASE_URL = 'https://opendart.fss.or.kr/api';

export interface DartCompanyInfo {
  status: string;
  message: string;
  corp_code: string;
  corp_name: string;
  corp_name_eng: string;
  stock_name: string;
  stock_code: string;
  ceo_nm: string;
  corp_cls: string; // Y: 유가, K: 코스닥, N: 코넥스, E: 기타
  jurir_no: string;
  bizr_no: string;
  adres: string;
  hm_url: string;
  ir_url: string;
  phn_no: string;
  fax_no: string;
  induty_code: string;
  est_dt: string;
  acc_mt: string;
}

/**
 * 종목코드로 DART 고유번호를 조회합니다. (Supabase DB 사용)
 */
export async function getDartCorpCode(stockCode: string): Promise<string | null> {
  const cleanStockCode = stockCode.replace(/[^0-9]/g, '');
  if (!cleanStockCode) return null;

  try {
    const { data, error } = await supabaseServer
      .from('dart_corp_codes')
      .select('corp_code')
      .eq('stock_code', cleanStockCode)
      .maybeSingle();

    if (error) {
      console.error('Supabase error in getDartCorpCode:', error.message);
      return null;
    }

    return data ? data.corp_code : null;
  } catch (error) {
    console.error('Unexpected error in getDartCorpCode:', error);
    return null;
  }
}

/**
 * DART 기업 개황 정보를 조회합니다.
 */
export async function getDartCompanyInfo(corpCode: string): Promise<DartCompanyInfo | null> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.warn('DART_API_KEY is not defined');
    return null;
  }

  try {
    const url = `${DART_API_BASE_URL}/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;
    const response = await axios.get(url);
    const data = response.data as DartCompanyInfo;

    if (data.status !== '000') {
      console.error('DART API Error:', data.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching DART company info:', error);
    return null;
  }
}
