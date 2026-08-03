import type { RecommendationCategory, RecommendationMarket } from './types';

export const RECOMMENDATION_ANALYZER_VERSION = 'recommendation-diagnostics-2026.06-v1';
export const RECOMMENDATION_ENGINE_VERSION = 'daily-top10-active-allocation-v2';
export const RECOMMENDATION_PROMPT_VERSION = 'daily-category-top10-2026.07-v1';
export const RECOMMENDATION_ASSURANCE_CONTRACT_SCHEMA_VERSION = 'mtn-recommendation-assurance-contract-v1';
export const KR_RISK_ENGINE_VERSION = 'kr-risk-ranked-v3';
export const KR_RISK_FLOW_ENGINE_VERSION = 'kr-risk-flow-v3';
export const KR_RECOMMENDATION_POLICY = process.env.KR_RECOMMENDATION_POLICY || RECOMMENDATION_ENGINE_VERSION;

export const RECOMMENDATION_CATEGORIES: RecommendationCategory[] = ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'];

export const RECOMMENDATION_CATEGORY_MARKET = {
  NASDAQ100: 'US',
  SP500: 'US',
  KOSPI200: 'KR',
  KOSDAQ150: 'KR',
} satisfies Record<RecommendationCategory, RecommendationMarket>;

export const RECOMMENDATION_CATEGORY_LABEL = {
  NASDAQ100: '나스닥',
  SP500: 'S&P500',
  KOSPI200: '코스피',
  KOSDAQ150: '코스닥',
} satisfies Record<RecommendationCategory, string>;

export const BENCHMARK_BY_UNIVERSE = {
  NASDAQ100: '^NDX',
  SP500: '^GSPC',
  KOSPI200: '^KS200',
  KOSDAQ150: '^KQ150',
} as const;

export const BENCHMARK_FALLBACKS: Record<(typeof BENCHMARK_BY_UNIVERSE)[keyof typeof BENCHMARK_BY_UNIVERSE], string> = {
  '^NDX': 'QQQ',
  '^GSPC': 'SPY',
  '^KS200': '069500.KS',
  '^KQ150': '229200.KS',
};

export const MARKET_SESSION = {
  US: { timeZone: 'America/New_York', openMinutes: 9 * 60 + 30 },
  KR: { timeZone: 'Asia/Seoul', openMinutes: 9 * 60 },
} satisfies Record<RecommendationMarket, { timeZone: string; openMinutes: number }>;

export const HORIZON_SESSIONS = { LIVE: null, D5: 5, D20: 20, D60: 60 } as const;
