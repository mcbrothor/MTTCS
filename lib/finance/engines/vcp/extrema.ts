import type { OHLCData } from '../../../../types/index.ts';
import { type LocalExtremum, PEAK_TROUGH_WINDOW } from './_shared.ts';

/**
 * 일봉 데이터를 주봉 OHLC로 리샘플합니다.
 * Minervini VCP는 주봉 차트 기준이므로 일봉 노이즈를 제거한 주봉 extrema가 정확합니다.
 */
export function resampleToWeekly(data: OHLCData[]): OHLCData[] {
  if (data.length === 0) return [];

  const weeks: OHLCData[] = [];
  let weekCandles: OHLCData[] = [];

  const getIsoWeekKey = (date: string) => {
    // YYYYMMDD -> YYYY-MM-DD (Node.js/V8 호환성)
    const formatted = date.length === 8 && !date.includes('-')
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      : date;
    const d = new Date(formatted);
    const day = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    return monday.toISOString().slice(0, 10);
  };

  let currentWeek = getIsoWeekKey(data[0].date);

  for (const candle of data) {
    const week = getIsoWeekKey(candle.date);
    if (week !== currentWeek && weekCandles.length > 0) {
      weeks.push(aggregateWeek(weekCandles));
      weekCandles = [];
      currentWeek = week;
    }
    weekCandles.push(candle);
  }
  if (weekCandles.length > 0) weeks.push(aggregateWeek(weekCandles));

  return weeks;
}

function aggregateWeek(candles: OHLCData[]): OHLCData {
  return {
    date: candles[0].date,
    open: candles[0].open,
    high: Math.max(...candles.map((c) => c.high)),
    low: Math.min(...candles.map((c) => c.low)),
    close: candles[candles.length - 1].close,
    volume: candles.reduce((sum, c) => sum + c.volume, 0),
  };
}

/**
 * N봉(주봉 기준) 윈도우 내에서 로컬 고점/저점을 찾습니다.
 * 입력 데이터는 주봉으로 리샘플된 상태를 권장합니다 (resampleToWeekly 후 호출).
 * 반환 인덱스는 주봉 배열 기준이므로, 호출자가 원하는 경우 일봉 매핑이 필요합니다.
 */
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
