import { round } from './_shared.ts';

/**
 * 지난 N봉(기본 252) 종가 기준 Maximum Drawdown을 rolling-peak 방식으로 계산합니다.
 * 최소 50봉 미만이거나 유효 close가 없으면 null 반환.
 */
export function computeMdd52w(closes: number[], lookback = 252): number | null {
  const window = closes.slice(-lookback);
  if (window.length < 50) return null;

  let peak = window[0];
  let maxDrawdown = 0;

  for (const close of window) {
    if (close <= 0) continue;
    if (close > peak) peak = close;
    const drawdown = (peak - close) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  if (peak <= 0) return null;
  return round(maxDrawdown * 100);
}
