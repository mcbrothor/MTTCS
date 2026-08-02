import type { DataSourceMeta } from '../../types/index.ts';

export const DATA_SLA_SECONDS = {
  REALTIME: 5 * 60,
  DELAYED_15M: 25 * 60,
  EOD: 36 * 60 * 60,
  UNKNOWN: 0,
} as const;

export function evaluateFreshness(observedAt: string | null | undefined, expectedDelaySeconds: number, now = new Date()) {
  if (!observedAt) return { isStale: true, staleReason: '원천 데이터 관측 시각이 없습니다.', ageSeconds: null };
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return { isStale: true, staleReason: '원천 데이터 관측 시각 형식이 잘못되었습니다.', ageSeconds: null };
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - observed.getTime()) / 1000));
  return {
    isStale: expectedDelaySeconds <= 0 || ageSeconds > expectedDelaySeconds,
    staleReason: expectedDelaySeconds <= 0
      ? '데이터 SLA가 정의되지 않았습니다.'
      : ageSeconds > expectedDelaySeconds
        ? `원천 데이터가 SLA ${expectedDelaySeconds}초를 초과했습니다.`
        : null,
    ageSeconds,
  };
}

export function buildFreshnessMeta(input: Partial<DataSourceMeta> & Pick<DataSourceMeta, 'source' | 'provider' | 'delay'>): DataSourceMeta {
  const calculatedAt = input.calculatedAt || new Date().toISOString();
  const observedAt = input.observedAt || input.asOf || undefined;
  const expectedDelaySeconds = input.expectedDelaySeconds ?? DATA_SLA_SECONDS[input.delay];
  const freshness = evaluateFreshness(observedAt, expectedDelaySeconds, new Date(calculatedAt));
  return {
    // `asOf` remains populated for backwards-compatible response rendering, but it
    // is never promoted to an observed source timestamp when the source omitted one.
    asOf: observedAt || calculatedAt,
    source: input.source,
    provider: input.provider,
    delay: input.delay,
    fallbackUsed: Boolean(input.fallbackUsed),
    warnings: input.warnings || [],
    observedAt,
    fetchedAt: input.fetchedAt || calculatedAt,
    calculatedAt,
    expectedDelaySeconds,
    isStale: freshness.isStale || Boolean(input.isStale),
    staleReason: freshness.staleReason ?? input.staleReason ?? null,
    fallbackReason: input.fallbackReason ?? null,
    modelVersion: input.modelVersion,
  };
}
