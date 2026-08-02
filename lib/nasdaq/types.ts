export type NasdaqProductCode = 'QQQ' | 'QLD' | 'TQQQ';
export type NasdaqTacticalProduct = 'QLD' | 'TQQQ';
export type NasdaqCurrency = 'USD' | 'KRW';
export type NasdaqSeriesKind = 'EXECUTION' | 'ADJUSTED';
export type NasdaqQualityStatus = 'VALID' | 'DEGRADED' | 'BLOCKED';

export interface NasdaqProductDefinition {
  code: NasdaqProductCode;
  name: string;
  leverage: 1 | 2 | 3;
  currency: 'USD';
  yahooTicker: NasdaqProductCode;
  kisExchange: 'NAS';
  grossExpenseRatioPct: number;
  netExpenseRatioPct: number;
  feeAsOf: string;
  feeReviewAfter: string;
  sourceUrl: string;
}

export interface NasdaqPriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  product: NasdaqProductCode;
  series: NasdaqSeriesKind;
}

export interface NasdaqMonthEndTrend {
  signal: 'ON' | 'OFF' | 'UNAVAILABLE';
  signalDate: string | null;
  effectiveFrom: string | null;
  isEffective: boolean;
  latestClose: number | null;
  average10MonthClose: number | null;
}

export interface NasdaqRegime {
  asOf: string;
  close: number;
  ma50: number;
  ma200: number;
  aboveMa200TwoCloses: boolean;
  goldenCross: boolean;
  prior20DayHigh: number;
  breakout20: boolean;
  realizedVolatility20Pct: number;
  volatilityScale: number;
  monthlyTrend: NasdaqMonthEndTrend;
  fastDeRisk: boolean;
}

export interface NasdaqExecutionTechnical {
  product: NasdaqProductCode;
  asOf: string;
  close: number;
  ma20: number;
  ma50: number;
  ma200: number;
  atr14: number;
  atrPct14: number;
  prior20DayHigh: number;
  breakout20: boolean;
}

export interface NasdaqDataQuality {
  status: NasdaqQualityStatus;
  reasons: string[];
  qqqAdjustedBars: number;
  executionBars: number;
  asOf: string | null;
}

export interface NasdaqSettings {
  baseCurrency: NasdaqCurrency;
  tacticalProduct: NasdaqTacticalProduct;
  manualAccountValue: number | null;
  accountEquity: number;
  externalNasdaqValue: number;
  existingQqqValue: number;
  existingQldValue: number;
  existingTqqqValue: number;
  tqqqOptIn: boolean;
  riskPaused: boolean;
}

export type NasdaqDecision =
  | 'DATA_BLOCKED'
  | 'RISK_PAUSED'
  | 'DELEVERAGE'
  | 'TRIM_EXPOSURE'
  | 'TQQQ_READY'
  | 'QLD_READY'
  | 'QQQ_ACCUMULATE'
  | 'QQQ_HOLD'
  | 'DEFENSIVE';

export interface NasdaqPositionPlan {
  product: NasdaqTacticalProduct;
  entryPrice: number;
  stopPrice: number;
  trailingStopPrice: number;
  stopDistancePct: number;
  riskBudget: number;
  unconstrainedNotional: number;
  cappedNotional: number;
  units: number;
  actualNotional: number;
  bindingLimit: 'RISK' | 'CAPITAL_CAP' | 'EFFECTIVE_EXPOSURE_CAP' | 'PAUSED';
}

export interface NasdaqStrategyInput {
  asOf: string;
  qqqAdjustedBars: readonly NasdaqPriceBar[];
  tacticalExecutionBars: readonly NasdaqPriceBar[];
  settings: NasdaqSettings;
  usdKrw?: number | null;
  highestTacticalClose?: number | null;
  stoppedOrExitedToday?: boolean;
  feeMetadataFresh?: boolean;
  maxPriceAgeDays?: number;
}

export interface NasdaqStrategyResult {
  modelVersion: string;
  modelStatus: 'RESEARCH_ONLY';
  asOf: string;
  decision: NasdaqDecision;
  regime: NasdaqRegime | null;
  execution: NasdaqExecutionTechnical | null;
  quality: NasdaqDataQuality;
  settings: NasdaqSettings;
  allocation: {
    maxCapitalPct: number;
    maxEffectiveExposurePct: number;
    qqqCoreTargetPct: number;
    tacticalCapitalTargetPct: number;
    tacticalEffectiveTargetPct: number;
    totalCapitalTargetPct: number;
    totalEffectiveTargetPct: number;
    existingCapitalValue: number;
    existingEffectiveExposureValue: number;
    capitalTargetValue: number;
    effectiveTargetValue: number;
    targetGapValue: number;
  };
  position: NasdaqPositionPlan | null;
  actions: {
    now: string;
    avoid: string;
    nextCondition: string;
  };
  reasons: string[];
}

export type NasdaqBacktestMode =
  | 'QQQ_BUY_HOLD'
  | 'QLD_BUY_HOLD'
  | 'TQQQ_BUY_HOLD'
  | 'QQQ_TEN_MONTH'
  | 'QQQ_QLD_RULES'
  | 'QQQ_TQQQ_RULES';

export interface NasdaqBacktestPoint {
  date: string;
  equity: number;
  capitalExposure: number;
  effectiveExposure: number;
}

export interface NasdaqBacktestResult {
  mode: NasdaqBacktestMode;
  startDate: string;
  endDate: string;
  observations: number;
  cagrPct: number;
  annualVolatilityPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  turnoverPct: number;
  averageEffectiveExposurePct: number;
  maxEffectiveExposurePct: number;
  curve: NasdaqBacktestPoint[];
}
