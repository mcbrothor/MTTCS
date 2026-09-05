export type ClosingMarket = 'KOSPI200' | 'KOSDAQ150';
export type ClosingMode = 'LIVE' | 'REPLAY';
export type ClosingPhase = 'WATCH' | 'FINAL';
export type ClosingQuality = 'FULL' | 'DEGRADED' | 'MISSING';

export interface ClosingBar {
  date: string;
  time?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number | null;
}

export interface ClosingQuote {
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  turnover: number;
  observedAt: string;
  receivedAt: string;
  sector: string | null;
  blockedReasons: string[];
  statusKnown: boolean;
  ask: number | null;
  bid: number | null;
  askVolume: number | null;
  bidVolume: number | null;
  expectedPrice: number | null;
  executionStrength: number | null;
}

export interface ClosingFlow {
  foreignNet: number | null;
  institutionNet: number | null;
  unit: 'SHARES' | 'KRW';
  asOf: string | null;
  kind: 'ESTIMATE' | 'PREVIOUS_CONFIRMED' | 'MISSING';
  venue: 'KRX' | 'UNKNOWN';
}

export interface ClosingEvidence {
  title: string;
  url: string;
  availableAt: string;
  kind: 'CATALYST' | 'RISK';
}

export interface ClosingInput {
  ticker: string;
  name: string;
  market: ClosingMarket;
  daily: ClosingBar[];
  minutes: ClosingBar[];
  quote: ClosingQuote | null;
  flow: ClosingFlow;
  historicalSameTimeVolumes: number[];
  evidence: ClosingEvidence[];
  warnings: string[];
}

export interface ClosingMetrics {
  price: number | null;
  changePct: number | null;
  turnover: number | null;
  vwap: number | null;
  rangePosition: number | null;
  lateReturnPct: number | null;
  relativeLateReturnPct: number | null;
  rvol: number | null;
  dailyVolumeRatio: number | null;
  ma20: number | null;
  ma60: number | null;
  atr14: number | null;
  breakout: number | null;
  spreadBps: number | null;
}

export interface ClosingCandidate {
  ticker: string;
  name: string;
  market: ClosingMarket;
  rank: number | null;
  score: number;
  scores: { late: number; liquidity: number; chart: number; flow: number; catalyst: number; execution: number; character: number };
  status: 'ACTIONABLE' | 'WATCH' | 'EXCLUDED';
  quality: ClosingQuality;
  sector: string | null;
  reasons: string[];
  exclusions: string[];
  warnings: string[];
  metrics: ClosingMetrics;
  flow: ClosingFlow;
  evidence: ClosingEvidence[];
  plan: { entryLow: number | null; entryMax: number | null; invalidation: number | null; target: number | null; exitRule: string; expiresAt: string };
  chart: ClosingBar[];
}

export interface ClosingSnapshot {
  session?: { open: string; close: string };
  id: string;
  modelVersion: string;
  tradeDate: string;
  asOf: string;
  createdAt: string;
  market: ClosingMarket;
  mode: ClosingMode;
  phase: ClosingPhase;
  venue: 'KRX';
  status: 'READY' | 'DEGRADED' | 'BLOCKED';
  regime: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  benchmarkLateReturnPct: number | null;
  universe: { name: string; observedAt: string; count: number; expectedCount: number; historicalMembership: boolean };
  coverage: { collected: number; total: number; failed: number };
  picks: ClosingCandidate[];
  reviewCandidates: ClosingCandidate[];
  candidates: ClosingCandidate[];
  warnings: string[];
  delivery?: { sent: number; skipped: number; failed: number };
}

export interface ClosingEvaluation {
  snapshotId: string;
  ticker: string;
  market: ClosingMarket;
  tradeDate: string;
  nextTradeDate: string | null;
  status: 'PENDING' | 'NO_ENTRY' | 'SIMULATED' | 'DATA_MISSING';
  close: number | null;
  entry: number | null;
  exit: number | null;
  exitReason: string | null;
  benchmarkReturnPct: number | null;
  netReturnPct: number | null;
  maePct: number | null;
  mfePct: number | null;
  costBps: number;
  warnings: string[];
}
