export type TradeStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type Direction = 'LONG' | 'SHORT';
export type AssessmentStatus = 'pass' | 'fail' | 'info' | 'warning';
export type TradeExecutionSide = 'ENTRY' | 'EXIT';
export type TradeLegLabel = 'E1' | 'E2' | 'E3' | 'MANUAL';
export type SetupTag = 'VCP' | 'SEPA' | '돌파' | '실적' | '추세' | '관심종목';
export type MistakeTag = '추격매수' | '손절지연' | '비중초과' | '조기매도' | '계획미준수' | '진입지연';

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

  setup_tags?: string[] | null;
  mistake_tags?: string[] | null;
  plan_note?: string | null;
  invalidation_note?: string | null;
  review_note?: string | null;
  review_action?: string | null;

  executions?: TradeExecution[];
  metrics?: TradeMetrics;
}

export interface TradeExecution {
  id: string;
  trade_id: string;
  created_at: string;
  updated_at: string;
  side: TradeExecutionSide;
  executed_at: string;
  price: number;
  shares: number;
  fees: number;
  leg_label: TradeLegLabel;
  note: string | null;
}

export interface TradeMetrics {
  entryShares: number;
  exitShares: number;
  netShares: number;
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  realizedPnL: number | null;
  fees: number;
  plannedRisk: number | null;
  rMultiple: number | null;
  entrySlippagePct: number | null;
  executionProgressPct: number;
  openRisk: number;
  hasExecutions: boolean;
  hasEntries: boolean;
  isFullyClosed: boolean;
  invalidExitShares: boolean;
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
  strategy?: 'MINERVINI_VCP';
  riskModel?: 'PATTERN_INVALIDATION';
  stopSource?: 'VCP_INVALIDATION' | 'MAX_LOSS_CAP' | 'RECENT_LOW_FALLBACK';
  maxLossPct?: number;
  invalidationPrice?: number | null;
}

// --- VCP (Volatility Contraction Pattern) 관련 타입 ---

/** 개별 수축 단계를 나타냅니다. */
export interface VcpContraction {
  peakDate: string;
  troughDate: string;
  peakPrice: number;
  troughPrice: number;
  depthPct: number;       // 수축 깊이 (%)
  avgVolume: number;       // 구간 평균 거래량
}

/** VCP 종합 분석 결과 */
export interface VcpAnalysis {
  score: number;            // 종합 점수 0~100
  grade: 'strong' | 'forming' | 'weak' | 'none';
  contractions: VcpContraction[];
  contractionScore: number;
  volumeDryUpScore: number;
  bbSqueezeScore: number;
  pocketPivotScore: number;
  pivotPrice: number | null;         // VCP 피벗 가격
  invalidationPrice: number | null;  // 최종 수축 저점 또는 최근 저점
  breakoutPrice: number;             // 최근 고점 참고가
  recommendedEntry: number;          // 최종 권장 진입가
  entrySource: 'VCP_PIVOT' | 'RECENT_HIGH_FALLBACK';
  breakoutVolumeRatio: number | null;
  breakoutVolumeStatus: 'confirmed' | 'pending' | 'weak' | 'unknown';
  pocketPivots: { date: string; close: number; volume: number }[];
  bbWidth: number | null;
  bbWidthPercentile: number | null;  // 6개월 내 백분위
  baseLength: number;                // 베이스 기간 (일)
  details: string[];                 // 판정 근거 텍스트
}

export interface MarketAnalysisResponse {
  ticker: string;
  exchange: string;
  providerUsed: string;
  priceData: OHLCData[];
  sepaEvidence: SepaEvidence;
  riskPlan: RiskPlan;
  vcpAnalysis: VcpAnalysis;
  fundamentals: FundamentalSnapshot | null;
  dataQuality: {
    bars: number;
    hasEnoughForAtr: boolean;
    hasEnoughForLongMa: boolean;
    missingFundamentals: string[];
  };
  warnings: string[];
}

export type ScannerUniverse = 'NASDAQ100' | 'SP500' | 'KOSPI100' | 'KOSDAQ100';
export type ScannerStatus = 'queued' | 'running' | 'done' | 'error';

export interface ScannerConstituent {
  rank: number;
  ticker: string;
  exchange: string;
  name: string;
  marketCap: number | null;
  currency: 'USD' | 'KRW';
  currentPrice: number | null;
  priceAsOf: string | null;
  priceSource: string;
}

export interface ScannerUniverseResponse {
  universe: ScannerUniverse;
  label: string;
  asOf: string;
  source: string;
  delayNote: string | null;
  items: ScannerConstituent[];
  warnings: string[];
}

export interface ScannerResult extends ScannerConstituent {
  status: ScannerStatus;
  sepaStatus: AssessmentStatus | null;
  sepaPassed: number | null;
  sepaFailed: number | null;
  vcpScore: number | null;
  vcpGrade: VcpAnalysis['grade'] | null;
  pivotPrice: number | null;
  recommendedEntry: number | null;
  distanceToPivotPct: number | null;
  breakoutVolumeStatus: VcpAnalysis['breakoutVolumeStatus'] | null;
  analyzedAt: string | null;
  errorMessage: string | null;
}

// --- 관심 종목 (Watchlist) ---

export type WatchlistPriority = 0 | 1 | 2; // 0=보통, 1=높음, 2=긴급

export interface WatchlistItem {
  id: string;
  created_at: string;
  updated_at: string;
  ticker: string;
  exchange: string;
  memo: string | null;
  tags: string[];
  priority: WatchlistPriority;
}

