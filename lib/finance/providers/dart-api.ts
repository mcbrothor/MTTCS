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
    account_nm: string;
    account_id: string;
    fs_div: string;      // CFS: 연결재무제표, OFS: 재무제표
    sj_div: string;      // BS: 재무상태표, IS: 손익계산서, CF: 현금흐름표
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
  // 전기 데이터 (YoY 성장률 계산용, 별도 API 호출 불필요)
  priorRevenue?: number;
  priorNetIncome?: number;
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
 * DART 단일회사 주요계정을 조회합니다. (fnlttSinglAcnt: 주요계정 전용 엔드포인트)
 * frmtrm_amount(전기)를 함께 반환하므로 YoY 계산에 추가 API 호출 불필요.
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
    const url = `${DART_API_BASE_URL}/fnlttSinglAcnt.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reprtCode}&fs_div=${fsDiv}`;
    const response = await axios.get(url);
    const data = response.data as DartFinancialData;

    if (data.status !== '000' || !data.list) {
      return null;
    }

    // fs_div 필터링 (API가 CFS+OFS 혼합 반환하는 경우 대비)
    // fsDiv=CFS 요청 시 OFS도 포함되어 반환되므로 명시적 필터 필요
    const filtered = data.list.filter((item) => item.fs_div === fsDiv);
    // CFS 없으면 OFS로 폴백 (소규모 기업)
    const items = filtered.length > 0 ? filtered : data.list;

    const parseAmount = (s: string) => {
      const n = parseInt((s || '').replace(/,/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    };

    const metrics: FundamentalMetrics = {
      date: `${year}-${reprtCode === '11011' ? '12-31' : reprtCode === '11013' ? '03-31' : reprtCode === '11012' ? '06-30' : '09-30'}`
    };

    // 주요계정 엔드포인트는 계정명이 정형화되어 있으므로 정확히 매칭
    for (const item of items) {
      const nm = item.account_nm.replace(/\s/g, '');
      const cur = parseAmount(item.thstrm_amount);
      const prior = parseAmount(item.frmtrm_amount);

      if (nm === '매출액' || nm === '영업수익') {
        if (metrics.revenue === undefined) {
          metrics.revenue = cur;
          metrics.priorRevenue = prior;
        }
      } else if (nm === '영업이익' || nm === '영업이익(손실)') {
        if (metrics.operatingIncome === undefined) metrics.operatingIncome = cur;
      } else if (nm === '당기순이익' || nm === '당기순이익(손실)' || nm === '분기순이익' || nm === '반기순이익') {
        if (metrics.netIncome === undefined) {
          metrics.netIncome = cur;
          metrics.priorNetIncome = prior;
        }
      } else if (nm === '자본총계') {
        if (metrics.equity === undefined) metrics.equity = cur;
      } else if (nm === '부채총계') {
        if (metrics.debt === undefined) metrics.debt = cur;
      } else if (nm === '자산총계') {
        if (metrics.assets === undefined) metrics.assets = cur;
      }
    }

    return metrics;
  } catch (error) {
    console.error(`Error fetching DART financial data (${year}, ${reprtCode}):`, error);
    return null;
  }
}
