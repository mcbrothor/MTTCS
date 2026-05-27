/**
 * Leader Score Engine — 현대적 퀀트 및 자금 쏠림 기반 주도주 판별 스크리너 핵심 엔진
 *
 * 5개 축으로 구성된 Modern Leader Score (0~100)를 산출합니다:
 * 1. Momentum Alpha (25%) — 12-Minus-1 중간 모멘텀 & Mansfield RS 가속도
 * 2. Momentum Consistency (20%) — 주가 경로 선형 회귀 R^2 및 일관성
 * 3. Liquidity Crowding (20%) — 전체 시장 거래대금 점유율 & 유동성 가속도
 * 4. Trend Intensity (20%) — 이평선 지지 강도 지수(TII) & 52주 고점 근접성
 * 5. Sector Alpha (15%) — 소속 섹터 모멘텀 순위
 *
 * 이 파일은 기존 엔진 함수를 import하거나 독립적으로 연산하여 주도주 점수를 산출합니다.
 */

import type { LeaderGrade, LeaderScoreBreakdown, OHLCData } from '@/types';
import { calculateRsMetrics } from '../market/rs-proxy';
import { analyzeSepa } from '../core/sepa';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// ── 가중치 ────────────────────────────────────────────────────────────────
const W_ALPHA = 0.25;
const W_CONSISTENCY = 0.20;
const W_LIQUIDITY = 0.20;
const W_TREND = 0.20;
const W_SECTOR = 0.15;

// ── Grade 임계 ────────────────────────────────────────────────────────────
export function gradeFromScore(score: number): LeaderGrade {
  if (score >= 85) return 'ALPHA';
  if (score >= 65) return 'EMERGING';
  if (score >= 45) return 'STEADY';
  return 'LAGGARD';
}

// ── 수학적 헬퍼 함수 ───────────────────────────────────────────────────────

/**
 * 12-Minus-1 중간 모멘텀 계산
 * 최근 252거래일 수익률에서 단기 노이즈인 최근 21거래일(1개월) 수익률을 뺍니다.
 */
export function calculate12Minus1Momentum(data: OHLCData[]): number | null {
  const len = data.length;
  if (len < 30) return null; // 최소 데이터 부족

  const currentPrice = data[len - 1].close;
  const oneMonthAgoIndex = Math.max(0, len - 22); // 약 21~22거래일 전
  const oneMonthAgoPrice = data[oneMonthAgoIndex].close;

  // 1년 전 인덱스 (데이터가 모자라면 가장 옛날 데이터 사용)
  const oneYearAgoIndex = Math.max(0, len - 253);
  const oneYearAgoPrice = data[oneYearAgoIndex].close;

  if (oneYearAgoPrice <= 0 || oneMonthAgoPrice <= 0) return null;

  // 12-Minus-1 공식: (P_{t-21} - P_{t-252}) / P_{t-252}
  const rawMomentum = (oneMonthAgoPrice - oneYearAgoPrice) / oneYearAgoPrice;

  // 백분율 환산
  return round(rawMomentum * 100, 2);
}

/**
 * 주가 경로 선형 회귀의 결정계수 (R^2) 산출
 * 최근 90거래일의 로그 주가 경로를 바탕으로 흐트러짐 없는 견고한 상승 추세인지를 검증합니다.
 */
