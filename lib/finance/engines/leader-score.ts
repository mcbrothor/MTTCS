/**
 * Leader Score Engine — 주도주 판별 스크리너 핵심 엔진
 *
 * 5개 축으로 구성된 Leader Composite Score (0~100)를 산출합니다.
 *
 * 이론적 기반:
 * - Minervini, "Think & Trade Like a Champion" — RS 리더십, 기관 매집
 * - O'Neil, "How to Make Money in Stocks" — 테니스볼 복원, 섹터 리더십
 * - IBD RS Rating — 가중 모멘텀 점수 (Q1×2 + Q2~Q4×1)
 * - Mansfield RS — 벤치마크 대비 상대 성과 가속도
 *
 * 이 파일은 기존 엔진 함수를 import하여 조합하는 "orchestrator" 역할입니다.
 * 기존 모듈을 수정하지 않습니다.
 */

import type { LeaderGrade, LeaderScoreBreakdown, OHLCData } from '@/types';
import { calculateRsMetrics } from '../market/rs-proxy';
import { analyzeSepa } from '../core/sepa';
import { detectPocketPivots } from './vcp/pocket-pivot';
import { scoreVolumeDryUp, detectContractions } from './vcp/contractions';
import { findLocalExtrema, resampleToWeekly } from './vcp/extrema';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// ── 가중치 ────────────────────────────────────────────────────────────────
const W_RS = 0.30;
const W_TENNIS = 0.20;
const W_ACCUM = 0.20;
const W_TREND = 0.15;
const W_SECTOR = 0.15;

// ── Grade 임계 ────────────────────────────────────────────────────────────
function gradeFromScore(score: number): LeaderGrade {
  if (score >= 85) return 'ALPHA';
  if (score >= 65) return 'EMERGING';
  if (score >= 45) return 'STEADY';
  return 'LAGGARD';
}

// ── 축별 점수 산출 ────────────────────────────────────────────────────────

/**
 * 축 1: RS Leadership (0~100)
 * - IBD 가중모멘텀의 유니버스 백분위 (rsPercentile)
 * - Mansfield RS 양수 보너스
 * - 6개월 Mansfield > 12개월 Mansfield = 가속도 보너스
 */
