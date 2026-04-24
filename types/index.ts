export type TradeStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type Direction = 'LONG' | 'SHORT';
export type AssessmentStatus = 'pass' | 'fail' | 'info' | 'warning';
export type TradeExecutionSide = 'ENTRY' | 'EXIT';
export type TradeLegLabel = 'E1' | 'E2' | 'E3' | 'MANUAL';
export type SetupTag = 'VCP' | 'SEPA' | '돌파' | '실적' | '추세' | '관심종목';
export type MistakeTag = '추격매수' | '손절지연' | '비중초과' | '조기매도' | '계획미준수' | '진입지연';

/**
 * 청산 사유 태그 — 복기 통계에서 유형별 집계에 사용
 * - 손절: 초기 손절선 도달
 * - 목표가도달: R-Target 또는 이익 목표 달성
 * - 시장RED전환: 마스터 필터 RED로 전환 후 방어적 청산
 * - 기술적이탈: 지지선 붕괴, 이평선 하향 돌파 등
 * - 조기청산: 계획 전 감정적 또는 선제적 청산
 * - 기타: 위 카테고리 외 사유
 */
export type ExitReason = '손절' | '목표가도달' | '시장RED전환' | '기술적이탈' | '조기청산' | '기타';

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
  exit_reason: ExitReason | null; // 청산 사유 태그 — 복기 집계용
  result_amount: number | null;
  final_discipline: number | null;
  emotion_note: string | null;

  setup_tags?: string[] | null;
  mistake_tags?: string[] | null;
  plan_note?: string | null;
  invalidation_note?: string | null;
  review_note?: string | null;
  review_action?: string | null;
  entry_snapshot?: TradeEntrySnapshot | null;
  contest_snapshot?: TradeContestSnapshot | null;
  llm_verdict?: TradeLlmVerdict | null;

  executions?: TradeExecution[];
  metrics?: TradeMetrics;
}

export interface TradeEntrySnapshot {
  version: 'mtn-entry-snapshot-v1';
  captured_at: string;
  ticker: string;
  direction: Direction;
  checklist: {
    sepa: boolean;
    market: boolean;
    risk: boolean;
    entry: boolean;
    stoploss: boolean;
    exit: boolean;
    psychology: boolean;
  };
  plan: {
    total_equity: number | null;
    planned_risk: number | null;
    risk_percent: number | null;
    entry_price: number | null;
    stoploss_price: number | null;
    position_size: number | null;
    total_shares: number | null;
    entry_targets: EntryTargets | null;
    trailing_stops: TrailingStops | null;
  };
  sepa: {
    status: AssessmentStatus | null;
    passed: number | null;
    failed: number | null;
    core_passed: number | null;
    core_failed: number | null;
    core_total: number | null;
    rs_rating: number | null;
    rs_source: 'DB_BATCH' | 'UNIVERSE' | 'BENCHMARK_PROXY' | null;
    macro_action_level: MacroActionLevel | null;
  };
  vcp: {
    grade: VcpAnalysis['grade'] | null;
    score: number | null;
    base_type: BaseType | null;
    pivot_price: number | null;
    recommended_entry: number | null;
    invalidation_price: number | null;
    breakout_volume_status: VcpAnalysis['breakoutVolumeStatus'] | null;
    contraction_count: number | null;
    volume_dry_up_score: number | null;
    pocket_pivot_score: number | null;
  };
  notes: {
    plan_note: string | null;
    invalidation_note: string | null;
  };
}

export interface TradeContestSnapshot {
  version: 'mtn-contest-snapshot-v1';
  captured_at: string;
  session: {
    id: string;
    market: ContestMarket;
    universe: ScannerUniverse | string;
    selected_at: string;
    status: BeautyContestStatus;
    llm_provider: string | null;
    response_schema_version?: string | null;
  };
  candidate: {
    id: string;
    ticker: string;
    exchange: string;
    name: string | null;
    user_rank: number;
    llm_rank: number | null;
    actual_invested: boolean;
    final_pick_rank: number | null;
    recommendation_tier?: RecommendationTier | null;
    recommendation_reason?: string | null;
    entry_reference_price: number | null;
    linked_trade_id: string | null;
  };
  market_context?: Record<string, unknown> | null;
  candidate_pool_snapshot?: unknown[] | null;
}