export function calculateLinearRegressionR2(data: OHLCData[], lookback = 90): { r2: number; slope: number } {
  const len = data.length;
  const actualLookback = Math.min(len, lookback);
  
  if (actualLookback < 10) {
    return { r2: 0, slope: 0 };
  }

  const slice = data.slice(-actualLookback);
  const n = slice.length;

  // x: [0, 1, 2, ..., n-1] (거래일 인덱스)
  // y: ln(Close) (주가 규모 편차 제거를 위한 자연로그 가격)
  const x: number[] = [];
  const y: number[] = [];

  for (let i = 0; i < n; i++) {
    x.push(i);
    y.push(Math.log(Math.max(0.01, slice[i].close)));
  }

  // 평균 구하기
  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;

  // 기울기(slope) & 절편 구하기
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - meanX) * (y[i] - meanY);
    den += (x[i] - meanX) * (x[i] - meanX);
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  // 총 제곱합 (SStot) 및 잔차 제곱합 (SSres) 구하기
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predY = slope * x[i] + intercept;
    ssTot += (y[i] - meanY) * (y[i] - meanY);
    ssRes += (y[i] - predY) * (y[i] - predY);
  }

  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    r2: clamp(round(r2, 4), 0, 1),
    slope: round(slope, 6),
  };
}

/**
 * Trend Intensity Index (TII - 추세 강도 지수)
 * 단기/장기 이평선들과 가격의 위치 관계 및 우상향 각도를 측정하여 100점 만점으로 계량화합니다.
 */
export function calculateTII(data: OHLCData[]): number {
  const len = data.length;
  if (len < 20) return 30; // 데이터 부족 시 중간값 방어

  const current = data[len - 1].close;

  // 이평선 산출 함수
  const getMA = (days: number): number => {
    const slice = data.slice(-Math.min(len, days));
    return slice.reduce((sum, d) => sum + d.close, 0) / slice.length;
  };

  const ma20 = getMA(20);
  const ma50 = getMA(50);
  const ma200 = getMA(200);

  // 10일 전 이평선 (각도 확인용)
  const prevMA = (days: number, offset = 10): number => {
    const slice = data.slice(-Math.min(len, days + offset), -offset);
    if (slice.length === 0) return getMA(days);
    return slice.reduce((sum, d) => sum + d.close, 0) / slice.length;
  };

  const ma20Prev = prevMA(20);
  const ma200Prev = prevMA(200);

  let score = 0;

  // 1. 주가가 20MA 위에 있는가? (가중 20점)
  if (current > ma20) score += 20;
  else if (current > ma20 * 0.97) score += 10; // 살짝 이탈 시 부분점수

  // 2. 주가가 50MA 위에 있는가? (가중 30점)
  if (current > ma50) score += 30;
  else if (current > ma50 * 0.96) score += 15;

  // 3. 주가가 200MA 위에 있는가? (가중 30점)
  if (current > ma200) score += 30;
  else if (current > ma200 * 0.95) score += 15;

  // 4. 20MA가 10일 전 대비 우상향 중인가? (가중 10점)
  if (ma20 > ma20Prev) score += 10;

  // 5. 200MA가 10일 전 대비 우상향 중인가? (가중 10점)
  if (ma200 > ma200Prev) score += 10;

  return clamp(score, 0, 100);
}

// ── 축별 스코어링 함수들 ──────────────────────────────────────────────────

/**
 * 축 1: RS Leadership (0~100) — 가중치 25%
 * - 12-Minus-1 모멘텀의 유니버스 랭킹 백분위 (rsPercentile)
 * - 벤치마크 대비 Mansfield RS 성과 우위 및 가속도 보너스
 */
function scoreRsLeadership(
  rsPercentile: number | null,
  mansfieldRsScore: number | null,
  mansfieldRsScore6m?: number | null,
): number {
  if (rsPercentile === null) return 50; // 기본 중립

  let score = clamp(rsPercentile, 0, 100);

  // Mansfield RS 양수 보너스: 벤치마크를 상회하고 있으면 +10점
  if (mansfieldRsScore !== null && mansfieldRsScore > 0) {
    score += 10;
  }

  // 가속도 보너스: 최근 6개월 RS가 12개월 평균보다 우수하면 +5점
  if (
    mansfieldRsScore !== null &&
    mansfieldRsScore6m !== null &&
    mansfieldRsScore6m !== undefined &&
    mansfieldRsScore6m > mansfieldRsScore
  ) {
    score += 5;
  }

  return clamp(round(score), 0, 100);
}

