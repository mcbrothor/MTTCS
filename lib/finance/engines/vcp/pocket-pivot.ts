import type { OHLCData } from '../../../../types/index.ts';
import { POCKET_PIVOT_LOOKBACK, POCKET_PIVOT_MA_TOLERANCE, round } from './_shared.ts';

/**
 * Pocket Pivot: 상승일 거래량 > 최근 10일 하락일 최대 거래량
 * 기관 매집의 초기 신호를 잡아냅니다.
 */
export function detectPocketPivots(data: OHLCData[]): {
  score: number;
  pivots: { date: string; close: number; volume: number }[];
  details: string[];
} {
  const details: string[] = [];
  const pivots: { date: string; close: number; volume: number }[] = [];
  const scanStart = Math.max(POCKET_PIVOT_LOOKBACK + 1, data.length - 20);

  for (let i = scanStart; i < data.length; i++) {
    const current = data[i];
    const prev = data[i - 1];
    if (!current || !prev) continue;

    if (current.close <= prev.close) continue;

    const lookbackSlice = data.slice(Math.max(0, i - POCKET_PIVOT_LOOKBACK), i);
    const downDayVolumes = lookbackSlice
      .filter((d, idx) => {
        const prevD = lookbackSlice[idx - 1] || data[Math.max(0, i - POCKET_PIVOT_LOOKBACK) + idx - 1];
        return prevD && d.close < prevD.close;
      })
      .map((d) => d.volume);

    if (downDayVolumes.length === 0) continue;
    const maxDownVolume = Math.max(...downDayVolumes);

    if (current.volume > maxDownVolume) {
      const ma10Slice = data.slice(Math.max(0, i - 9), i + 1);
      const ma10 = ma10Slice.reduce((sum, d) => sum + d.close, 0) / ma10Slice.length;
      const distanceFromMa10 = Math.abs((current.close - ma10) / ma10) * 100;

      if (distanceFromMa10 <= POCKET_PIVOT_MA_TOLERANCE) {
        pivots.push({
          date: current.date,
          close: round(current.close),
          volume: current.volume,
        });
      }
    }
  }

  let score: number;
  if (pivots.length >= 2) {
    score = 100;
    details.push(`최근 20일 내 Pocket Pivot ${pivots.length}개 감지 — 강한 기관 매집 시그널`);
  } else if (pivots.length === 1) {
    score = 60;
    details.push(`최근 20일 내 Pocket Pivot 1개 감지 — 기관 매집 초기 단계 가능`);
  } else {
    score = 10;
    details.push('최근 20일 내 Pocket Pivot 감지 안 됨');
  }

  return { score, pivots, details };
}
