export type TradeStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED';
export type Direction = 'LONG' | 'SHORT';
export type AssessmentStatus = 'pass' | 'fail' | 'info';

export interface Trade {
  id: string;
  created_at: string;
  updated_at: string;

  ticker: string;
  direction: Direction;
  status: TradeStatus;

  chk_sepa?: boolean;
  chk_market?: boolean;
  chk_risk: boolean;
  chk_entry: boolean;
  chk_stoploss: boolean;
  chk_exit: boolean;
  chk_psychology: boolean;

  sepa_evidence: SepaEvidence | null;
  total_equity: number | null;
  planned_risk: number | null;
  risk_percent: number | null;
  atr_value: number | null;
  entry_price: number | null;
  stoploss_price: number | null;
  position_size: number | null;
  total_shares: number | null;
  entry_targets: EntryTargets | null;
  trailing_stops: TrailingStops | null;

  exit_price: number | null;
  result_amount: number | null;
  final_discipline: number | null;
  emotion_note: string | null;
}

export interface OHLCData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SepaCriterion {
  id: string;
  label: string;
  status: AssessmentStatus;
  actual: number | string | null;
  threshold: string;
  description: string;
}

export interface SepaEvidence {
  status: AssessmentStatus;
  criteria: SepaCriterion[];
  summary: {
    passed: number;
    failed: number;
    info: number;
    total: number;
  };
  metrics: {
    lastClose: number | null;
    ma50: number | null;
    ma150: number | null;
    ma200: number | null;
    high52Week: number | null;
    distanceFromHigh52WeekPct: number | null;
    avgDollarVolume20: number | null;
    rsRating: number | null;
    benchmarkReturn26Week: number | null;
    stockReturn26Week: number | null;
  };
}

export interface FundamentalSnapshot {
  epsGrowthPct: number | null;
  revenueGrowthPct: number | null;
  roePct: number | null;
  debtToEquityPct: number | null;
  source: string;
}

export interface EntryLeg {
  label: string;
  price: number;
  shares: number;
}

export interface EntryTargets {
  e1: EntryLeg;
  e2: EntryLeg;
  e3: EntryLeg;
}

export interface TrailingStops {
  initial: number;
  afterEntry2: number;
  afterEntry3: number;
}

export interface RiskPlan {
  totalEquity: number;
  maxRisk: number;
  riskPercent: number;
  atr: number;
  entryPrice: number;
  stopLossPrice: number;
  riskPerShare: number;
  totalShares: number;
  entryTargets: EntryTargets;
  trailingStops: TrailingStops;
}

export interface MarketAnalysisResponse {
  ticker: string;
  exchange: string;
  providerUsed: string;
  priceData: OHLCData[];
  sepaEvidence: SepaEvidence;
  riskPlan: RiskPlan;
  fundamentals: FundamentalSnapshot | null;
  dataQuality: {
    bars: number;
    hasEnoughForAtr: boolean;
    hasEnoughForLongMa: boolean;
    missingFundamentals: string[];
  };
  warnings: string[];
}