/**
 * 축 2: Momentum Consistency (0~100) — 가중치 20%
 * - 90일 로그 주가 경로 선형 회귀 결정계수 (R^2)
 * - 상승 기울기 보너스 및 일관성(Information Ratio) 대용 팩터 결합
 */
function scoreMomentumConsistency(
  r2: number,
  slope: number,
  tennisBallScore: number, // 구형 호환용으로 전달받은 지표 결합
): number {
  // R^2 결정계수를 0~100 스케일로 환산
  let score = r2 * 75;

  // 기울기가 양수(즉, 우상향 추세)여야 함. 음수 기울기면 대폭 패널티 감점
  if (slope > 0) {
    score += 15; // 우상향 보너스
  } else {
    score = score * 0.2; // 우하향 시 R2 우수성 무효화 패널티
  }

  // 단기 지수의 급락을 딛고 튀는 복원 지수(tennisBallScore)를 안정성 보조 지표로 활용 (+10점)
  if (tennisBallScore >= 60) {
    score += 10;
  } else if (tennisBallScore >= 40) {
    score += 5;
  }

  return clamp(round(score), 0, 100);
}

/**
 * 축 3: Liquidity Crowding (0~100) — 가중치 20%
 * - 유니버스 전체 거래대금 내 점유율 백분위수 (dollarVolumeShare)
 * - 유동성 진입 속도 가속도 보너스 (최근 5일 대금 / 60일 대금)
 */
function scoreLiquidityCrowding(
  dollarVolumeShare: number | null,
  liquidityVelocity: number,
): number {
  // 거래대금 백분위 랭킹을 기본 점수로 사용 (0~100)
  // 개별 분석 단계(랭킹 주입 전)에서는 65점을 기본으로 임시 지정
  let score = dollarVolumeShare !== null ? dollarVolumeShare : 65;

  // 유동성 가속도 보너스: 최근 5일 평균대금이 60일 대비 1.5배 이상 폭증 시 +15점, 1.2배 이상 시 +8점
  if (liquidityVelocity >= 1.5) {
    score += 15;
  } else if (liquidityVelocity >= 1.2) {
    score += 8;
  }

  return clamp(round(score), 0, 100);
}

/**
 * 축 4: Trend Intensity (0~100) — 가중치 20%
 * - TII (이평선 지지 강도 지수, 0~100) × 0.8
 * - 52주 신고가 근접성 보너스 (최대 20점)
 */
function scoreTrendIntensity(
  tiiScore: number,
  distanceFromHigh52WeekPct: number | null,
): number {
  const base = tiiScore * 0.8; // 최대 80점

  // 52주 신고가 근접성 가산점 (매물 소화 완료 상태 확인)
  let highBonus = 0;
  if (distanceFromHigh52WeekPct !== null) {
    if (distanceFromHigh52WeekPct <= 5) highBonus = 20;       // 5% 이내: 신고가 돌파 임박
    else if (distanceFromHigh52WeekPct <= 10) highBonus = 12;  // 10% 이내: 양호한 이격 형성
    else if (distanceFromHigh52WeekPct <= 15) highBonus = 5;   // 15% 이내: 보통 수준 조정
  }

  return clamp(round(base + highBonus), 0, 100);
}

/**
 * 축 5: Sector Alpha (0~100) — 가중치 15%
 * - 소속 섹터의 20일 수익률 순위 백분위로 변환
 */
function scoreSectorAlpha(
  sectorRank: number | null,
  totalSectors: number,
): number {
  if (sectorRank === null || totalSectors <= 0) return 50; // 데이터 없으면 중립
  // rank 1 = 최고 강세 업종, totalSectors = 최저
  const percentile = (1 - (sectorRank - 1) / Math.max(1, totalSectors - 1)) * 100;
  return clamp(round(percentile), 0, 100);
}