function scoreRsLeadership(
  rsPercentile: number | null,
  mansfieldRsScore: number | null,
  mansfieldRsScore6m?: number | null,
): number {
  if (rsPercentile === null) return 0;

  let score = clamp(rsPercentile, 0, 100);

  // Mansfield 양수 보너스: 벤치마크를 outperform 중이면 +10
  if (mansfieldRsScore !== null && mansfieldRsScore > 0) {
    score += 10;
  }

  // 가속도 보너스: 최근 6개월 RS가 12개월보다 높으면 +5 (모멘텀 가속 중)
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
 * 축 2: 테니스볼 복원력 (0~100)
 * - 60거래일 중 지수 -1% 하락일에 0% 이상 또는 outperform한 횟수
 * - 기존 tennisBallScore를 그대로 활용 (이미 0~100 스케일)
 */
function scoreTennisBallResilience(
  tennisBallCount: number,
  tennisBallScore: number,
): number {
  // tennisBallScore는 count × 20, max 100으로 이미 스케일됨
  // 추가로 5회 이상이면 만점 보장 (강력한 기관 지지 신호)
  if (tennisBallCount >= 5) return 100;
  return clamp(tennisBallScore, 0, 100);
}

/**
 * 축 3: 기관 매집 시그널 (0~100)
 * - Pocket Pivot 점수 (0~100) × 0.5
 * - Volume Dry-Up 점수 (0~100) × 0.5
 * 두 시그널이 동시에 강하면 스마트머니 매집 확률이 높다.
 */
function scoreInstitutionalAccum(
  pocketPivotScore: number | null,
  volumeDryUpScore: number | null,
): number {
  const pp = pocketPivotScore ?? 0;
  const vdu = volumeDryUpScore ?? 0;

  // 둘 중 하나라도 강하면 가산
  const base = pp * 0.5 + vdu * 0.5;

  // 둘 다 60 이상이면 시너지 보너스 +15
  const synergy = pp >= 60 && vdu >= 60 ? 15 : 0;

  return clamp(round(base + synergy), 0, 100);
}

/**
 * 축 4: 추세 건전성 (0~100)
 * - SEPA core 통과 비율 (corePassed / coreTotal × 80)
 * - 52주 고점 10% 이내면 +20 (신고가 근접 보너스)
 */
function scoreTrendHealth(
  sepaCorePassed: number | null,
  sepaCoreTotal: number | null,
  distanceFromHigh52WeekPct: number | null,
): number {
  const total = sepaCoreTotal ?? 7;
  const passed = sepaCorePassed ?? 0;
  const sepaPart = total > 0 ? (passed / total) * 80 : 0;

  // 52주 고점 거리 보너스
  let highBonus = 0;
  if (distanceFromHigh52WeekPct !== null) {
    if (distanceFromHigh52WeekPct <= 5) highBonus = 20;       // 5% 이내: 신고가 근접
    else if (distanceFromHigh52WeekPct <= 10) highBonus = 12;  // 10% 이내: 양호
    else if (distanceFromHigh52WeekPct <= 15) highBonus = 5;   // 15% 이내: 보통
    // 15% 초과: 보너스 없음
  }

  return clamp(round(sepaPart + highBonus), 0, 100);
}

/**
 * 축 5: 섹터 리더십 (0~100)
 * - 소속 섹터의 20일 수익률 순위가 전체 섹터 중 상위일수록 높은 점수
 * - sectorRank / totalSectors 백분위로 변환
 */
function scoreSectorLeadership(
  sectorRank: number | null,
  totalSectors: number,
): number {
  if (sectorRank === null || totalSectors <= 0) return 50; // 데이터 없으면 중립
  // rank 1 = 최고, totalSectors = 최저
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
  // RS 원본 지표
  rsRating: number | null;
  mansfieldRsScore: number | null;
  mansfieldRsFlag: boolean | null;
  mansfieldRsScore6m?: number | null;
  tennisBallCount: number;
  tennisBallScore: number;
  pocketPivotScore: number | null;
  volumeDryUpScore: number | null;
  sepaCorePassed: number | null;
  sepaCoreTotal: number | null;
  distanceFromHigh52WeekPct: number | null;
  benchmarkRelativeScore: number | null;
  weightedMomentumScore: number | null;
}

export function analyzeLeaderScore(input: LeaderAnalysisInput): LeaderAnalysisResult {
  const { data, benchmarkData, sectorRank, totalSectors = 11, market, exchange } = input;

  // ── 기존 엔진 호출 ────────────────────────────────────────────────
  const rsMetrics = calculateRsMetrics(data, benchmarkData);
  const sepaEvidence = analyzeSepa(data, {
    benchmarkData,
    market: market as 'KR' | 'US' | undefined,
    exchange,
  });

  // VCP 서브엔진: 포켓 피벗 + 거래량 고갈
  const { score: pocketPivotScore } = detectPocketPivots(data);
  const weeklyData = resampleToWeekly(data.slice(-200));
  const extrema = findLocalExtrema(weeklyData);
  const contractions = detectContractions(weeklyData, extrema);
  const { score: volumeDryUpScore } = scoreVolumeDryUp(data.slice(-200), contractions);

  // ── 축별 점수 산출 ────────────────────────────────────────────────
  const rsLeadership = scoreRsLeadership(
    rsMetrics.benchmarkRelativeScore,
    rsMetrics.mansfieldRsScore,
    rsMetrics.mansfieldRsScore6m,
  );

  const tennisBallResilience = scoreTennisBallResilience(
    rsMetrics.tennisBallCount,
    rsMetrics.tennisBallScore,
  );

  const institutionalAccum = scoreInstitutionalAccum(
    pocketPivotScore,
    volumeDryUpScore,
  );

  const trendHealth = scoreTrendHealth(
    sepaEvidence.summary.corePassed,
    sepaEvidence.summary.coreTotal,
    sepaEvidence.metrics.distanceFromHigh52WeekPct,
  );

  const sectorLeadershipScore = scoreSectorLeadership(
    sectorRank ?? null,
    totalSectors,
  );

  // ── 종합 점수 ────────────────────────────────────────────────────
  const breakdown: LeaderScoreBreakdown = {
    rsLeadership,
    tennisBallResilience,
    institutionalAccum,
    trendHealth,
    sectorLeadership: sectorLeadershipScore,
  };

  const leaderScore = clamp(round(
    rsLeadership * W_RS +
    tennisBallResilience * W_TENNIS +
    institutionalAccum * W_ACCUM +
    trendHealth * W_TREND +
    sectorLeadershipScore * W_SECTOR,
  ), 0, 100);

  return {
    leaderScore,
    leaderGrade: gradeFromScore(leaderScore),
    breakdown,
    rsRating: null, // 유니버스 백분위는 상위에서 별도 적용
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

/**
 * 유니버스 내 Leader RS 랭킹을 부여합니다.
 * 기존 applyUniverseRsRankings 패턴과 동일.
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
