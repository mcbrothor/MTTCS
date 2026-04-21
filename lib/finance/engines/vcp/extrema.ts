import type { OHLCData } from '../../../../types/index.ts';
import { type LocalExtremum, PEAK_TROUGH_WINDOW } from './_shared.ts';

/** N일 윈도우 내에서 로컬 고점/저점을 찾습니다. */
export function findLocalExtrema(data: OHLCData[], window: number = PEAK_TROUGH_WINDOW): LocalExtremum[] {
  const extrema: LocalExtremum[] = [];
  if (data.length < window * 2 + 1) return extrema;

  for (let i = window; i < data.length - window; i++) {
    let isPeak = true;
    let isTrough = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (data[j].high >= data[i].high) isPeak = false;
      if (data[j].low <= data[i].low) isTrough = false;
    }

    if (isPeak) {
      extrema.push({ index: i, date: data[i].date, price: data[i].high, type: 'peak' });
    }
    if (isTrough) {
      extrema.push({ index: i, date: data[i].date, price: data[i].low, type: 'trough' });
    }
  }

  return extrema;
}
