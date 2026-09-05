export const CLOSING_DASHBOARD_TIMEOUT_MS = 15_000;
export const CLOSING_VERSION = 'kr-closing-bet-v1.1';
export const CLOSING_MARKETS = ['KOSPI200', 'KOSDAQ150'] as const;
export const CLOSING_LABELS = { KOSPI200: '코스피', KOSDAQ150: '코스닥' } as const;
export const CLOSING_POLICY = {
  minTurnover: 50_000_000_000,
  minScore: 75,
  topN: 5,
  maxSameSector: 2,
  minDailyBars: 60,
  maxQuoteAgeSeconds: 90,
  maxMinuteAgeSeconds: 180,
  maxSpreadBps: 35,
  minCoverage: 0.95,
  maxEntryAtr: 0.25,
  maxExtensionAtr: 1.5,
  cutoff: '15:18:00',
  lastEntry: '15:28:00',
  open: '09:00:00',
  close: '15:30:00',
  exit: '09:30:00',
  costBps: 25,
  requestTimeoutMs: 12_000,
  tokenTimeoutMs: 20_000,
  queueTimeoutMs: 45_000,
  retryDelayMs: 300,
  scanConcurrency: 3,
  detailLimit: 35,
  cacheDays: 7,
} as const;