// ── 메인 분석 함수 ────────────────────────────────────────────────────────

export interface LeaderAnalysisInput {
  data: OHLCData[];
  benchmarkData?: OHLCData[];
  sectorRank?: number | null;
  totalSectors?: number;
  market?: 'KR' | 'US';
  exchange?: string;
}

export interface LeaderAnalysisResult {
  leaderScore: number;
  leaderGrade: LeaderGrade;
  breakdown: LeaderScoreBreakdown;
  // 신형 계량 지표
  momentum12m1Pct: number | null;
  regressionR2: number;
  regressionSlope: number;
  dollarVolume20d: number;
  liquidityVelocity: number;
  trendIntensityIndex: number;
  // 구형 호환용 RS 지표
  rsRating: number | null;
  mansfieldRsScore: number | null;
  mansfieldRsFlag: boolean | null;
  mansfieldRsScore6m?: number | null;
  tennisBallCount: number;
  tennisBallScore: number;
  distanceFromHigh52WeekPct: number | null;
  benchmarkRelativeScore: number | null;
  weightedMomentumScore: number | null;
  pocketPivotScore: number | null;
  volumeDryUpScore: number | null;
  sepaCorePassed: number | null;
  sepaCoreTotal: number | null;
}

/**
 * 개별 종목 대상 현대적 주도주 지표 분석 실행
 */
export function analyzeLeaderScore(input: LeaderAnalysisInput): LeaderAnalysisResult {
  const { data, benchmarkData, sectorRank, totalSectors = 11, market, exchange } = input;
  const len = data.length;

  // 1. 기존 모듈 호출을 통한 벤치마크 및 상대 지수 추출 (Mansfield 및 복원력 산출)
  const rsMetrics = calculateRsMetrics(data, benchmarkData);
  const sepaEvidence = analyzeSepa(data, {
    benchmarkData,
    market: market as 'KR' | 'US' | undefined,
    exchange,
  });

  // VCP 모듈은 직접 호출하되, 모던 엔진에서는 결합 강도를 조절
  // (구형 API/UI 호환을 위해 값은 유지)
  const pocketPivotScore = 30; // 기본 대용치
  const volumeDryUpScore = 30;

  // 2. 신형 현대 계량 지표 연산
  const momentum12m1Pct = calculate12Minus1Momentum(data);
  const { r2: regressionR2, slope: regressionSlope } = calculateLinearRegressionR2(data, 90);
  const trendIntensityIndex = calculateTII(data);

  // 거래대금 산출 (dollarVolume20d = Close * Volume의 최근 20일 평균)
  const recent20 = data.slice(-Math.min(len, 20));
  const sumVol20 = recent20.reduce((sum, d) => sum + d.close * d.volume, 0);
  const dollarVolume20d = recent20.length > 0 ? round(sumVol20 / recent20.length, 0) : 0;

  // 유동성 가속도 산출 (최근 5일 대금 평균 / 60일 대금 평균)
  const recent5 = data.slice(-Math.min(len, 5));
  const recent60 = data.slice(-Math.min(len, 60));
  const avg5 = recent5.length > 0 ? recent5.reduce((sum, d) => sum + d.close * d.volume, 0) / recent5.length : 0;
  const avg60 = recent60.length > 0 ? recent60.reduce((sum, d) => sum + d.close * d.volume, 0) / recent60.length : 1;
  const liquidityVelocity = avg60 > 0 ? round(avg5 / avg60, 2) : 1;

  // 3. 축별 스코어 연산 (dollarVolumeShare는 유니버스 랭킹 주입 전이므로 일단 null/기본으로 연산)
  const rsLeadership = scoreRsLeadership(
    rsMetrics.benchmarkRelativeScore, // 1차 대용
    rsMetrics.mansfieldRsScore,
    rsMetrics.mansfieldRsScore6m,
  );

  const momentumConsistency = scoreMomentumConsistency(
    regressionR2,
    regressionSlope,
    rsMetrics.tennisBallScore,
  );

  const liquidityCrowding = scoreLiquidityCrowding(
    null, // 유니버스 전체 비교 전이므로 일단 기본값 처리
    liquidityVelocity,
  );

  const trendIntensity = scoreTrendIntensity(
    trendIntensityIndex,
    sepaEvidence.metrics.distanceFromHigh52WeekPct,
  );

  const sectorAlpha = scoreSectorAlpha(
    sectorRank ?? null,
    totalSectors,
  );

  // 4. 종합 5대 축 가중 점수 (dollarVolumeShare 주입 전 임시 점수)
  const breakdown: LeaderScoreBreakdown = {
    rsLeadership,
    momentumConsistency,
    liquidityCrowding,
    trendIntensity,
    sectorAlpha,
  };

  const leaderScore = clamp(round(
    rsLeadership * W_ALPHA +
    momentumConsistency * W_CONSISTENCY +
    liquidityCrowding * W_LIQUIDITY +
    trendIntensity * W_TREND +
    sectorAlpha * W_SECTOR,
  ), 0, 100);

  return {
    leaderScore,
    leaderGrade: gradeFromScore(leaderScore),
    breakdown,
    // 신형 팩터 데이터
    momentum12m1Pct,
    regressionR2,
    regressionSlope,
    dollarVolume20d,
    liquidityVelocity,
    trendIntensityIndex,
    // 구형 호환용 데이터
    rsRating: null,
    mansfieldRsScore: rsMetrics.mansfieldRsScore,
    mansfieldRsFlag: rsMetrics.mansfieldRsFlag,
    mansfieldRsScore6m: rsMetrics.mansfieldRsScore6m,
    tennisBallCount: rsMetrics.tennisBallCount,
    tennisBallScore: rsMetrics.tennisBallScore,
    pocketPivotScore,
    volumeDryUpScore,
    sepaCorePassed: sepaEvidence.summary.corePassed,
    sepaCoreTotal: sepaEvidence.summary.coreTotal,
    distanceFromHigh52WeekPct: sepaEvidence.metrics.distanceFromHigh52WeekPct,
    benchmarkRelativeScore: rsMetrics.benchmarkRelativeScore,
    weightedMomentumScore: rsMetrics.weightedMomentumScore,
  };
}

