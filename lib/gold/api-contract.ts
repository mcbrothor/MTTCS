import type { DataSourceMeta, OHLCData } from '@/types';

export const GOLD_PRODUCT_CODES = ['GLD', '411060', '132030'] as const;
export type GoldProductCode = (typeof GOLD_PRODUCT_CODES)[number];
export type GoldBaseCurrency = 'KRW' | 'USD';
export type GoldDataQualityStatus = 'VALID' | 'DEGRADED' | 'BLOCKED';

export interface GoldProductDefinition {
  code: GoldProductCode;
  name: string;
  market: 'US' | 'KR';
  currency: 'USD' | 'KRW';
  yahooTicker: string;
  kisExchange: 'AMS' | 'KOSPI';
  currencyExposure: 'USD_EXPOSED' | 'KRW_UNHEDGED' | 'KRW_HEDGED';
  roleHint: string;
}

export const GOLD_PRODUCT_DEFINITIONS: Record<GoldProductCode, GoldProductDefinition> = {
  GLD: {
    code: 'GLD',
    name: 'SPDR Gold Shares',
    market: 'US',
    currency: 'USD',
    yahooTicker: 'GLD',
    kisExchange: 'AMS',
    currencyExposure: 'USD_EXPOSED',
    roleHint: '달러 환노출이 필요한 장기 코어 또는 미국장 전술 상품',
  },
  '411060': {
    code: '411060',
    name: 'ACE KRX금현물',
    market: 'KR',
    currency: 'KRW',
    yahooTicker: '411060.KS',
    kisExchange: 'KOSPI',
    currencyExposure: 'KRW_UNHEDGED',
    roleHint: '원화 계좌에서 금과 USD/KRW 변동을 함께 반영하는 코어 상품',
  },
  '132030': {
    code: '132030',
    name: 'KODEX 골드선물(H)',
    market: 'KR',
    currency: 'KRW',
    yahooTicker: '132030.KS',
    kisExchange: 'KOSPI',
    currencyExposure: 'KRW_HEDGED',
    roleHint: '환율 영향을 줄이고 금 선물 가격 추세를 따르는 전술 상품',
  },
};

export interface GoldExecutionLevels {
  support: number | null;
  resistance: number | null;
  target: number | null;
  updatedAt: string | null;
}

export interface GoldSettingsView {
  coreProduct: GoldProductCode;
  tacticalProduct: GoldProductCode;
  baseCurrency: GoldBaseCurrency;
  manualAccountValue: number | null;
  externalGoldValue: number;
  physicalGoldValue: number;
  executionLevels: Partial<Record<GoldProductCode, GoldExecutionLevels>>;
  riskPaused: boolean;
  updatedAt: string | null;
}

export interface GoldTechnicalView {
  close: number | null;
  ma20: number | null;
  ma50: number | null;
  ma100: number | null;
  ma200: number | null;
  atr14: number | null;
  atrPct: number | null;
  previous20DayHigh: number | null;
  sixMonthEndAverage: number | null;
  latestMonthEndClose: number | null;
  monthEndTrend: 'ON' | 'OFF' | 'UNKNOWN';
  monthEndSignalEffectiveDate: string | null;
  fastBreakout: boolean;
  asOf: string | null;
}

export interface GoldQualityView {
  status: GoldDataQualityStatus;
  reasons: string[];
  priceBars: number;
  priceAsOf: string | null;
  macroComplete: boolean;
  wgcPeriod: string | null;
  wgcAgeDays: number | null;
}

export interface GoldProductAnalysisView {
  product: GoldProductDefinition;
  technical: GoldTechnicalView;
  executionLevels: GoldExecutionLevels;
  executionLevelsRequired: boolean;
  quality: GoldQualityView;
  provider: string;
  fallbackUsed: boolean;
}

export interface GoldMacroComponentView {
  key: 'REAL_YIELD' | 'BROAD_DOLLAR' | 'ETF_FLOW';
  label: string;
  score: -1 | 0 | 1 | null;
  value: number | null;
  change: number | null;
  unit: '%' | 'bp' | 'INDEX' | 'USD_BILLION' | 'TONNES';
  changeUnit: 'bp' | '%' | 'TONNES';
  asOf: string | null;
  interpretation: string;
}

export interface GoldMacroView {
  score: number | null;
  complete: boolean;
  frozenAsOf: string | null;
  components: GoldMacroComponentView[];
  tacticalCapPct: number;
  reason: string;
}

export interface GoldAllocationView {
  accountValue: number;
  portfolioAccountValue: number;
  accountValueSource: 'MANUAL' | 'PORTFOLIO';
  existingPortfolioGoldValue: number;
  externalGoldValue: number;
  physicalGoldValue: number;
  totalExistingGoldValue: number;
  currentExposurePct: number;
  coreTargetPct: number;
  tacticalTargetPct: number;
  totalTargetPct: number;
  coreTargetAmount: number;
  tacticalTargetAmount: number;
  totalTargetAmount: number;
  differenceAmount: number;
  remainingGoldCapacityAmount: number;
  status: 'UNDER' | 'ON_TARGET' | 'OVER';
}

