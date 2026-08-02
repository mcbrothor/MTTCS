import type {
  IntelligenceMarket,
  IntelligenceSourceHealth,
} from './types.ts';

export const INTELLIGENCE_SOURCE_SLA_SECONDS: Record<string, number> = {
  FED_MONETARY: 45 * 60,
  BOK_MONETARY: 45 * 60,
  SEC_TRADING_SUSPENSIONS: 45 * 60,
  BLS: 26 * 60 * 60,
};

export function requiredIntelligenceSources(market?: IntelligenceMarket) {
  if (market === 'US') return ['FED_MONETARY', 'SEC_TRADING_SUSPENSIONS', 'BLS'];
  if (market === 'KR') return ['BOK_MONETARY'];
  return Object.keys(INTELLIGENCE_SOURCE_SLA_SECONDS);
}

export function buildIntelligenceSourceHealth(
  rows: Record<string, unknown>[],
  market: IntelligenceMarket | undefined,
  now: Date,
): IntelligenceSourceHealth[] {
  return requiredIntelligenceSources(market).map((source) => {
    const row = rows.find((candidate) => candidate.source === source);
    const lastAttemptAt = typeof row?.last_attempt_at === 'string' ? row.last_attempt_at : null;
    const lastSuccessfulAt = typeof row?.last_success_at === 'string' ? row.last_success_at : null;
    const successfulTime = lastSuccessfulAt ? new Date(lastSuccessfulAt).getTime() : Number.NaN;
    const ageSeconds = Number.isFinite(successfulTime)
      ? Math.max(0, Math.floor((now.getTime() - successfulTime) / 1000))
      : null;
    const staleAfterSeconds = INTELLIGENCE_SOURCE_SLA_SECONDS[source];
    const latestStatus = row?.status;
    const status: IntelligenceSourceHealth['status'] = !row
      ? 'MISSING'
      : latestStatus !== 'SUCCESS'
        ? 'FAILED'
        : ageSeconds === null || ageSeconds > staleAfterSeconds
          ? 'STALE'
          : 'FRESH';

    return {
      source,
      status,
      lastAttemptAt,
      lastSuccessfulAt,
      ageSeconds,
      staleAfterSeconds,
      error: typeof row?.last_error === 'string' ? row.last_error : null,
    };
  });
}