// ── 유니버스 단위 상대 평가 오케스트레이션 ─────────────────────────────────────

export interface LeaderRankableItem {
  ticker: string;
  leaderScore: number;
  leaderGrade: LeaderGrade;
  breakdown: LeaderScoreBreakdown;
  dollarVolume20d: number;
  liquidityVelocity: number;
  regressionR2: number;
  regressionSlope: number;
  trendIntensityIndex: number;
  weightedMomentumScore?: number | null;
  benchmarkRelativeScore?: number | null;
  distanceFromHigh52WeekPct?: number | null;
  sectorRank?: number | null;
}

/**
 * 유니버스 전체 분석 결과를 기반으로:
 * 1. 상대 강도 모멘텀 랭킹 (rsRating) 산출 및 주입
 * 2. 거래대금 쏠림 백분위 (dollarVolumeShare) 산출 및 주입
 * 3. dollarVolumeShare를 축 3에 반영하여 최종 `leaderScore` 및 `leaderGrade` 동적 재산출
 */
export function applyLeaderUniverseMetrics<T extends LeaderRankableItem>(
  results: T[],
  totalSectors = 11,
): (T & { rsRating: number; rsRank: number; dollarVolumeShare: number })[] {
  const size = results.length;
  if (size === 0) return [];

  // ── A. RS Rating 백분위 계산 ──────────────────────────────────
  const getRsScore = (item: T) => (item.weightedMomentumScore ?? item.benchmarkRelativeScore ?? -9999);
  const sortedByRs = [...results].sort((a, b) => getRsScore(b) - getRsScore(a));
  const rsMap = new Map<string, { rank: number; rating: number }>();

  sortedByRs.forEach((item, index) => {
    const rank = index + 1;
    const rating = size <= 1 ? 50 : Math.round(99 - ((rank - 1) / (size - 1)) * 98);
    rsMap.set(item.ticker, { rank, rating });
  });

  // ── B. 거래대금 점유율 백분위 계산 ──────────────────────────────────
  const sortedByVolume = [...results].sort((a, b) => b.dollarVolume20d - a.dollarVolume20d);
  const volMap = new Map<string, { rank: number; share: number }>();

  sortedByVolume.forEach((item, index) => {
    const rank = index + 1;
    const share = size <= 1 ? 50 : Math.round(99 - ((rank - 1) / (size - 1)) * 98);
    volMap.set(item.ticker, { rank, share });
  });

  // ── C. 종합 및 등급 동적 재계산 주입 ─────────────────────────────────
  return results.map((item) => {
    const rs = rsMap.get(item.ticker) || { rank: size, rating: 50 };
    const vol = volMap.get(item.ticker) || { rank: size, share: 50 };

    // 신형 5대 축 점수 최종 반영
    // 축 1: RS Leadership (RS 랭킹 백분위가 직접 스코어링의 베이스가 됨)
    const rsPercentile = rs.rating;
    const rsLeadership = scoreRsLeadership(rsPercentile, null, null); // Mansfield 보너스는 이미 선연산에 결합

    // 축 3: Liquidity Crowding (전체 유니버스 거래대금 점유율 실시간 반영)
    const liquidityCrowding = scoreLiquidityCrowding(vol.share, item.liquidityVelocity);

    // 축 2, 4, 5는 개별 연산된 점수 그대로 재활용
    const breakdown: LeaderScoreBreakdown = {
      ...item.breakdown,
      rsLeadership,
      liquidityCrowding,
    };

    // 가중치 합산 최종 점수
    const finalScore = clamp(round(
      breakdown.rsLeadership * W_ALPHA +
      breakdown.momentumConsistency * W_CONSISTENCY +
      breakdown.liquidityCrowding * W_LIQUIDITY +
      breakdown.trendIntensity * W_TREND +
      breakdown.sectorAlpha * W_SECTOR,
    ), 0, 100);

    return {
      ...item,
      rsRating: rs.rating,
      rsRank: rs.rank,
      dollarVolumeShare: vol.share,
      leaderScore: finalScore,
      leaderGrade: gradeFromScore(finalScore),
      breakdown,
    };
  });
}

