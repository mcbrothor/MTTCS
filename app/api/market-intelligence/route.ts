import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { readIntelligenceFeed } from '@/lib/intelligence/repository';
import { runMarketIntelligenceIngestion } from '@/lib/intelligence/service';
import type {
  IntelligenceEventType,
  IntelligenceMarket,
  IntelligenceSeverity,
} from '@/lib/intelligence/types';

export const dynamic = 'force-dynamic';

const MARKETS = new Set<IntelligenceMarket>(['GLOBAL', 'US', 'KR']);
const EVENT_TYPES = new Set<IntelligenceEventType>([
  'MACRO_RELEASE', 'CENTRAL_BANK', 'REGULATORY', 'FILING', 'EARNINGS', 'NEWS',
]);
const SEVERITIES = new Set<IntelligenceSeverity>(['INFO', 'WATCH', 'RISK']);
const ON_DEMAND_COOLDOWN_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;

  const params = new URL(request.url).searchParams;
  const marketValue = params.get('market')?.toUpperCase() as IntelligenceMarket | undefined;
  const eventTypeValue = params.get('eventType')?.toUpperCase() as IntelligenceEventType | undefined;
  const severityValue = params.get('severity')?.toUpperCase() as IntelligenceSeverity | undefined;
  if (marketValue && !MARKETS.has(marketValue)) return apiError('market must be GLOBAL, US, or KR.', 'INVALID_MARKET', 400);
  if (eventTypeValue && !EVENT_TYPES.has(eventTypeValue)) return apiError('Unsupported eventType.', 'INVALID_EVENT_TYPE', 400);
  if (severityValue && !SEVERITIES.has(severityValue)) return apiError('Unsupported severity.', 'INVALID_SEVERITY', 400);
  if (params.has('symbol')) {
    return apiError('Symbol filtering is not available until source-level ticker enrichment is enabled.', 'SYMBOL_FILTER_UNAVAILABLE', 422);
  }

  const sinceValue = params.get('since');
  const since = sinceValue && !Number.isNaN(new Date(sinceValue).getTime())
    ? new Date(sinceValue).toISOString()
    : undefined;
  const limit = Number(params.get('limit') || 80);

  try {
    const data = await readIntelligenceFeed({
      market: marketValue,
      eventType: eventTypeValue,
      severity: severityValue,
      since,
      limit: Number.isFinite(limit) ? limit : 80,
    });
    return apiSuccess(data, {
      source: 'market_intelligence_events',
      provider: 'Official sources + Supabase',
      delay: 'REALTIME',
      observedAt: data.readiness.lastSuccessfulIngestionAt || undefined,
      expectedDelaySeconds: 45 * 60,
      isStale: data.readiness.status === 'BLOCKED',
      staleReason: data.readiness.status === 'BLOCKED' ? data.readiness.reasons.join(' ') : null,
      modelVersion: 'market-intelligence-rules-2026.07-v1',
    });
  } catch (error) {
    return apiError(getErrorMessage(error, '시장 인텔리전스 조회 실패'), 'INTELLIGENCE_READ_FAILED', 500);
  }
}

export async function POST(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;

  try {
    const current = await readIntelligenceFeed({ limit: 1 });
    const feedSources = current.readiness.sourceHealth
      .filter((source) => source.source !== 'BLS');
    const feedAttempts = feedSources
      .map((source) => source.lastAttemptAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    const cooldownStartedAt = feedAttempts.length === feedSources.length && feedAttempts.length > 0
      ? Math.min(...feedAttempts)
      : null;
    const elapsedMs = cooldownStartedAt === null
      ? Number.POSITIVE_INFINITY
      : Date.now() - cooldownStartedAt;

    if (elapsedMs < ON_DEMAND_COOLDOWN_MS) {
      return apiSuccess({
        skipped: true,
        reason: 'COOLDOWN',
        retryAfterSeconds: Math.ceil((ON_DEMAND_COOLDOWN_MS - elapsedMs) / 1000),
      }, {
        source: 'market_intelligence_source_health',
        provider: 'Supabase',
        delay: 'REALTIME',
        observedAt: cooldownStartedAt === null ? undefined : new Date(cooldownStartedAt).toISOString(),
      });
    }

    const result = await runMarketIntelligenceIngestion({ mode: 'feeds' });
    if (result.status === 'FAILED') {
      return apiError('공식 원천 갱신에 실패했습니다.', 'INTELLIGENCE_INGESTION_FAILED', 502, result);
    }
    return apiSuccess({ skipped: false, result }, {
      source: 'Official market intelligence sources',
      provider: result.sourceResults.map((source) => source.source).join('+'),
      delay: 'REALTIME',
      observedAt: new Date().toISOString(),
      expectedDelaySeconds: 45 * 60,
      fallbackUsed: result.status === 'DEGRADED',
      fallbackReason: result.status === 'DEGRADED' ? '일부 원천 수집 실패' : null,
    });
  } catch (error) {
    return apiError(getErrorMessage(error, '공식 원천 갱신 실패'), 'INTELLIGENCE_INGESTION_FAILED', 500);
  }
}
