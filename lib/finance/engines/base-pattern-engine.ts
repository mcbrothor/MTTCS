/**
 * 베이스 패턴 감지 알고리즘 (디자인 문서 §N)
 *
 * 왜 Vision AI가 아닌 수치 분석인가?
 * - 차트 패턴 인식은 시계열 수치 데이터 분석 문제
 * - 이미지 변환 과정에서 가격/날짜 정밀도 손실
 * - 피벗 포인트 수치 계산이 불가능
 * - OHLCV 수치 직접 분석이 유일한 정답
 *
 * 감지 결과는 참고용이며, 사용자 육안 최종 확인이 필수입니다.
 */

import type { BasePattern, CanslimBasePatternType, OHLCData } from '@/types';
import { BASE_PATTERN_CRITERIA } from './canslim-criteria';

const round = (v: number, d = 2) => Number(v.toFixed(d));

// =============================================
// 주봉 데이터 변환 (일봉 → 주봉)
// =============================================

interface WeeklyOHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 일봉 OHLCV를 주봉으로 변환합니다.
 * CAN SLIM 패턴 분석은 주 단위 차트를 기반으로 합니다.
 */
export function dailyToWeekly(data: OHLCData[]): WeeklyOHLCV[] {
  if (data.length === 0) return [];

  const weeks: WeeklyOHLCV[] = [];
  let currentWeek: OHLCData[] = [];

  for (const bar of data) {
    const dayOfWeek = new Date(bar.date).getDay();

    // 월요일(1)이 시작이면 새 주 시작
    if (dayOfWeek === 1 && currentWeek.length > 0) {
      weeks.push(aggregateWeek(currentWeek));
      currentWeek = [];
    }
    currentWeek.push(bar);
  }

  // 마지막 주 처리
  if (currentWeek.length > 0) {
    weeks.push(aggregateWeek(currentWeek));
  }

  return weeks;
}

function aggregateWeek(days: OHLCData[]): WeeklyOHLCV {
  return {
    date: days[0].date,
    open: days[0].open,
    high: Math.max(...days.map((d) => d.high)),
    low: Math.min(...days.map((d) => d.low)),
    close: days[days.length - 1].close,
    volume: days.reduce((sum, d) => sum + d.volume, 0),
  };
}

// =============================================
// Cup with Handle 감지
// =============================================

/**
 * 컵 위드 핸들 패턴 감지 (디자인 문서 §N 구현 예시)
 *
 * 조건:
 * 1. 최소 7주 데이터
 * 2. 컵 깊이 12~33%
 * 3. 우측 고점이 좌측의 95% 이상 회복
 * 4. 손잡이 깊이 12% 이내
 * 5. 손잡이는 컵 상단 절반에 위치
 */
