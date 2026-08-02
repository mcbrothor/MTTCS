import type {
  NasdaqProductCode,
  NasdaqProductDefinition,
  NasdaqSettings,
} from './types';

export const NASDAQ_MODEL_VERSION = 'nasdaq-core-leverage-2026.07-v1';
export const NASDAQ_MODEL_STATUS = 'RESEARCH_ONLY' as const;
export const NASDAQ_PRODUCT_CODES = ['QQQ', 'QLD', 'TQQQ'] as const satisfies readonly NasdaqProductCode[];

export const NASDAQ_PRODUCTS: Readonly<Record<NasdaqProductCode, NasdaqProductDefinition>> = {
  QQQ: {
    code: 'QQQ',
    name: 'Invesco QQQ Trust',
    leverage: 1,
    currency: 'USD',
    yahooTicker: 'QQQ',
    kisExchange: 'NAS',
    grossExpenseRatioPct: 0.18,
    netExpenseRatioPct: 0.18,
    feeAsOf: '2026-07-27',
    feeReviewAfter: '2027-01-31',
    sourceUrl: 'https://www.invesco.com/qqq-etf/en/market-outlook/whats-new-about-qqq.html',
  },
  QLD: {
    code: 'QLD',
    name: 'ProShares Ultra QQQ',
    leverage: 2,
    currency: 'USD',
    yahooTicker: 'QLD',
    kisExchange: 'NAS',
    grossExpenseRatioPct: 0.98,
    netExpenseRatioPct: 0.95,
    feeAsOf: '2026-07-27',
    feeReviewAfter: '2027-01-31',
    sourceUrl: 'https://www.proshares.com/our-etfs/leveraged-and-inverse/qld',
  },
  TQQQ: {
    code: 'TQQQ',
    name: 'ProShares UltraPro QQQ',
    leverage: 3,
    currency: 'USD',
    yahooTicker: 'TQQQ',
    kisExchange: 'NAS',
    grossExpenseRatioPct: 0.97,
    netExpenseRatioPct: 0.82,
    feeAsOf: '2026-07-27',
    feeReviewAfter: '2026-09-30',
    sourceUrl: 'https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq',
  },
};

export const NASDAQ_POLICY = {
  maxCapitalPct: 0.2,
  maxEffectiveExposurePct: 0.3,
  qqqCoreTargetPct: 0.1,
  qldMaxCapitalPct: 0.05,
  tqqqMaxCapitalPct: 0.03333333,
  qldRiskPct: 0.0035,
  tqqqRiskPct: 0.0025,
  atrPeriod: 14,
  atrMultiple: 2,
  breakoutPeriod: 20,
  monthlyTrendPeriod: 10,
  volatilityTargetPct: 15,
  leverageBlockVolatilityPct: 30,
  tqqqMaxVolatilityPct: 18,
  deRiskVolatilityPct: 25,
  minimumPriceBars: 252,
  maxPriceAgeDays: 7,
  coreTranches: 3,
  leverageEnabled: true,
  autoOrderEnabled: false,
} as const;

export const DEFAULT_NASDAQ_SETTINGS: Readonly<NasdaqSettings> = {
  baseCurrency: 'KRW',
  tacticalProduct: 'QLD',
  manualAccountValue: null,
  accountEquity: 0,
  externalNasdaqValue: 0,
  existingQqqValue: 0,
  existingQldValue: 0,
  existingTqqqValue: 0,
  tqqqOptIn: false,
  riskPaused: false,
};
