import type { OHLCData } from '../../../types/index.ts';
import { average, round } from './_shared.ts';

export function calculateMovingAverage(data: OHLCData[], period: number): number | null {
  if (data.length < period) return null;
  return round(average(data.slice(-period).map((d) => d.close)));
}

export function calculateATR(data: OHLCData[], period: number = 20): number {
  if (data.length < period + 1) return 0;

  const trueRanges = data.map((d, i) => {
    if (i === 0) return d.high - d.low;
    const prevClose = data[i - 1].close;
    return Math.max(
      d.high - d.low,
      Math.abs(d.high - prevClose),
      Math.abs(d.low - prevClose)
    );
  });

  return round(average(trueRanges.slice(-period)));
}

// 단일 거래일 달러 거래량 상한: $100B 초과는 Yahoo Finance 데이터 오류로 간주
const ADV_DAILY_OUTLIER_THRESHOLD = 100_000_000_000;

export function calculateAvgVolume(data: OHLCData[], period: number = 20): {
  avgDollarVolume: number;
  passesFilter: boolean;
  dataQuality: 'OK' | 'OUTLIER_FILTERED' | 'INSUFFICIENT_DATA';
} {
  if (data.length < period) return { avgDollarVolume: 0, passesFilter: false, dataQuality: 'INSUFFICIENT_DATA' };

  const slice = data.slice(-period);
  const dailyDollarVolumes = slice.map((d) => d.close * d.volume);
  const filtered = dailyDollarVolumes.filter((v) => v <= ADV_DAILY_OUTLIER_THRESHOLD);
  const hasOutliers = filtered.length < dailyDollarVolumes.length;

  // 필터 후 유효 데이터가 period의 절반 미만이면 불충분
  if (filtered.length < Math.ceil(period / 2)) {
    return { avgDollarVolume: 0, passesFilter: false, dataQuality: 'INSUFFICIENT_DATA' };
  }

  const avgDollarVolume = average(filtered);
  return {
    avgDollarVolume: round(avgDollarVolume, 0),
    passesFilter: avgDollarVolume >= 10_000_000,
    dataQuality: hasOutliers ? 'OUTLIER_FILTERED' : 'OK',
  };
}

export function calculateEntryPrice(data: OHLCData[], period: number = 50): number {
  if (data.length < period) return 0;
  return round(Math.max(...data.slice(-period).map((d) => d.high)));
}

export function recentSwingLow(data: OHLCData[], lookback = 20): number | null {
  if (data.length === 0) return null;
  const slice = data.slice(-lookback);
  if (slice.length === 0) return null;
  return round(Math.min(...slice.map((d) => d.low)));
}