export function detectCupWithHandle(weeklyData: WeeklyOHLCV[]): BasePattern | null {
  const cfg = BASE_PATTERN_CRITERIA.CUP_WITH_HANDLE;
  if (weeklyData.length < cfg.MIN_WEEKS) return null;

  const highs = weeklyData.map((w) => w.high);
  const lows = weeklyData.map((w) => w.low);

  // 컵 좌측 고점 — 전체의 앞쪽 1/3에서 최고점
  const leftThird = Math.max(3, Math.floor(weeklyData.length / 3));
  const cupLeft = Math.max(...highs.slice(0, leftThird));
  const cupLeftIdx = highs.indexOf(cupLeft);

  // 컵 바닥 — 좌측 고점 이후 전체 저점
  const afterLeft = lows.slice(cupLeftIdx);
  if (afterLeft.length < 3) return null;
  const cupFloor = Math.min(...afterLeft);

  // 컵 우측 고점 — 후반부 1/3에서 최고점
  const rightStart = Math.max(cupLeftIdx + 3, weeklyData.length - leftThird);
  const rightHighs = highs.slice(rightStart);
  if (rightHighs.length < 1) return null;
  const cupRight = Math.max(...rightHighs);

  // 조건 1: 컵 깊이 12~33%
  const depthPct = round(((cupLeft - cupFloor) / cupLeft) * 100);
  if (depthPct < cfg.MIN_DEPTH_PCT || depthPct > cfg.MAX_DEPTH_PCT) return null;

  // 조건 2: 우측 고점이 좌측 고점의 95% 이상 회복
  if (cupRight < cupLeft * cfg.MIN_RIGHT_SIDE_RECOVERY) return null;

  // 조건 3: 손잡이 — 최근 1~3주, 깊이 12% 이내
  const handleSlice = lows.slice(-3);
  if (handleSlice.length < 1) return null;
  const handleHigh = cupRight;
  const handleLow = Math.min(...handleSlice);
  const handleDepth = round(((handleHigh - handleLow) / handleHigh) * 100);
  if (handleDepth > cfg.MAX_HANDLE_DEPTH_PCT) return null;

  // 조건 4: 손잡이는 컵 상단 절반에 위치
  const cupMidpoint = (cupLeft + cupFloor) / 2;
  if (handleLow < cupMidpoint) return null;

  return {
    type: 'CUP_WITH_HANDLE',
    pivotPoint: round(handleHigh + cfg.PIVOT_OFFSET),
    weeksForming: weeklyData.length,
    depthPct,
    isValid: true,
    confidence: depthPct <= 25 ? 'HIGH' : 'MEDIUM',
  };
}

// =============================================
// Double Bottom 감지
// =============================================

/**
 * 더블 바텀 패턴 감지
 *
 * 조건:
 * 1. 최소 7주 데이터
 * 2. 2개의 유사한 저점 (차이 3% 이내)
 * 3. 깊이 15~33%
 * 4. 중간 고점이 피벗 포인트
 */
export function detectDoubleBottom(weeklyData: WeeklyOHLCV[]): BasePattern | null {
  const cfg = BASE_PATTERN_CRITERIA.DOUBLE_BOTTOM;
  if (weeklyData.length < cfg.MIN_WEEKS) return null;

  const highs = weeklyData.map((w) => w.high);
  const lows = weeklyData.map((w) => w.low);
  const overallHigh = Math.max(...highs);

  // 전반부와 후반부에서 각각 저점 찾기
  const midPoint = Math.floor(weeklyData.length / 2);
  const firstHalfLows = lows.slice(0, midPoint);
  const secondHalfLows = lows.slice(midPoint);

  if (firstHalfLows.length < 2 || secondHalfLows.length < 2) return null;

  const firstBottom = Math.min(...firstHalfLows);
  const secondBottom = Math.min(...secondHalfLows);

  // 두 바닥 가격 차이가 3% 이내
  const bottomDiffPct = Math.abs((firstBottom - secondBottom) / firstBottom) * 100;
  if (bottomDiffPct > cfg.MAX_BOTTOM_DIFF_PCT) return null;

  const lowerBottom = Math.min(firstBottom, secondBottom);
  const depthPct = round(((overallHigh - lowerBottom) / overallHigh) * 100);

  // 깊이 15~33%
  if (depthPct < cfg.MIN_DEPTH_PCT || depthPct > cfg.MAX_DEPTH_PCT) return null;

  // 중간 고점 (두 바닥 사이의 최고점) → 피벗 포인트
  const firstBottomIdx = lows.indexOf(firstBottom);
  const secondBottomIdx = midPoint + secondHalfLows.indexOf(secondBottom);
  const middleHighs = highs.slice(firstBottomIdx, secondBottomIdx + 1);
  if (middleHighs.length < 1) return null;
  const middleHigh = Math.max(...middleHighs);

  return {
    type: 'DOUBLE_BOTTOM',
    pivotPoint: round(middleHigh + cfg.PIVOT_OFFSET),
    weeksForming: weeklyData.length,
    depthPct,
    isValid: true,
    confidence: bottomDiffPct <= 1.5 ? 'HIGH' : 'MEDIUM',
  };
}

