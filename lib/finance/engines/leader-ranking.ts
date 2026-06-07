import type { LeaderGrade, LeaderScoreBreakdown } from '@/types';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const W_ALPHA = 0.25;
const W_CONSISTENCY = 0.20;
const W_LIQUIDITY = 0.20;
const W_TREND = 0.20;
const W_SECTOR = 0.15;

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

export function gradeFromScore(score: number): LeaderGrade {
  if (score >= 85) return 'ALPHA';
  if (score >= 65) return 'EMERGING';
  if (score >= 45) return 'STEADY';
  return 'LAGGARD';
}

function scoreRsLeadership(
  rsPercentile: number | null,
  mansfieldRsScore: number | null,
  mansfieldRsScore6m?: number | null,
): number {
  if (rsPercentile === null) return 50;

  let score = clamp(rsPercentile, 0, 100);

  if (mansfieldRsScore !== null && mansfieldRsScore > 0) {
    score += 10;
  }

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

function scoreLiquidityCrowding(
  dollarVolumeShare: number | null,
  liquidityVelocity: number,
): number {
  let score = dollarVolumeShare !== null ? dollarVolumeShare : 65;

  if (liquidityVelocity >= 1.5) {
    score += 15;
  } else if (liquidityVelocity >= 1.2) {
    score += 8;
  }

  return clamp(round(score), 0, 100);
}

export function applyLeaderUniverseMetrics<T extends LeaderRankableItem>(
  results: T[],
  totalSectors = 11,
): (T & { rsRating: number; rsRank: number; dollarVolumeShare: number })[] {
  void totalSectors;
  const size = results.length;
  if (size === 0) return [];

  const getRsScore = (item: T) => (item.weightedMomentumScore ?? item.benchmarkRelativeScore ?? -9999);
  const sortedByRs = [...results].sort((a, b) => getRsScore(b) - getRsScore(a));
  const rsMap = new Map<string, { rank: number; rating: number }>();

  sortedByRs.forEach((item, index) => {
    const rank = index + 1;
    const rating = size <= 1 ? 50 : Math.round(99 - ((rank - 1) / (size - 1)) * 98);
    rsMap.set(item.ticker, { rank, rating });
  });

  const sortedByVolume = [...results].sort((a, b) => b.dollarVolume20d - a.dollarVolume20d);
  const volMap = new Map<string, { rank: number; share: number }>();

  sortedByVolume.forEach((item, index) => {
    const rank = index + 1;
    const share = size <= 1 ? 50 : Math.round(99 - ((rank - 1) / (size - 1)) * 98);
    volMap.set(item.ticker, { rank, share });
  });

  return results.map((item) => {
    const rs = rsMap.get(item.ticker) || { rank: size, rating: 50 };
    const vol = volMap.get(item.ticker) || { rank: size, share: 50 };

    const rsLeadership = scoreRsLeadership(rs.rating, null, null);
    const liquidityCrowding = scoreLiquidityCrowding(vol.share, item.liquidityVelocity);

    const breakdown: LeaderScoreBreakdown = {
      ...item.breakdown,
      rsLeadership,
      liquidityCrowding,
    };

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
