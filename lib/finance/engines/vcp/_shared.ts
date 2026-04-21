export const round = (value: number, digits = 2) => Number(value.toFixed(digits));
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// --- 설정값 (벤치마킹 기반) ---
export const MIN_BASE_DAYS = 20;
export const MAX_BASE_DAYS = 325;
export const MIN_CONTRACTION_DEPTH = 3;
export const PEAK_TROUGH_WINDOW = 5;
export const BB_PERIOD = 20;
export const BB_SQUEEZE_PERCENTILE = 20;
export const POCKET_PIVOT_LOOKBACK = 10;
export const POCKET_PIVOT_MA_TOLERANCE = 3;

// --- 가중치 ---
export const WEIGHT_CONTRACTION = 0.35;
export const WEIGHT_VOLUME_DRY_UP = 0.25;
export const WEIGHT_BB_SQUEEZE = 0.20;
export const WEIGHT_POCKET_PIVOT = 0.20;

export const HTF_MIN_BASE_DAYS = 15;
export const HTF_MAX_BASE_DAYS = 25;
export const HTF_MIN_DRAWDOWN = 10;
export const HTF_MAX_DRAWDOWN = 20;
export const HTF_MAX_VOLUME_RATIO = 0.5;
export const HTF_TIGHT_RANGE_PCT = 6;

export interface LocalExtremum {
  index: number;
  date: string;
  price: number;
  type: 'peak' | 'trough';
}