export interface TradeLlmVerdict {
  version: 'mtn-llm-verdict-v1';
  captured_at: string;
  session_id: string;
  candidate_id: string;
  ticker: string;
  llm_provider: string | null;
  llm_rank: number | null;
  comment: string | null;
  overall?: ContestLlmOverall | null;
  key_strength?: string | null;
  key_risk?: string | null;
  recommendation?: ContestLlmRecommendation | null;
  confidence?: number | null;
  scores?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
  analysis?: Record<string, unknown> | null;
  response_schema_version?: string | null;
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
  historicalAvgEntryPrice?: number | null;
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

  // Real-time tracking fields
  currentPrice: number | null;
  unrealizedPnL: number | null;
  unrealizedR: number | null;
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
  isCore?: boolean;
}

export interface SepaEvidence {
  status: AssessmentStatus;
  criteria: SepaCriterion[];
  summary: {
    passed: number;
    failed: number;
    info: number;
    total: number;
    corePassed: number;
    coreFailed: number;
    coreTotal: number;
  };
  metrics: {
    lastClose: number | null;
    ma50: number | null;
    ma150: number | null;
    ma200: number | null;
    high52Week: number | null;
    distanceFromHigh52WeekPct: number | null;
    low52Week: number | null;
    distanceFromLow52WeekPct: number | null;
    avgDollarVolume20: number | null;
    rsRating: number | null;
    /**
     * RS Rating의 출처를 명시합니다.
     * - 'DB_BATCH': stock_metrics 테이블에 저장된 rs:metrics 배치 결과 (공식 RS Rating)
     * - 'UNIVERSE': 현재 호출의 내부 유니버스 랭킹
     * - 'BENCHMARK_PROXY': SPY 대비 6개월 초과수익률로 추정 (Fallback — 참고용)
     * - null: RS를 계산할 수 없었음
     */
    rsSource?: 'DB_BATCH' | 'UNIVERSE' | 'BENCHMARK_PROXY' | null;
    internalRsRating?: number | null;
    externalRsRating?: number | null;
    rsRank?: number | null;
    rsUniverseSize?: number | null;
    rsPercentile?: number | null;
    weightedMomentumScore?: number | null;
    ibdProxyScore?: number | null;
    mansfieldRsFlag?: boolean | null;
    mansfieldRsScore?: number | null;
    rsDataQuality?: DataQuality | null;
    macroActionLevel?: MacroActionLevel | null;
    benchmarkRelativeScore?: number | null;
    rsLineNewHigh?: boolean | null;
    rsLineNearHigh?: boolean | null;
    tennisBallCount?: number | null;
    tennisBallScore?: number | null;
    return3m?: number | null;
    return6m?: number | null;
    return9m?: number | null;
    return12m?: number | null;
    benchmarkReturn26Week: number | null;
    stockReturn26Week: number | null;
  };
}

export interface FundamentalSnapshot {
  epsGrowthPct: number | null;
  revenueGrowthPct: number | null;
  roePct: number | null;
  debtToEquityPct: number | null;
  currentQtrEpsGrowth?: number | null;
  priorQtrEpsGrowth?: number | null;
  epsGrowthLast3Qtrs?: (number | null)[];
  currentQtrSalesGrowth?: number | null;
  annualEpsGrowthEachYear?: (number | null)[];
  hadNegativeEpsInLast3Yr?: boolean | null;
  numInstitutionalHolders?: number | null;
  institutionalOwnershipPct?: number | null;
  floatShares?: number | null;
  sharesBuyback?: boolean | null;
  sector?: string | null;
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
  strategy?: 'MINERVINI_VCP' | 'HIGH_TIGHT_FLAG';
  riskModel?: 'PATTERN_INVALIDATION' | 'HIGH_TIGHT_FLAG_TIGHT_STOP';
  stopSource?: 'VCP_INVALIDATION' | 'MAX_LOSS_CAP' | 'RECENT_LOW_FALLBACK' | 'HTF_BASE_LOW' | 'HTF_MAX_LOSS_CAP';
  maxLossPct?: number;
  invalidationPrice?: number | null;
  riskNotes?: string[];
}

// --- VCP (Volatility Contraction Pattern) ---

export interface VcpContraction {
  peakDate: string;
  troughDate: string;
  peakPrice: number;
  troughPrice: number;
  depthPct: number;
  avgVolume: number;
}

export type BaseType = 'Standard_VCP' | 'High_Tight_Flag';
export type MomentumBranch = 'STANDARD' | 'EXTENDED';

