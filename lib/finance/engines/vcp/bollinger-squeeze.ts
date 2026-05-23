import type { OHLCData } from '../../../../types/index.ts';
import { BB_PERIOD, BB_SQUEEZE_PERCENTILE, round } from './_shared.ts';

/** 볼린저 밴드 너비 계산: (Upper - Lower) / Middle * 100 */
export function calculateBBWidth(data: OHLCData[], period: number = BB_PERIOD): number[] {
  const widths: number[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const closes = slice.map((d) => d.close);
    const mean = closes.reduce((sum, c) => sum + c, 0) / closes.length;
    const variance = closes.reduce((sum, c) => sum + (c - mean) ** 2, 0) / closes.length;
    const stdDev = Math.sqrt(variance);
    const upper = mean + 2 * stdDev;
    const lower = mean - 2 * stdDev;

    const width = mean !== 0 ? ((upper - lower) / mean) * 100 : 0;
    widths.push(round(width, 4));
  }

  return widths;
}

/**
 * BB Squeeze 분석 (0~100)
 * - 현재 BB Width가 최근 120일 중 하위 20%이면 Squeeze 상태
 */
export function scoreBBSqueeze(data: OHLCData[]): {
  score: number;
  bbWidth: number | null;
  bbWidthPercentile: number | null;
  details: string[];
} {
  const details: string[] = [];
  const widths = calculateBBWidth(data);

  if (widths.length < 20) {
    return { score: 30, bbWidth: null, bbWidthPercentile: null, details: ['데이터 부족으로 BB Squeeze를 판정할 수 없습니다.'] };
  }

  const currentWidth = widths.at(-1) ?? 0;
  const lookback = Math.min(widths.length, 120);
  const recentWidths = widths.slice(-lookback);
  const sorted = [...recentWidths].sort((a, b) => a - b);
  const rank = sorted.findIndex((w) => w >= currentWidth);
  const percentile = round((rank / sorted.length) * 100, 0);

  let score: number;
  if (percentile <= BB_SQUEEZE_PERCENTILE) {
    score = 100;
    details.push(`BB Width ${round(currentWidth, 2)}% — 120일 중 하위 ${percentile}%로 Squeeze 상태`);
  } else if (percentile <= 40) {
    score = 60;
    details.push(`BB Width ${round(currentWidth, 2)}% — 120일 중 하위 ${percentile}%로 수축 진행 중`);
  } else {
    score = 20;
    details.push(`BB Width ${round(currentWidth, 2)}% — 120일 중 ${percentile}%로 아직 수축하지 않음`);
  }

  return { score, bbWidth: round(currentWidth, 2), bbWidthPercentile: percentile, details };
}