// =============================================
// Flat Base 감지
// =============================================

/**
 * 플랫 베이스 패턴 감지
 *
 * 조건:
 * 1. 최소 5주 데이터
 * 2. 전체 변동폭 15% 이내
 * 3. 기본적으로 고점 근처에서 횡보하는 패턴
 */
export function detectFlatBase(weeklyData: WeeklyOHLCV[]): BasePattern | null {
  const cfg = BASE_PATTERN_CRITERIA.FLAT_BASE;
  if (weeklyData.length < cfg.MIN_WEEKS) return null;

  const highs = weeklyData.map((w) => w.high);
  const lows = weeklyData.map((w) => w.low);
  const baseHigh = Math.max(...highs);
  const baseLow = Math.min(...lows);

  const depthPct = round(((baseHigh - baseLow) / baseHigh) * 100);

  // 최대 15% 이내
  if (depthPct > cfg.MAX_DEPTH_PCT) return null;

  // 최소 5주 이상 타이트한 횡보
  return {
    type: 'FLAT_BASE',
    pivotPoint: round(baseHigh + cfg.PIVOT_OFFSET),
    weeksForming: weeklyData.length,
    depthPct,
    isValid: true,
    confidence: depthPct <= 10 ? 'HIGH' : 'MEDIUM',
  };
}

// =============================================
// 종합 패턴 감지
// =============================================

/**
 * 주어진 가격 데이터에서 가장 유력한 베이스 패턴을 감지합니다.
 *
 * 우선순위: Cup with Handle > Double Bottom > Flat Base > VCP(기존 엔진)
 * VCP는 이 함수에서 직접 감지하지 않고 외부에서 기존 VCP 엔진 결과를 전달합니다.
 *
 * @param dailyData 최소 35일(5주) 이상의 일봉 데이터
 * @param vcpBasePattern 기존 VCP 엔진에서 감지한 패턴 (있으면 비교용)
 */
export function detectBasePattern(
  dailyData: OHLCData[],
  vcpBasePattern?: BasePattern | null
): BasePattern | null {
  if (dailyData.length < 35) return vcpBasePattern ?? null;

  const weeklyData = dailyToWeekly(dailyData);

  // 다양한 윈도우 크기로 패턴 탐색 (최근 7~26주)
  const candidates: BasePattern[] = [];

  for (let weeks = 7; weeks <= Math.min(26, weeklyData.length); weeks += 2) {
    const window = weeklyData.slice(-weeks);

    const cup = detectCupWithHandle(window);
    if (cup) candidates.push(cup);

    const db = detectDoubleBottom(window);
    if (db) candidates.push(db);
  }

  // Flat Base는 짧은 기간에서 탐색
  for (let weeks = 5; weeks <= Math.min(12, weeklyData.length); weeks++) {
    const window = weeklyData.slice(-weeks);
    const flat = detectFlatBase(window);
    if (flat) candidates.push(flat);
  }

  // VCP 결과도 후보에 추가
  if (vcpBasePattern) candidates.push(vcpBasePattern);

  if (candidates.length === 0) return null;

  // 우선순위: HIGH confidence > MEDIUM > LOW, 같으면 Cup > Double > Flat > VCP
  const typePriority: Record<CanslimBasePatternType, number> = {
    CUP_WITH_HANDLE: 1,
    DOUBLE_BOTTOM: 2,
    FLAT_BASE: 3,
    VCP: 4,
    UNKNOWN: 5,
  };
  const confidencePriority = { HIGH: 1, MEDIUM: 2, LOW: 3 };

  candidates.sort((a, b) => {
    const confDiff = confidencePriority[a.confidence] - confidencePriority[b.confidence];
    if (confDiff !== 0) return confDiff;
    return typePriority[a.type] - typePriority[b.type];
  });

  return candidates[0];
}
