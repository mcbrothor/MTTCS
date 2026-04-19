/**
 * DART (Data Analysis, Retrieval and Transfer System) API Provider
 * 대한민국 금융감독원 공시 시스템 연동을 위한 프로바이더입니다.
 */

const DART_API_BASE_URL = 'https://opendart.fss.or.kr/api';

export interface DartCompanyInfo {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  modify_date: string;
}

/**
 * 기업 개황 조회 (뼈대)
 * @param corpCode 법인코드
 */
export async function getDartCompanyInfo(corpCode: string): Promise<any> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.warn('DART_API_KEY is not defined');
    return null;
  }

  // 뼈대 구현: 실제 호출은 향후 API 키 확보 후 활성화
  // const url = `${DART_API_BASE_URL}/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;
  // const response = await fetch(url);
  // return response.json();
  
  return { message: 'DART API Provider skeleton is ready' };
}

/**
 * 상장기업 고유번호 조회
 * (DART API는 종목코드가 아닌 각 기업별 고유번호를 사용합니다)
 */
export async function getDartCorpCode(stockCode: string): Promise<string | null> {
  // 뼈대 구현: 종목코드와 DART 고유번호 매핑 로직 필요
  return null;
}
