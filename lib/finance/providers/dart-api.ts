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

export interface DartFinancialData {
  status: string;
  message: string;
  list?: {
    rcept_no: string;
    reprt_code: string;
    bsns_year: string;
    corp_code: string;
    stock_code: string;
    account_nm: string;   // 계정과목명 (실제 API 필드명)
    account_id: string;
    sj_div: string;
    sj_nm: string;
    thstrm_amount: string; // 당기금액
    frmtrm_amount: string; // 전기금액
    bfefrmtrm_amount: string; // 전전기금액
    currency: string;
  }[];
}

export interface FundamentalMetrics {
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  assets?: number;
  equity?: number;
  debt?: number;
  date: string;
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

/**
 * DART 단일회사 주요계정(연결/개별)을 조회합니다.
 */
export async function getDartFinancialData(
  corpCode: string,
  year: string,
  reprtCode: string,
  fsDiv: 'CFS' | 'OFS' = 'CFS'
): Promise<FundamentalMetrics | null> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${DART_API_BASE_URL}/fnlttSinglAcntAll.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reprtCode}&fs_div=${fsDiv}`;
    const response = await axios.get(url);
    const data = response.data as DartFinancialData;

    if (data.status !== '000' || !data.list) {
      // 000 외에는 데이터 없음 (예: 013 - 조회된 데이터가 없음)
      return null;
    }

    const metrics: FundamentalMetrics = {
      date: `${year}-${reprtCode === '11011' ? '12-31' : reprtCode === '11013' ? '03-31' : reprtCode === '11012' ? '06-30' : '09-30'}`
    };

    // 주요 계정 추출 (매출액, 영업이익, 당기순이익, 자산, 부채, 자본)
    // DART는 기업마다 계정명이 조금씩 다를 수 있으므로 포함(includes) 방식으로 체크
    for (const item of data.list) {
      const nm = item.account_nm.replace(/\s/g, '');
      const amount = parseInt(item.thstrm_amount || '0', 10);

      // 매출액 (금융업은 영업수익)
      if (nm.includes('매출액') || nm === '영업수익') {
        metrics.revenue = amount;
      } 
      // 영업이익
      else if (nm.includes('영업이익')) {
        metrics.operatingIncome = amount;
      } 
      // 당기순이익 (분기/반기순이익 포함)
      else if (nm.includes('당기순이익') || nm.includes('분기순이익') || nm.includes('반기순이익')) {
        // '연결'이 붙은 항목 우선순위는 fsDiv에서 이미 처리됨 (CFS/OFS)
        metrics.netIncome = amount;
      }
      // 자본 (ROE 계산용)
      else if (nm === '자본총계' || nm === '소유주지분' || nm === '자본') {
        metrics.equity = amount;
      }
      // 부채 (부채비율 계산용)
      else if (nm === '부채총계' || nm === '부채') {
        metrics.debt = amount;
      }
      // 자산
      else if (nm === '자산총계' || nm === '자산') {
        metrics.assets = amount;
      }
    }

    return metrics;
  } catch (error) {
    console.error(`Error fetching DART financial data (${year}, ${reprtCode}):`, error);
    return null;
  }
}
