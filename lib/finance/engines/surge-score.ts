/**
 * Surge Score Engine — 급등 및 거래량 폭발 스캐너를 위한 퀀트 엔진
 *
 * 이 엔진은 2개의 주요 축을 기반으로 주식을 필터링합니다:
 * 1. RVOL (Relative Volume): 최근 N일(기본 20일) 평균 거래량 대비 당일 거래량 비율. 
 *    - 2.0배 이상 시 비정상적 자금 유입(Unusual Volume)으로 간주
 * 2. ROC (Rate of Change): 전일 종가 대비 현재가 등락률.
 *    - 가격이 함께 오르지 않는 거래량 폭발(음수 ROC)은 패닉셀일 수 있으므로 최소 +3% 이상 필터링.
 */

import type { OHLCData } from '@/types';

export type SurgeGrade = 'EXPLOSIVE' | 'BREAKOUT' | 'WARM' | 'NONE';

export interface SurgeMetrics {
  rvol: number; // 상대 거래량 비율 (배수)
  roc: number;  // 등락률 (%)
  avgVolume20d: number; // 20일 평균 거래량
  currentVolume: number;
  grade: SurgeGrade;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * 전일 대비 등락률(ROC) 계산 (%)
 */
export function calculateROC(data: OHLCData[]): number {
  const len = data.length;
  if (len < 2) return 0;
  
  const current = data[len - 1].close;
  const prev = data[len - 2].close;
  
  if (prev === 0) return 0;
  
  return round(((current - prev) / prev) * 100, 2);
}

/**
 * RVOL (Relative Volume) 계산
 * 당일 거래량 / N일(기본 20일) 평균 거래량
 */
export function calculateRVOL(data: OHLCData[], period: number = 20): { rvol: number; avgVol: number; currentVol: number } {
  const len = data.length;
  if (len === 0) return { rvol: 0, avgVol: 0, currentVol: 0 };
  
  const currentVol = data[len - 1].volume;
  
  // N일 평균을 구할 때 당일(len-1)은 포함하지 않거나, 포함해서 구할 수 있음.
  // 보통 RVOL 계산 시 비교 대상인 평균에는 당일을 제외하는 것이 엄밀하나, 
  // 심플하게 당일 포함 최근 20일을 써도 무방. 여기선 당일 제외 최근 N일로 계산 (len > 1일 때).
  const lookback = Math.min(period, len - 1 > 0 ? len - 1 : 1);
  const startIdx = Math.max(0, len - 1 - lookback);
  
  let sum = 0;
  let count = 0;
  
  // 당일 제외 평균 (최근 N일)
  for (let i = startIdx; i < len - 1; i++) {
    sum += data[i].volume;
    count++;
  }
  
  // 데이터가 1일치밖에 없으면 자기 자신을 평균으로
  if (count === 0) {
    return { rvol: 1.0, avgVol: currentVol, currentVol };
  }
  
  const avgVol = sum / count;
  if (avgVol === 0) return { rvol: 0, avgVol: 0, currentVol };
  
  const rvol = currentVol / avgVol;
  
  return { 
    rvol: round(rvol, 2), 
    avgVol: Math.round(avgVol), 
    currentVol 
  };
}

/**
 * 주어신 RVOL과 ROC를 바탕으로 급등 등급 산출
 */
export function determineSurgeGrade(rvol: number, roc: number): SurgeGrade {
  if (rvol >= 3.0 && roc >= 5.0) {
    return 'EXPLOSIVE';
  }
  if (rvol >= 2.0 && roc >= 3.0) {
    return 'BREAKOUT';
  }
  if (rvol >= 1.5 && roc >= 1.0) {
    return 'WARM';
  }
  return 'NONE';
}

/**
 * 주어진 종목 데이터에 대해 Surge Metric 전체 객체를 반환
 */
export function analyzeSurge(data: OHLCData[]): SurgeMetrics | null {
  if (data.length < 5) return null; // 최소 5일의 데이터는 있어야 유의미

  const roc = calculateROC(data);
  const { rvol, avgVol, currentVol } = calculateRVOL(data, 20);
  const grade = determineSurgeGrade(rvol, roc);

  return {
    rvol,
    roc,
    avgVolume20d: avgVol,
    currentVolume: currentVol,
    grade,
  };
}
