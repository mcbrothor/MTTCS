export type GoldProductCode = 'GLD' | '411060' | '132030';

export type GoldCurrency = 'USD' | 'KRW';
export type GoldMarket = 'US' | 'KR';
export type GoldHedge = 'UNHEDGED' | 'HEDGED';

export interface GoldProductDefinition {
  code: GoldProductCode;
  ticker: string;
  yahooTicker: string;
  kisExchange: string;
  currency: GoldCurrency;
  market: GoldMarket;
  name: string;
  hedge: GoldHedge;
}

export interface GoldPriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  /**
   * Provider adapters may attach the product. When present, the engine rejects
   * bars belonging to a different product instead of mixing price series.
   */
  product?: GoldProductCode;
}

export interface GoldSeriesPoint {
  date: string;
  value: number;
}

export interface GoldMonthEndClose {
  date: string;
  close: number;
}

export type GoldMonthlyTrendSignal = 'ON' | 'OFF' | 'UNAVAILABLE';

export interface GoldMonthlyTrend {
  signal: GoldMonthlyTrendSignal;
  isEffective: boolean;
  signalDate: string | null;
  effectiveFrom: string | null;
  latestMonthEndClose: number | null;
  average6MonthEndClose: number | null;
  samples: readonly GoldMonthEndClose[];
}

export interface GoldTechnicalIndicators {
  asOf: string;
  close: number;
  ma20: number;
  ma50: number;
  ma100: number;
  ma200: number;
  atr14: number;
  atrPct14: number;
  prior20DayHigh: number;
  breakout20: boolean;
  monthlyTrend: GoldMonthlyTrend;
}

export interface GoldTechnicalOptions {
  /**
   * Explicit completed month-end closes are preferred. When omitted, the
   * engine derives completed months from transitions in the daily series.
   */
  completedMonthEndCloses?: readonly GoldMonthEndClose[];
}

export type GoldMacroComponentScore = -1 | 0 | 1;

export interface GoldMacroInput {
  realYield20DayChangeBp: number | null;
  broadDollar20DayChangePct: number | null;
  goldEtfNetFlow: number | null;
  realYieldAsOf?: string | null;
  broadDollarAsOf?: string | null;
  etfReferenceMonth?: string | null;
}

export interface GoldMacroSeriesInput {
  asOf: string;
  realYield: readonly GoldSeriesPoint[];
  broadDollar: readonly GoldSeriesPoint[];
  goldEtfNetFlow: number | null;
  etfReferenceMonth?: string | null;
}

export interface GoldMacroScore {
  complete: boolean;
  score: number | null;
  partialScore: number;
  tacticalLimitPct: 0 | 0.03 | 0.06;
  weeklyCutoff: string | null;
  components: {
    realYield: GoldMacroComponentScore | null;
    broadDollar: GoldMacroComponentScore | null;
    goldEtfFlow: GoldMacroComponentScore | null;
  };
  inputs: GoldMacroInput;
  missing: readonly ('REAL_YIELD' | 'BROAD_DOLLAR' | 'GOLD_ETF_FLOW')[];
}

export type GoldDataQualityStatus = 'OK' | 'DEGRADED' | 'BLOCKED';

export interface GoldDataQuality {
  status: GoldDataQualityStatus;
  priceComplete: boolean;
  macroComplete: boolean;
  reasons: readonly string[];
}

export interface GoldDataQualityInput {
  product: GoldProductCode;
  bars: readonly GoldPriceBar[];
  macro: GoldMacroScore;
  asOf: string;
  maxPriceAgeDays?: number;
}

export interface GoldCoreReviewInput {
  realYieldMonthlyChangesBp: readonly number[];
  broadDollarMonthlyChangesPct: readonly number[];
  etfDemandWeakening: boolean | null;
  centralBankDemandWeakening: boolean | null;
}

export interface GoldCoreReview {
  status: 'OK' | 'REVIEW' | 'INSUFFICIENT';
  shouldReview: boolean;
  ratesAndDollarRisingTwoMonths: boolean;
  demandWeakening: boolean;
  reasons: readonly string[];
}