export interface HighTightFlagAnalysis {
  passed: boolean;
  baseDays: number;
  maxDrawdownPct: number | null;
  rightSideVolumeRatio: number | null;
  tightnessScore: number;
  baseHigh: number;
  baseLow: number;
  stopPrice: number;
  stopPlan: string[];
}

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
  entrySource: 'VCP_PIVOT' | 'RECENT_HIGH_FALLBACK' | 'HIGH_TIGHT_FLAG';
  breakoutVolumeRatio: number | null;
  breakoutVolumeStatus: 'confirmed' | 'pending' | 'weak' | 'unknown';
  pocketPivots: { date: string; close: number; volume: number }[];
  bbWidth: number | null;
  bbWidthPercentile: number | null;
  baseLength: number;
  baseType: BaseType | null;
  momentumBranch: MomentumBranch;
  eightWeekReturnPct: number | null;
  distanceFromMa50Pct: number | null;
  low52WeekAdvancePct: number | null;
  highTightFlag: HighTightFlagAnalysis | null;
  details: string[];
}

export interface MarketAnalysisResponse {
  ticker: string;
  exchange: string;
  providerUsed: string;
  providerAttempts?: ProviderAttempt[];
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

export type ProviderAttemptStatus = 'success' | 'warning' | 'failed';

export interface ProviderAttempt {
  provider: string;
  stage: string;
  status: ProviderAttemptStatus;
  message: string;
  bars?: number;
  upstreamStatus?: number | null;
  attemptedAt: string;
}

export type ScannerUniverse = 'NASDAQ100' | 'SP500' | 'KOSPI200' | 'KOSDAQ150' | 'RUSSELL2000' | 'KOSDAQALL';
export type MarketCode = 'KR' | 'US';
export type DataQuality = 'FULL' | 'PARTIAL' | 'NA';
export type MacroActionLevel = 'FULL' | 'REDUCED' | 'HALT';

export interface StockMetric {
  ticker: string;
  market: MarketCode;
  calc_date: string;
  ibd_proxy_score: number | null;
  rs_rating: number | null;
  rs_rank: number | null;
  rs_universe_size: number | null;
  mansfield_rs_flag: boolean | null;
  mansfield_rs_score: number | null;
  data_quality: DataQuality;
  price_source: string | null;
  error_message: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MacroTrend {
  index_code: string;
  market: MarketCode;
  calc_date: string;
  index_price: number | null;
  ma_50: number | null;
  ma_200: number | null;
  is_uptrend_50: boolean | null;
  is_uptrend_200: boolean | null;
  action_level: MacroActionLevel;
  created_at?: string;
  updated_at?: string;
}
export type ScannerStatus = 'queued' | 'running' | 'done' | 'error';
export type RecommendationTier = 'Recommended' | 'Partial' | 'Low Priority' | 'Error';

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

export interface InvestmentResource {
  id: string;
  user_id: string;
  title: string;
  url: string;
  category: string;
  display_order: number;
  created_at: string;
  updated_at: string;
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
  recommendationTier: RecommendationTier;
  recommendationReason: string;
  sepaMissingCount: number | null;
  exceptionSignals: string[];
  providerAttempts?: ProviderAttempt[];
  sepaStatus: AssessmentStatus | null;
  sepaPassed: number | null;
  sepaFailed: number | null;
  sepaCriteria: SepaCriterion[] | null;
  sepaEvidence?: SepaEvidence | null;
  vcpScore: number | null;
  vcpGrade: VcpAnalysis['grade'] | null;
  contractionScore?: number | null;
  volumeDryUpScore?: number | null;
  bbSqueezeScore?: number | null;
  pocketPivotScore?: number | null;
  vcpDetails?: string[] | null;
  fundamentals?: FundamentalSnapshot | null;
  pivotPrice: number | null;
  recommendedEntry: number | null;
  distanceToPivotPct: number | null;
  breakoutVolumeStatus: VcpAnalysis['breakoutVolumeStatus'] | null;
  baseType: BaseType | null;
  momentumBranch: MomentumBranch | null;
  eightWeekReturnPct?: number | null;
  distanceFromMa50Pct?: number | null;
  low52WeekAdvancePct?: number | null;
  highTightFlag?: HighTightFlagAnalysis | null;
  rsRating?: number | null;
  rsSource?: 'DB_BATCH' | 'UNIVERSE' | 'BENCHMARK_PROXY' | null;
  internalRsRating?: number | null;
  externalRsRating?: number | null;
  rsRank?: number | null;
  rsUniverseSize?: number | null;
  rsPercentile?: number | null;
  weightedMomentumScore?: number | null;
  ibdProxyScore?: number | null;
  mansfieldRsFlag?: boolean | null;
  mansfieldRsScore?: number | null;
  rsDataQuality?: DataQuality | null;
  macroActionLevel?: MacroActionLevel | null;
  benchmarkRelativeScore?: number | null;
  rsLineNewHigh?: boolean | null;
  rsLineNearHigh?: boolean | null;
  tennisBallCount?: number | null;
  tennisBallScore?: number | null;
  return3m?: number | null;
  return6m?: number | null;
  return9m?: number | null;
  return12m?: number | null;
  analyzedAt: string | null;
  errorMessage: string | null;
  dataWarnings: string[];
}

export type WatchlistPriority = 0 | 1 | 2;

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

export type MarketState = 'GREEN' | 'YELLOW' | 'RED';
export type AiInsightProvider = 'gemini' | 'groq' | 'cerebras' | 'rules';

export interface AiFallbackAttempt {
  provider: string; model: string; status: 'success' | 'failed' | 'skipped'; message?: string;
}

export interface AiModelInsight {
  id: string;
  provider: AiInsightProvider;
  label: string;
  model: string;
  status: 'success' | 'failed' | 'skipped';
  text?: string;
  message?: string;
  selected: boolean;
  priority: number;
  generatedAt: string;
}

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
  volatility: MasterFilterMetricDetail;
  ftd: MasterFilterMetricDetail;
  distribution: MasterFilterMetricDetail;
  newHighLow: MasterFilterMetricDetail;
  sectorRotation: MasterFilterMetricDetail;
  score: number;
  p3Score: number;
  regimeHistory?: { date: string; state: MarketState; score: number; reason: string }[];
  meta: DataSourceMeta;
  mainPrice?: number;
  ma50?: number;
  ma150?: number;
  ma200?: number;
  mainHistory?: { date: string; close: number }[];
  movingAverageHistory?: { date: string; ma50: number | null; ma200: number | null }[];
  vixHistory?: { date: string; close: number }[];
  sectorRows?: { symbol: string; name: string; return20: number; riskOn: boolean; rank: number }[];
  ftdReason?: string | null;
  distributionDetails?: { date: string, close: number, volume: number, pctChange: number }[];
  macroData?: Record<string, unknown>;
  updatedAt: string;
}

export interface MasterFilterResponse {
  state: MarketState;
  market: ContestMarket;
  metrics: MasterFilterMetrics;
  insightLog: string;
  isAiGenerated: boolean;
  aiProviderUsed?: AiInsightProvider;
  aiModelUsed?: string;
  aiFallbackChain?: AiFallbackAttempt[];
  aiModelInsights?: AiModelInsight[];
  aiErrorSummary?: string | null;
}

export type MacroRegime = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';

export interface MacroScoreBreakdown {
  label: string; weight: number; score: number; description: string;
}

export interface MacroResponse {
  data: Record<string, unknown>;
  score: number;
  regime: MacroRegime;
  breakdown: MacroScoreBreakdown[];
  spyAbove50ma: boolean;
  hygIefDiff: number;
  vixLevel: number;
}

export type ApiErrorCode = 'API_ERROR' | 'NO_DATA' | 'AUTH_REQUIRED' | 'TIMEOUT' | 'INVALID_INPUT' | 'NOT_FOUND';

export interface DataSourceMeta {
  asOf: string; source: string; provider: string; delay: 'REALTIME' | 'DELAYED_15M' | 'EOD' | 'UNKNOWN'; fallbackUsed: boolean; warnings: string[];
}

export interface ApiSuccess<T> { data: T; meta: DataSourceMeta; }
export interface ApiFailure { message: string; code: ApiErrorCode | string; details?: unknown; recoverable: boolean; lastSuccessfulAt?: string | null; }

export type ContestMarket = 'US' | 'KR';
export type BeautyContestStatus = 'OPEN' | 'REVIEW_READY' | 'COMPLETED';
export type ContestReviewHorizon = 'W1' | 'M1';
export type ContestReviewStatus = 'PENDING' | 'UPDATED' | 'ERROR' | 'MANUAL';
export type ContestLlmOverall = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type ContestLlmRecommendation = 'PROCEED' | 'WATCH' | 'SKIP';

export interface ContestPromptCandidate {
  candidate_id?: string; ticker: string; exchange: string; name: string; user_rank: number; recommendation_tier?: RecommendationTier | null; recommendation_reason?: string | null; exception_signals?: string[]; rs_rating: number | null; internal_rs_rating?: number | null; external_rs_rating?: number | null; rs_rank?: number | null; rs_universe_size?: number | null; rs_percentile?: number | null; weighted_momentum_score?: number | null; ibd_proxy_score?: number | null; mansfield_rs_flag?: boolean | null; mansfield_rs_score?: number | null; rs_data_quality?: DataQuality | null; macro_action_level?: MacroActionLevel | null; benchmark_relative_score?: number | null; rs_line_new_high?: boolean | null; rs_line_near_high?: boolean | null; tennis_ball_count?: number | null; tennis_ball_score?: number | null; return_3m?: number | null; return_6m?: number | null; return_9m?: number | null; return_12m?: number | null; base_type?: BaseType | null; momentum_branch?: MomentumBranch | null; eight_week_return_pct?: number | null; distance_from_ma50_pct?: number | null; low_52_week_advance_pct?: number | null; high_tight_flag?: HighTightFlagAnalysis | null; sepa_status: AssessmentStatus | null; sepa_passed: number | null; sepa_failed: number | null; vcp_status: VcpAnalysis['grade'] | null; vcp_score: number | null; contraction_score: number | null; volume_dry_up_score: number | null; bb_squeeze_score: number | null; pocket_pivot_score: number | null; pivot_price: number | null; distance_to_pivot_pct: number | null; avg_dollar_volume: number | null; price: number | null; price_as_of: string | null; source: string; provider_attempts?: ProviderAttempt[];
}

export interface ContestLlmRanking {
  session_id: string | null;
  candidate_id: string | null;
  ticker: string;
  rank: number;
  overall: ContestLlmOverall;
  key_strength: string;
  key_risk: string;
  recommendation: ContestLlmRecommendation;
  confidence: number;
  comment: string | null;
  scores: Record<string, unknown> | null;
  analysis: Record<string, unknown>;
}

export interface ContestLlmResponse {
  response_schema_version: string;
  session_id: string | null;
  rankings: ContestLlmRanking[];
}

export interface BeautyContestSession {
  id: string; created_at: string; updated_at: string; market: ContestMarket; universe: ScannerUniverse | string; selected_at: string; prompt_payload: ContestPromptCandidate[]; prompt_version?: string | null; response_schema_version?: string | null; market_context?: Record<string, unknown> | null; candidate_pool_snapshot?: unknown[] | null; llm_prompt: string; llm_raw_response: string | null; llm_provider: string | null; status: BeautyContestStatus; candidates?: ContestCandidate[];
}

export interface ContestCandidate {
  id: string; created_at: string; updated_at: string; session_id: string; ticker: string; exchange: string; name: string | null; user_rank: number; llm_rank: number | null; llm_comment: string | null; recommendation_tier?: RecommendationTier | null; recommendation_reason?: string | null; llm_scores?: Record<string, unknown> | null; llm_analysis?: Record<string, unknown> | null; final_pick_rank?: number | null; final_pick_note?: string | null; actual_invested: boolean; linked_trade_id: string | null; entry_reference_price: number | null; snapshot: ContestPromptCandidate | Record<string, unknown> | null; reviews?: ContestReview[];
}

export interface ContestReview {
  id: string; created_at: string; updated_at: string; candidate_id: string; horizon: ContestReviewHorizon; due_date: string; base_price: number | null; review_price: number | null; return_pct: number | null; price_as_of: string | null; price_source: string | null; status: ContestReviewStatus; mistake_tags: string[]; user_review_note: string | null; error_message?: string | null;
}

export interface StopEvent {
  id: string; trade_id: string; created_at: string; stop_price: number; reason: string; source: 'INITIAL' | 'TEN_WEEK_MA' | 'HIGH_WATERMARK' | 'MANUAL' | 'PYRAMID';
}

export interface ExitRule {
  id: string; trade_id: string; created_at: string; trigger_type: 'GAIN_PCT' | 'PRICE' | 'R_MULTIPLE' | 'MANUAL'; trigger_value: number; exit_fraction: number; note: string | null; executed: boolean;
}

export interface SecurityProfile {
  ticker: string; exchange: string; name: string | null; sector: string | null; industry: string | null; market: ContestMarket;
}

export interface PortfolioRiskSummary {
  totalEquity: number; investedCapital: number; cash: number; cashPct: number; activePositions: number; maxPositions: number; totalOpenRisk: number; openRiskPct: number; sectorExposure: { sector: string; exposure: number; exposurePct: number; count: number }[]; warnings: string[]; positions?: { ticker: string; status: TradeStatus; sector: string; exposure: number; netShares: number; avgEntryPrice: number | null; currentPrice: number | null; unrealizedPnL: number | null; unrealizedR: number | null; openRisk: number; pyramidCount: number; partialExitCount: number; latestAction: string | null; }[];
}

// --- CAN SLIM 스캐너 모듈 ---

/** 베이스 패턴 유형 */
export type CanslimBasePatternType = 'CUP_WITH_HANDLE' | 'DOUBLE_BOTTOM' | 'FLAT_BASE' | 'VCP' | 'UNKNOWN';

export interface BasePattern {
  type: CanslimBasePatternType;
  pivotPoint: number;
  weeksForming: number;
  depthPct: number;
  isValid: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CanslimStockData {
  symbol: string;
  market: MarketCode;
  marketCap: number | null;

  // C: Current Quarterly Earnings
  currentQtrEpsGrowth: number | null;
  priorQtrEpsGrowth: number | null;        // 직전(-1q) 분기 YoY 성장률
  nextQtrEpsEstimate: number | null;       // 다음(+1q) 분기 추정 성장률 (참고용)
  epsGrowthLast3Qtrs: (number | null)[];
  currentQtrSalesGrowth: number | null;

  // A: Annual Earnings Growth
  annualEpsGrowthEachYear: (number | null)[];
  hadNegativeEpsInLast3Yr: boolean | null;
  roe: number | null;

  // N: New High / Base Pattern
  currentPrice: number;
  price52WeekHigh: number;
  pivotPoint: number | null;
  weeksBuildingBase: number | null;
  detectedBasePattern: CanslimBasePatternType | null;

  // S: Supply & Demand
  dailyVolume: number;
  avgVolume50: number;
  floatShares: number | null;
  sharesBuyback: boolean | null;

  // L: Leader
  rsRating: number | null;
  mansfieldRsFlag: boolean | null;

  // I: Institutional Sponsorship
  institutionalSponsorshipTrend: 'INCREASING' | 'FLAT' | 'DECREASING' | null;
  institutionalOwnershipPct: number | null;
  numInstitutionalHolders: number | null;
}

export interface CanslimMacroMarketData {
  actionLevel: MacroActionLevel;
  is_uptrend_50?: boolean;
  is_uptrend_200?: boolean;
  distributionDayCount: number;
  followThroughDay: boolean;
  lastFTDDate: string | null;
  benchmarkData?: OHLCData[];
}

export type CanslimNStatus = 'VALID' | 'EXTENDED' | 'TOO_LATE' | 'INVALID';

export interface CanslimResult {
  pass: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  failedPillar: string | null;
  warnings: string[];
  nStatus: CanslimNStatus;
  stopLossPrice: number | null;
  pillarDetails: CanslimPillarDetail[];
}

export type CanslimPillarKey = 'M' | 'C' | 'A' | 'N' | 'S' | 'L' | 'I';

export interface CanslimAnalysisCoverage {
  complete: boolean;
  missingFields: string[];
}

export interface CanslimPillarDetail {
  pillar: string;
  label: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'INFO';
  value: string | number | null;
  threshold: string;
  description: string;
}

export type DualScreenerTier = 'TIER_1' | 'WATCHLIST' | 'SHORT_TERM' | 'EXCLUDED';

export interface CanslimScannerResult {
  ticker: string;
  exchange: string;
  name: string;
  market: MarketCode;
  currentPrice: number | null;
  marketCap: number | null;
  currency: 'USD' | 'KRW';
  canslimResult: CanslimResult;
  basePattern: BasePattern | null;
  vcpGrade: VcpAnalysis['grade'] | null;
  vcpScore: number | null;
  dualTier: DualScreenerTier;
  rsRating: number | null;
  rsSource?: 'DB_BATCH' | 'UNIVERSE' | 'BENCHMARK_PROXY' | null;
  benchmarkRelativeScore?: number | null;
  mansfieldRsFlag: boolean | null;
  mansfieldRsScore?: number | null;
  dataSources?: Partial<Record<CanslimPillarKey, string[]>>;
  analysisCoverage?: CanslimAnalysisCoverage;
  status: ScannerStatus;
  analyzedAt: string | null;
  errorMessage: string | null;
  dataWarnings: string[];
}
