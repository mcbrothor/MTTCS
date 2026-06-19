import type { RecommendationMarket } from './types';

export const RECOMMENDATION_ANALYZER_VERSION = 'recommendation-diagnostics-2026.06-v1';
export const RECOMMENDATION_ENGINE_VERSION = 'daily-top10-2026.06-v1';

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
