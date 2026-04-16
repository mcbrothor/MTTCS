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

// --- VCP (Volatility Contraction Pattern) ---

/** Individual contraction segment. */
export interface VcpContraction {
  peakDate: string;
  troughDate: string;
  peakPrice: number;
  troughPrice: number;
  depthPct: number;
  avgVolume: number;
}

/** VCP analysis result. */
export interface VcpAnalysis {
  score: number;
  grade: 'strong' | 'forming' | 'weak' | 'none';
  contractions: VcpContraction[];
  contractionScore: number;
  volumeDryUpScore: number;
  bbSqueezeScore: number;
  pocketPivotScore: number;
  pivotPrice: number | null;
  invalidationPrice: number | null;
  breakoutPrice: number;
  recommendedEntry: number;
  entrySource: 'VCP_PIVOT' | 'RECENT_HIGH_FALLBACK';
  breakoutVolumeRatio: number | null;
  breakoutVolumeStatus: 'confirmed' | 'pending' | 'weak' | 'unknown';
  pocketPivots: { date: string; close: number; volume: number }[];
  bbWidth: number | null;
  bbWidthPercentile: number | null;
  baseLength: number;
  details: string[];
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
  contractionScore?: number | null;
  volumeDryUpScore?: number | null;
  bbSqueezeScore?: number | null;
  pocketPivotScore?: number | null;
  vcpDetails?: string[] | null;
  pivotPrice: number | null;
  recommendedEntry: number | null;
  distanceToPivotPct: number | null;
  breakoutVolumeStatus: VcpAnalysis['breakoutVolumeStatus'] | null;
  analyzedAt: string | null;
  errorMessage: string | null;
}

// --- Watchlist ---

export type WatchlistPriority = 0 | 1 | 2; // 0=normal, 1=high, 2=urgent

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


// --- Master Filter (Top-down Risk Management) ---

export type MarketState = 'GREEN' | 'YELLOW' | 'RED';

export interface MasterFilterMetricDetail {
  value: number | string | null;
  threshold: number | string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  label: string;
  unit: string;
  description: string;
  source: string;
  score?: number;
  weight?: number;
}

export interface MasterFilterMetrics {
  trend: MasterFilterMetricDetail;
  breadth: MasterFilterMetricDetail;
  liquidity: MasterFilterMetricDetail;
  volatility: MasterFilterMetricDetail;
  leadership: MasterFilterMetricDetail;
  ftd?: MasterFilterMetricDetail;
  distribution?: MasterFilterMetricDetail;
  newHighLow?: MasterFilterMetricDetail;
  above200d?: MasterFilterMetricDetail;
  sectorRotation?: MasterFilterMetricDetail;
  
  score: number; // 0 - 5
  p3Score?: number; // 0 - 100
  regimeHistory?: { date: string; state: MarketState; score: number; reason: string }[];
  
  // Source data for visualization and history.
  spyPrice?: number;
  ma50?: number;
  ma150?: number;
  ma200?: number;
  spyHistory?: { date: string; close: number }[];
  vixHistory?: { date: string; close: number }[];
  macroData?: Record<string, unknown>;
  updatedAt: string;
}

export interface MasterFilterResponse {
  state: MarketState;
  metrics: MasterFilterMetrics;
  insightLog: string;
  isAiGenerated: boolean;
  aiModelUsed?: string;
}

// --- Shared API contracts ---

export type ApiErrorCode = 'API_ERROR' | 'NO_DATA' | 'AUTH_REQUIRED' | 'TIMEOUT' | 'INVALID_INPUT' | 'NOT_FOUND';

export interface DataSourceMeta {
  asOf: string;
  source: string;
  provider: string;
  delay: 'REALTIME' | 'DELAYED_15M' | 'EOD' | 'UNKNOWN';
  fallbackUsed: boolean;
  warnings: string[];
}

export interface ApiSuccess<T> {
  data: T;
  meta: DataSourceMeta;
}

export interface ApiFailure {
  message: string;
  code: ApiErrorCode | string;
  details?: unknown;
  recoverable: boolean;
  lastSuccessfulAt?: string | null;
}

// --- Beauty Contest review loop ---

export type ContestMarket = 'US' | 'KR';
export type BeautyContestStatus = 'OPEN' | 'REVIEW_READY' | 'COMPLETED';
export type ContestReviewHorizon = 'W1' | 'M1';
export type ContestReviewStatus = 'PENDING' | 'UPDATED' | 'ERROR' | 'MANUAL';

export interface ContestPromptCandidate {
  ticker: string;
  exchange: string;
  name: string;
  user_rank: number;
  rs_rating: number | null;
  sepa_status: AssessmentStatus | null;
  sepa_passed: number | null;
  sepa_failed: number | null;
  vcp_status: VcpAnalysis['grade'] | null;
  vcp_score: number | null;
  contraction_score: number | null;
  volume_dry_up_score: number | null;
  bb_squeeze_score: number | null;
  pocket_pivot_score: number | null;
  pivot_price: number | null;
  distance_to_pivot_pct: number | null;
  avg_dollar_volume: number | null;
  price: number | null;
  price_as_of: string | null;
  source: string;
}

export interface BeautyContestSession {
  id: string;
  created_at: string;
  updated_at: string;
  market: ContestMarket;
  universe: ScannerUniverse | string;
  selected_at: string;
  prompt_payload: ContestPromptCandidate[];
  llm_prompt: string;
  llm_raw_response: string | null;
  llm_provider: string | null;
  status: BeautyContestStatus;
  candidates?: ContestCandidate[];
}

export interface ContestCandidate {
  id: string;
  created_at: string;
  updated_at: string;
  session_id: string;
  ticker: string;
  exchange: string;
  name: string | null;
  user_rank: number;
  llm_rank: number | null;
  llm_comment: string | null;
  actual_invested: boolean;
  linked_trade_id: string | null;
  entry_reference_price: number | null;
  snapshot: ContestPromptCandidate | Record<string, unknown> | null;
  reviews?: ContestReview[];
}

export interface ContestReview {
  id: string;
  created_at: string;
  updated_at: string;
  candidate_id: string;
  horizon: ContestReviewHorizon;
  due_date: string;
  base_price: number | null;
  review_price: number | null;
  return_pct: number | null;
  price_as_of: string | null;
  price_source: string | null;
  status: ContestReviewStatus;
  mistake_tags: string[];
  user_review_note: string | null;
  error_message?: string | null;
}

// --- Portfolio and position risk ---

export interface StopEvent {
  id: string;
  trade_id: string;
  created_at: string;
  stop_price: number;
  reason: string;
  source: 'INITIAL' | 'TEN_WEEK_MA' | 'HIGH_WATERMARK' | 'MANUAL' | 'PYRAMID';
}

export interface ExitRule {
  id: string;
  trade_id: string;
  created_at: string;
  trigger_type: 'GAIN_PCT' | 'PRICE' | 'R_MULTIPLE' | 'MANUAL';
  trigger_value: number;
  exit_fraction: number;
  note: string | null;
  executed: boolean;
}

export interface SecurityProfile {
  ticker: string;
  exchange: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  market: ContestMarket;
}

export interface PortfolioRiskSummary {
  totalEquity: number;
  investedCapital: number;
  cash: number;
  cashPct: number;
  activePositions: number;
  maxPositions: number;
  totalOpenRisk: number;
  openRiskPct: number;
  sectorExposure: { sector: string; exposure: number; exposurePct: number; count: number }[];
  warnings: string[];
}