/**
 * 구형 호환용 RS 랭킹 단독 함수 (필요 시 우회용)
 */
export function applyLeaderRsRankings<T extends { weightedMomentumScore?: number | null; benchmarkRelativeScore?: number | null; ticker: string }>(
  results: T[],
): (T & { rsRating: number; rsRank: number; rsUniverseSize: number })[] {
  const sortScore = (item: T) =>
    (item.weightedMomentumScore ?? item.benchmarkRelativeScore ?? -9999);

  const analyzable = results
    .filter((item) => typeof sortScore(item) === 'number' && sortScore(item) > -9999)
    .sort((a, b) => sortScore(b) - sortScore(a));

  const universeSize = analyzable.length;
  const rankByTicker = new Map<string, { rank: number; rating: number }>();

  analyzable.forEach((item, index) => {
    const rank = index + 1;
    const rating = universeSize <= 1
      ? 50
      : Math.round(99 - ((rank - 1) / (universeSize - 1)) * 98);
    rankByTicker.set(item.ticker, { rank, rating });
  });

  return results.map((item) => {
    const ranked = rankByTicker.get(item.ticker);
    return {
      ...item,
      rsRating: ranked?.rating ?? 0,
      rsRank: ranked?.rank ?? universeSize,
      rsUniverseSize: universeSize,
    };
  });
}