export interface GoldExecutionStepView {
  sequence: number;
  action: 'BUY' | 'SELL';
  sleeve: 'CORE' | 'TACTICAL' | 'REDUCE';
  product: GoldProductCode;
  amount: number;
  units: number;
  percentOfPlan: number;
  condition: string;
  status: 'READY' | 'WAIT';
}

export interface GoldCoreTrancheView {
  sequence: 1 | 2 | 3;
  amount: number;
  condition: string;
  ready: boolean;
}

export interface GoldTacticalPlanView {
  allowed: boolean;
  entryPrice: number | null;
  initialStop: number | null;
  trailingStop: number | null;
  stopDistancePct: number | null;
  targetPrice: number | null;
  suggestedAmount: number;
  suggestedUnits: number;
  riskBudgetAmount: number;
  limitingFactor: 'RISK' | 'TACTICAL_CAP' | 'TOTAL_GOLD_CAP' | 'DATA' | 'PAUSED' | 'NONE';
  reasons: string[];
}

export interface GoldDecisionView {
  code: 'BLOCKED' | 'CORE_REVIEW' | 'CORE_ACCUMULATE' | 'WAIT' | 'TACTICAL_ENTRY' | 'PAUSED';
  label: string;
  summary: string;
  coreAction: string;
  tacticalAction: string;
}

export interface GoldBacktestVerificationView {
  status: 'VERIFIED';
  product: 'GLD';
  startDate: '2016-07-25';
  endDate: '2026-07-24';
  observations: 2514;
  transactionCostPct: 0.1;
  verifiedAt: string;
  assumptions: string[];
  strategies: Array<{
    mode: 'BUY_AND_HOLD' | 'SIX_MONTH_TREND' | 'CORE_TACTICAL';
    label: string;
    cagrPct: number;
    annualVolatilityPct: number;
    maxDrawdownPct: number;
    sharpe: number;
    averageExposurePct: number;
  }>;
}

export interface GoldStrategyResponse {
  modelVersion: 'gold-core-tactical-2026.07-v1';
  releaseStatus: 'RESEARCH_ONLY';
  asOf: string;
  policy: {
    maxGoldPct: 10;
    corePct: 4;
    maxTacticalPct: 6;
    riskPerTradePct: 0.5;
    shortRiskPct: 0.25;
    leverageEnabled: false;
  };
  settings: GoldSettingsView;
  decision: GoldDecisionView;
  allocation: GoldAllocationView;
  products: {
    core: GoldProductAnalysisView;
    tactical: GoldProductAnalysisView;
  };
  macro: GoldMacroView;
  corePlan: {
    targetAmount: number;
    reviewRequired: boolean;
    reviewReasons: string[];
    tranches: GoldCoreTrancheView[];
  };
  tacticalPlan: GoldTacticalPlanView;
  executionPlan: {
    buySteps: GoldExecutionStepView[];
    sellSteps: GoldExecutionStepView[];
    buyAmount: number;
    sellAmount: number;
  };
  advancedShort: {
    visible: true;
    executable: false;
    riskPct: 0.25;
    condition: string;
    stop: string;
    targets: string[];
  };
  backtest: GoldBacktestVerificationView;
  quality: GoldQualityView;
  referenceScenario: {
    instrument: 'XAU/USD';
    asOf: '2026-07-24';
    expiresAt: '2026-07-30T23:59:59Z';
    active: false;
    support: [3950, 4000];
    resistance: [4165, 4185];
    upsideScenario: 4500;
    note: string;
  };
  sources: Array<{
    label: string;
    provider: string;
    url: string | null;
    asOf: string | null;
  }>;
}

export interface GoldHistoryResponse {
  product: GoldProductDefinition;
  bars: OHLCData[];
  quality: GoldQualityView;
  provider: string;
  fallbackUsed: boolean;
}

export interface GoldSnapshotView {
  id: string;
  strategyDate: string;
  coreProduct: GoldProductCode;
  tacticalProduct: GoldProductCode;
  decision: GoldDecisionView;
  macroScore: number | null;
  targetCorePct: number;
  targetTacticalPct: number;
  dataQuality: GoldDataQualityStatus;
  modelVersion: string;
  inputHash: string;
  createdAt: string;
}

export interface GoldSnapshotsResponse {
  items: GoldSnapshotView[];
}

export interface GoldMacroObservationInput {
  period: string;
  etfFlowUsdBillion: number;
  holdingsChangeTonnes: number;
  sourceUrl: string;
  approvedAt?: string;
  centralBankDemandWeakening?: boolean;
  note?: string;
}

export interface GoldMacroObservationView extends GoldMacroObservationInput {
  id: string;
  approvedBy: string;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoldApiEnvelope<T> {
  data: T;
  meta: DataSourceMeta;
}
