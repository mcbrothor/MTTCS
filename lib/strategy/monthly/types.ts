export interface MonthlyBar {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export type MonthlyMarket = 'KR' | 'US';
export type MonthlySignalStatus = 'FINAL' | 'PROVISIONAL' | 'BLOCKED';
export type MonthlyAssetClass = 'EQUITY_SECTOR' | 'EQUITY_BENCHMARK';
export type MonthlyRegime =
  | 'BROAD_TREND'
  | 'TREND'
  | 'NON_TREND'
  | 'RECOVERY'
  | 'CRASH_50'
  | 'CRASH_75'
  | 'CRASH_100'
  | 'CASH';

export interface MonthlyAssetDefinition {
  ticker: string;
  providerSymbol: string;
  name: string;
  group: string;
  assetClass: MonthlyAssetClass;
}

export interface MonthlyRegimeThresholds {
  broadTrend?: number;
  trend: number;
  nonTrend: number;
  recovery: number;
  hysteresis: number;
  drawdown50: number;
  drawdown75: number;
  drawdown100: number;
}

export interface MonthlyStrategyPolicy {
  market: MonthlyMarket;
  modelVersion: string;
  modelStatus: 'RESEARCH_ONLY';
  timeZone: string;
  benchmarkSymbol: string;
  universe: readonly MonthlyAssetDefinition[];
  crashTarget?: MonthlyAssetDefinition;
  crashReentryMovingAverage?: number;
  breadthLookback: number;
  relativeMomentum3Lookback: number;
  relativeMomentum6Lookback: number;
  absoluteMomentum12Lookback: number;
  absoluteMomentumSkip: number;
  entryTopN: number;
  keepTopN: number;
  minimumCoverage: number;
  transactionCostRate: number;
  regime: MonthlyRegimeThresholds;
  resolveExposure: (regime: MonthlyRegime, averageRelativeMomentum: number | null) => number;
}

export interface MonthlyCandidate {
  ticker: string;
  name: string;
  group: string;
  eligible: boolean;
  rank: number;
  score: number;
  relativeMomentum3: number | null;
  relativeMomentum6: number | null;
  absoluteMomentum12Skip: number | null;
  aboveMovingAverage: boolean;
  close: number | null;
  movingAverage: number | null;
}

export interface MonthlySelection {
  ranked: MonthlyCandidate[];
  selected: MonthlyCandidate[];
  buy: MonthlyCandidate[];
  hold: MonthlyCandidate[];
  sell: Array<{ ticker: string; name: string }>;
  watch: MonthlyCandidate[];
}

export interface MonthlyRegimeDecision {
  regime: MonthlyRegime;
  rawRegime: MonthlyRegime;
  hysteresisApplied: boolean;
}

export interface MonthlyPortfolioTarget {
  ticker: string;
  name: string;
  group: string;
  action: 'BUY' | 'HOLD';
  targetWeight: number;
  score: number;
  relativeMomentum3: number | null;
  relativeMomentum6: number | null;
  absoluteMomentum12Skip: number | null;
}

export interface MonthlySnapshotQuality {
  status: 'FULL' | 'BLOCKED';
  requested: number;
  available: number;
  coverage: number;
  asOf: string | null;
  warnings: string[];
}

export interface MonthlyStrategySnapshot {
  market: MonthlyMarket;
  modelVersion: string;
  modelStatus: 'RESEARCH_ONLY';
  status: MonthlySignalStatus;
  signalAt: string | null;
  effectiveAt: string | null;
  latestObservationAt: string | null;
  executionPolicy: 'NEXT_SESSION_CLOSE';
  returnStartPolicy: 'SESSION_AFTER_FILL';
  quality: MonthlySnapshotQuality;
  breadth: number | null;
  drawdownPct: number | null;
  averageRelativeMomentum: number | null;
  regime: (MonthlyRegimeDecision & { weight: number }) | null;
  portfolio: MonthlyPortfolioTarget[];
  cashWeight: number;
  rankings: MonthlyCandidate[];
  actions: {
    buy: Array<{ ticker: string; name: string }>;
    hold: Array<{ ticker: string; name: string }>;
    sell: Array<{ ticker: string; name: string }>;
    watch: Array<{ ticker: string; name: string }>;
  };
}

export interface BuildMonthlySnapshotInput {
  policy: MonthlyStrategyPolicy;
  benchmarkBars: MonthlyBar[];
  barsByTicker: Record<string, MonthlyBar[]>;
  previousHoldings?: string[];
  previousRegime?: MonthlyRegime | null;
  now?: Date;
}
