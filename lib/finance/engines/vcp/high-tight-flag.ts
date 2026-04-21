import type { HighTightFlagAnalysis, OHLCData } from '../../../../types/index.ts';
import {
  HTF_MAX_BASE_DAYS,
  HTF_MAX_DRAWDOWN,
  HTF_MAX_VOLUME_RATIO,
  HTF_MIN_BASE_DAYS,
  HTF_MIN_DRAWDOWN,
  HTF_TIGHT_RANGE_PCT,
  clamp,
  round,
} from './_shared.ts';

export function movingAverage(data: OHLCData[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return round(slice.reduce((sum, item) => sum + item.close, 0) / slice.length);
}

export function percentReturn(data: OHLCData[], lookback: number): number | null {
  if (data.length < lookback + 1) return null;
  const start = data[data.length - lookback - 1]?.close;
  const end = data.at(-1)?.close;
  if (!start || !end) return null;
  return round(((end - start) / start) * 100);
}

export function low52WeekAdvance(data: OHLCData[]): number | null {
  const recent = data.slice(-252);
  const current = data.at(-1)?.close;
  if (recent.length < 20 || !current) return null;
  const low = Math.min(...recent.map((item) => item.low));
  return low > 0 ? round(((current - low) / low) * 100) : null;
}

export function momentumProfile(data: OHLCData[]) {
  const latest = data.at(-1);
  const ma50 = movingAverage(data, 50);
  const eightWeekReturnPct = percentReturn(data, 40);
  const distanceFromMa50Pct = latest && ma50 ? round(((latest.close - ma50) / ma50) * 100) : null;
  const low52WeekAdvancePct = low52WeekAdvance(data);
  const momentumBranch =
    (eightWeekReturnPct !== null && eightWeekReturnPct >= 100) ||
    (distanceFromMa50Pct !== null && distanceFromMa50Pct >= 20)
      ? 'EXTENDED' as const
      : 'STANDARD' as const;

  return { eightWeekReturnPct, distanceFromMa50Pct, low52WeekAdvancePct, momentumBranch };
}

export function analyzeHighTightFlag(data: OHLCData[], entryReference: number): HighTightFlagAnalysis | null {
  if (data.length < 50) return null;
  const recent = data.slice(-HTF_MAX_BASE_DAYS);
  let highIndex = 0;
  let baseHigh = 0;
  for (let index = 0; index < recent.length; index += 1) {
    if (recent[index].high > baseHigh) {
      baseHigh = recent[index].high;
      highIndex = index;
    }
  }

  const baseDays = recent.length - highIndex;
  const baseSlice = recent.slice(highIndex);
  if (baseSlice.length === 0) return null;

  const baseLow = Math.min(...baseSlice.map((item) => item.low));
  const maxDrawdownPct = baseHigh > 0 ? round(((baseHigh - baseLow) / baseHigh) * 100) : null;
  const avg50Volume = data.slice(-50).reduce((sum, item) => sum + item.volume, 0) / 50;
  const rightSide = data.slice(-5);
  const avgRightVolume = rightSide.reduce((sum, item) => sum + item.volume, 0) / Math.max(rightSide.length, 1);
  const rightSideVolumeRatio = avg50Volume > 0 ? round(avgRightVolume / avg50Volume, 2) : null;
  const avgRangePct = rightSide.length > 0
    ? rightSide.reduce((sum, item) => sum + ((item.high - item.low) / item.close) * 100, 0) / rightSide.length
    : 100;
  const tightnessScore = avgRangePct <= HTF_TIGHT_RANGE_PCT ? 100 : clamp(round(100 - (avgRangePct - HTF_TIGHT_RANGE_PCT) * 12), 0, 100);

  const baseDaysOk = baseDays >= HTF_MIN_BASE_DAYS && baseDays <= HTF_MAX_BASE_DAYS;
  const drawdownOk = maxDrawdownPct !== null && maxDrawdownPct >= HTF_MIN_DRAWDOWN && maxDrawdownPct <= HTF_MAX_DRAWDOWN;
  const volumeDryUpOk = rightSideVolumeRatio !== null && rightSideVolumeRatio <= HTF_MAX_VOLUME_RATIO;
  const passed = baseDaysOk && drawdownOk && volumeDryUpOk;
  const stopPrice = round(Math.max(baseLow, entryReference * 0.93));

  return {
    passed,
    baseDays,
    maxDrawdownPct,
    rightSideVolumeRatio,
    tightnessScore,
    baseHigh: round(baseHigh),
    baseLow: round(baseLow),
    stopPrice,
    stopPlan: [
      `Initial stop: max(base low ${round(baseLow)}, 7% cap ${round(entryReference * 0.93)}) = ${stopPrice}.`,
      'At +5%, move stop to breakeven.',
      'At +10%, trail with MA10 or the recent 10-day low.',
    ],
  };
}
