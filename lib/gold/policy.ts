import type {
  GoldProductCode,
  GoldProductDefinition,
  GoldSettings,
} from './types.ts';

export const GOLD_MODEL_VERSION = 'gold-core-tactical-2026.07-v1';
export const GOLD_MODEL_STATUS = 'RESEARCH_ONLY' as const;

export const GOLD_PRODUCT_CODES = ['GLD', '411060', '132030'] as const satisfies readonly GoldProductCode[];

export const GOLD_PRODUCTS: Readonly<Record<GoldProductCode, GoldProductDefinition>> = {
  GLD: {
    code: 'GLD',
    ticker: 'GLD',
    yahooTicker: 'GLD',
    kisExchange: 'AMS',
    currency: 'USD',
    market: 'US',
    name: 'SPDR Gold Shares',
    hedge: 'UNHEDGED',
  },
  '411060': {
    code: '411060',
    ticker: '411060',
    yahooTicker: '411060.KS',
    kisExchange: 'KOSPI',
    currency: 'KRW',
    market: 'KR',
    name: 'ACE KRX금현물',
    hedge: 'UNHEDGED',
  },
  '132030': {
    code: '132030',
    ticker: '132030',
    yahooTicker: '132030.KS',
    kisExchange: 'KOSPI',
    currency: 'KRW',
    market: 'KR',
    name: 'KODEX 골드선물(H)',
    hedge: 'HEDGED',
  },
};

export const GOLD_POLICY = {
  maxGoldPct: 0.1,
  coreTargetPct: 0.04,
  tacticalMaxPct: 0.06,
  defaultRiskPct: 0.005,
  maxRiskPct: 0.01,
  shortRiskPct: 0.0025,
  coreTranches: 3,
  atrPeriod: 14,
  atrStopMultiple: 2,
  breakoutPeriod: 20,
  monthlyTrendPeriod: 6,
  minimumPriceBars: 200,
  maxPriceAgeDays: 7,
  maxEtfFlowAgeAfterMonthEndDays: 45,
  leverageEnabled: false,
} as const;

export const DEFAULT_GOLD_SETTINGS: Readonly<GoldSettings> = {
  baseCurrency: 'KRW',
  coreProduct: '411060',
  tacticalProduct: '132030',
  accountEquity: 0,
  existingGoldValue: 0,
  existingCoreValue: 0,
  existingTacticalValue: 0,
  externalPhysicalGoldValue: 0,
  riskPaused: false,
  leverageEnabled: false,
};

export const XAU_USD_REFERENCE_SCENARIO = {
  instrument: 'XAU/USD',
  asOf: '2026-07-24',
  expiresAt: '2026-07-30T23:59:59Z',
  support: [3_950, 4_000] as const,
  resistance: [4_165, 4_185] as const,
  upsideScenario: 4_500,
  activeSignal: false,
  note: '참고 시나리오이며 GLD 또는 국내 ETF 가격으로 환산하지 않습니다.',
} as const;
