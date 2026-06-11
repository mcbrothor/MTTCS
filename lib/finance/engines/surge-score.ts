/**
 * Surge Score Engine — 급등 및 거래량 폭발 스캐너를 위한 퀀트 엔진
 *
 * 이 엔진은 2개의 주요 축을 기반으로 주식을 필터링합니다:
 * 1. RVOL (Relative Volume): 최근 N일(기본 20일) 평균 거래량 대비 당일 거래량 비율. 
 *    - 2.0배 이상 시 비정상적 자금 유입(Unusual Volume)으로 간주
 * 2. ROC (Rate of Change): 전일 종가 대비 현재가 등락률.
 *    - 가격이 함께 오르지 않는 거래량 폭발(음수 ROC)은 패닉셀일 수 있으므로 최소 +3% 이상 필터링.
 *
 * 장 중(intraday) 호출 시 Yahoo Finance 일봉이 부분 거래량만 반환하는 문제를 보정합니다.
 */

import type { OHLCData } from '@/types';

export type SurgeGrade = 'EXPLOSIVE' | 'BREAKOUT' | 'WARM' | 'NONE';

export interface SurgeMetrics {
  rvol: number;            // 상대 거래량 비율 (배수) — 장 중이면 보정된 값
  rawRvol: number;         // 보정 전 원본 RVOL
  roc: number;             // 등락률 (%)
  avgVolume20d: number;    // 20일 평균 거래량
  currentVolume: number;   // 당일 실 거래량 (보정 전)
  estimatedVolume: number; // 보정된 추정 거래량 (장 마감 시 = currentVolume과 동일)
  grade: SurgeGrade;
  isIntraday: boolean;     // 장 중 추정치 여부
}

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// ── 미국 시장 장 운영 시간 판별 ──────────────────────────────────

const US_MARKET_OPEN_HOUR = 9;   // EST 9:30 AM
const US_MARKET_OPEN_MIN = 30;
const US_MARKET_CLOSE_HOUR = 16; // EST 4:00 PM
const US_TOTAL_MINUTES = (US_MARKET_CLOSE_HOUR * 60) - (US_MARKET_OPEN_HOUR * 60 + US_MARKET_OPEN_MIN); // 390분

/**
 * 현재 시각이 미국 장 운영 시간 내인지 판별하고, 경과 비율(0~1)을 반환합니다.
 * 장 외 시간이면 null을 반환합니다.
 */
export function getUsMarketProgress(): { isOpen: boolean; elapsedRatio: number } {
  const now = new Date();
  // EST(UTC-5) / EDT(UTC-4) 대응 — 간단히 현재 시각을 ET로 변환
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etString);
  const hour = et.getHours();
  const min = et.getMinutes();
  const dayOfWeek = et.getDay(); // 0=Sun, 6=Sat

  // 주말
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isOpen: false, elapsedRatio: 1 };
  }

  const currentMinutes = hour * 60 + min;
  const openMinutes = US_MARKET_OPEN_HOUR * 60 + US_MARKET_OPEN_MIN;
  const closeMinutes = US_MARKET_CLOSE_HOUR * 60;

  if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
    return { isOpen: false, elapsedRatio: 1 };
  }

  const elapsed = currentMinutes - openMinutes;
  return { isOpen: true, elapsedRatio: Math.max(0.05, elapsed / US_TOTAL_MINUTES) };
}

/**
 * 한국 시장 장 운영 시간 판별 (09:00 ~ 15:30 KST)
 */
export function getKrMarketProgress(): { isOpen: boolean; elapsedRatio: number } {
  const now = new Date();
  const kstString = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
  const kst = new Date(kstString);
  const hour = kst.getHours();
  const min = kst.getMinutes();
  const dayOfWeek = kst.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isOpen: false, elapsedRatio: 1 };
  }

  const currentMinutes = hour * 60 + min;
  const openMinutes = 9 * 60;      // 09:00
  const closeMinutes = 15 * 60 + 30; // 15:30
  const totalMinutes = closeMinutes - openMinutes; // 390분

  if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
    return { isOpen: false, elapsedRatio: 1 };
  }

  const elapsed = currentMinutes - openMinutes;
  return { isOpen: true, elapsedRatio: Math.max(0.05, elapsed / totalMinutes) };
}

// ── 핵심 분석 함수 ──────────────────────────────────

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
  
  const lookback = Math.min(period, len - 1 > 0 ? len - 1 : 1);
  const startIdx = Math.max(0, len - 1 - lookback);
  
  let sum = 0;
  let count = 0;
  
  for (let i = startIdx; i < len - 1; i++) {
    sum += data[i].volume;
    count++;
  }
  
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
 * 주어진 RVOL과 ROC를 바탕으로 급등 등급 산출
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
 * 주어진 종목 데이터에 대해 Surge Metric 전체 객체를 반환합니다.
 *
 * @param isKr - 한국 시장 종목 여부 (true면 KST 장 시간 기준 판별)
 */
export function analyzeSurge(data: OHLCData[], isKr = false): SurgeMetrics | null {
  if (data.length < 5) return null;

  const roc = calculateROC(data);
  const { rvol: rawRvol, avgVol, currentVol } = calculateRVOL(data, 20);

  // 장 중 부분 거래량 보정
  const marketProgress = isKr ? getKrMarketProgress() : getUsMarketProgress();
  const isIntraday = marketProgress.isOpen;

  let estimatedVolume = currentVol;
  let adjustedRvol = rawRvol;

  if (isIntraday && avgVol > 0) {
    // 당일 volume이 20일 평균의 80% 미만이면 장 중 부분 데이터로 간주
    const volumeRatio = currentVol / avgVol;
    if (volumeRatio < 0.8) {
      // 시간 비율로 역산하여 full-day 추정
      estimatedVolume = Math.round(currentVol / marketProgress.elapsedRatio);
      adjustedRvol = round(estimatedVolume / avgVol, 2);
    }
  }

  const grade = determineSurgeGrade(adjustedRvol, roc);

  return {
    rvol: adjustedRvol,
    rawRvol: round(rawRvol, 2),
    roc,
    avgVolume20d: avgVol,
    currentVolume: currentVol,
    estimatedVolume,
    grade,
    isIntraday,
  };
}