export interface GoldSettings {
  baseCurrency: GoldCurrency;
  coreProduct: GoldProductCode;
  tacticalProduct: GoldProductCode;
  accountEquity: number;
  existingGoldValue: number;
  existingCoreValue: number;
  existingTacticalValue: number;
  externalPhysicalGoldValue: number;
  riskPaused: boolean;
  leverageEnabled: false;
}

export interface GoldPositionInput {
  accountEquity: number;
  entryPrice: number;
  atr14: number;
  tacticalTargetPct: number;
  existingGoldValue?: number;
  existingTacticalValue?: number;
  unitPriceInBaseCurrency?: number;
  highestCloseSinceEntry?: number | null;
  riskPct?: number;
}

export interface GoldPositionPlan {
  entryPrice: number;
  stopPrice: number;
  trailingStopPrice: number;
  stopDistancePct: number;
  riskBudget: number;
  unconstrainedNotional: number;
  cappedNotional: number;
  units: number;
  actualNotional: number;
  actualRisk: number;
  bindingLimit: 'RISK' | 'TACTICAL_CAP' | 'TOTAL_GOLD_CAP' | 'NONE';
}

export type GoldStrategyDecision =
  | 'BLOCKED'
  | 'RISK_PAUSED'
  | 'CORE_REVIEW'
  | 'TREND_ENTRY'
  | 'FAST_REENTRY'
  | 'CORE_ONLY'
  | 'WAIT';

export interface GoldStrategyInput {
  product: GoldProductCode;
  bars: readonly GoldPriceBar[];
  macro: GoldMacroInput | GoldMacroScore;
  asOf: string;
  accountEquity: number;
  baseCurrency?: GoldCurrency;
  fxRateToBase?: number | null;
  existingGoldValue?: number;
  existingCoreValue?: number;
  existingTacticalValue?: number;
  externalPhysicalGoldValue?: number;
  riskPaused?: boolean;
  highestCloseSinceEntry?: number | null;
  completedMonthEndCloses?: readonly GoldMonthEndClose[];
  coreReview?: GoldCoreReviewInput | null;
  maxPriceAgeDays?: number;
}

export interface GoldStrategyResult {
  modelVersion: string;
  modelStatus: 'RESEARCH_ONLY';
  product: GoldProductCode;
  asOf: string;
  decision: GoldStrategyDecision;
  technical: GoldTechnicalIndicators | null;
  macro: GoldMacroScore;
  quality: GoldDataQuality;
  coreReview: GoldCoreReview;
  allocation: {
    maxGoldPct: 0.1;
    coreTargetPct: 0.04;
    tacticalMaxPct: 0.06;
    tacticalTargetPct: 0 | 0.03 | 0.06;
    totalTargetPct: 0.04 | 0.07 | 0.1;
    coreTargetValue: number;
    tacticalTargetValue: number;
    totalTargetValue: number;
    existingGoldValue: number;
    targetGapValue: number;
  };
  position: GoldPositionPlan | null;
  reasons: readonly string[];
}

export type GoldBacktestMode = 'BUY_AND_HOLD' | 'SIX_MONTH_TREND' | 'CORE_TACTICAL';

export interface GoldBacktestInput {
  bars: readonly GoldPriceBar[];
  mode: GoldBacktestMode;
  transactionCostPct?: number;
  annualRiskFreeRate?: number;
}

export interface GoldBacktestPoint {
  date: string;
  equity: number;
  exposure: number;
  monthlySignal: Exclude<GoldMonthlyTrendSignal, 'UNAVAILABLE'> | null;
}

export interface GoldBacktestResult {
  mode: GoldBacktestMode;
  startDate: string;
  endDate: string;
  observations: number;
  cagrPct: number;
  annualVolatilityPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  averageExposurePct: number;
  transactionCostPct: number;
  curve: readonly GoldBacktestPoint[];
}
