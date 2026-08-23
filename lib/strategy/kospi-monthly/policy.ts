export const KOSPI_MV23_VERSION = 'kospi-monthly-v2.3-2026.08-v1';
export const KOSPI_MV23 = {
  breadthLookback: 120,
  breadthTrend: 60, // 이상이면 추세장
  nonTrendLow: 40, nonTrendHigh: 60,
  recoveryLow: 30, recoveryHigh: 40,
  drawdownLevels: [-12, -18, -24],
  topNNew: 3, topNKeep: 5,
} as const;
export const KOSPI_MONTHLY_UNIVERSE = [
  { ticker: '069500', name: 'KODEX 200' }, { ticker: '229200', name: 'KODEX 코스닥150' },
  { ticker: '091160', name: 'KODEX 반도체' }, { ticker: '102110', name: 'TIGER 반도체' },
  { ticker: '148020', name: 'KODEX 코스닥레버리지' }, { ticker: '365040', name: 'TIGER 2차전지' },
  { ticker: '266370', name: 'KODEX 보험' }, { ticker: '140700', name: 'KODEX 자동차' },
  { ticker: '139260', name: 'TIGER 200' }, { ticker: '261070', name: 'TIGER 코스닥150' },
] as const;
