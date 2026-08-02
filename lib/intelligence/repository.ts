import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { computeDecisionReadiness } from './model.ts';
import type {
  IntelligenceEvent,
  IntelligenceEventType,
  IntelligenceFeedResponse,
  IntelligenceMarket,
  IntelligenceSeverity,
  IntelligenceSourceResult,
  StoredIntelligenceEvent,
} from './types.ts';
import {
  buildIntelligenceSourceHealth,
  requiredIntelligenceSources,
} from './health.ts';

function eventRow(event: IntelligenceEvent) {
  return {
    source: event.source,
    external_id: event.externalId,
    source_tier: event.sourceTier,
    market: event.market,
    event_type: event.eventType,
    severity: event.severity,
    direction: event.direction,
    title: event.title,
    summary: event.summary,
    source_url: event.sourceUrl,
    published_at: event.publishedAt,
    observed_at: event.observedAt,
    symbols: event.symbols,
    topics: event.topics,
    content_hash: event.contentHash,
    raw_payload: event.payload,
    analysis: event.analysis,
    last_seen_at: event.observedAt,
    updated_at: event.observedAt,
  };
}

function storedEvent(row: Record<string, unknown>): StoredIntelligenceEvent {
  return {
    id: String(row.id),
    source: String(row.source),
    externalId: String(row.external_id),
    sourceTier: row.source_tier === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
    market: row.market as IntelligenceMarket,
    eventType: row.event_type as IntelligenceEventType,
    severity: row.severity as IntelligenceSeverity,
    direction: row.direction as StoredIntelligenceEvent['direction'],
    title: String(row.title),
    summary: typeof row.summary === 'string' ? row.summary : null,
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
    publishedAt: String(row.published_at),
    observedAt: String(row.observed_at),
    symbols: Array.isArray(row.symbols) ? row.symbols.map(String) : [],
    topics: Array.isArray(row.topics) ? row.topics.map(String) : [],
    contentHash: String(row.content_hash),
    payload: row.raw_payload && typeof row.raw_payload === 'object'
      ? row.raw_payload as Record<string, unknown>
      : {},
    analysis: row.analysis as StoredIntelligenceEvent['analysis'],
    isRevision: row.is_revision === true,
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
  };
}

function currentEventProjection(events: StoredIntelligenceEvent[], limit: number) {
  const current = new Map<string, StoredIntelligenceEvent>();
  for (const event of events) {
    const key = `${event.source}\u001f${event.externalId}`;
    const existing = current.get(key);
    if (!existing || event.firstSeenAt > existing.firstSeenAt) current.set(key, event);
  }
  return [...current.values()]
    .sort((left, right) => {
      const leftAt = left.isRevision ? left.firstSeenAt : left.publishedAt;
      const rightAt = right.isRevision ? right.firstSeenAt : right.publishedAt;
      return rightAt.localeCompare(leftAt);
    })
    .slice(0, limit);
}

export async function upsertIntelligenceEvents(
  events: IntelligenceEvent[],
  client: SupabaseClient = getSupabaseAdmin(),
) {
  if (events.length === 0) return [];
  const { data, error } = await client
    .from('market_intelligence_events')
    .upsert(events.map(eventRow), {
      onConflict: 'source,external_id,content_hash',
      ignoreDuplicates: true,
    })
    .select('id,source,external_id');
  if (error) throw error;
  return data || [];
}

export async function upsertIntelligenceSourceHealth(
  results: IntelligenceSourceResult[],
  mode: 'feeds' | 'indicators' | 'all',
  attemptedAt = new Date().toISOString(),
  client: SupabaseClient = getSupabaseAdmin(),
) {
  if (results.length === 0) return;
  const { error } = await client
    .from('market_intelligence_source_health')
    .upsert(results.map((result) => ({
      source: result.source,
      mode,
      status: result.status,
      event_count: result.eventCount,
      last_attempt_at: attemptedAt,
      last_success_at: result.status === 'SUCCESS' ? attemptedAt : null,
      last_error: result.error || null,
      updated_at: attemptedAt,
    })), { onConflict: 'source' });
  if (error) throw error;
}

export async function readIntelligenceFeed(input: {
  market?: IntelligenceMarket;
  eventType?: IntelligenceEventType;
  severity?: IntelligenceSeverity;
  symbol?: string;
  since?: string;
  limit?: number;
  now?: Date;
  client?: SupabaseClient;
} = {}): Promise<IntelligenceFeedResponse> {
  const client = input.client ?? getSupabaseAdmin();
  const limit = Math.max(1, Math.min(200, input.limit ?? 80));
  const now = input.now ?? new Date();
  const since = input.since || new Date(now.getTime() - 7 * 86_400_000).toISOString();

  let query = client
    .from('market_intelligence_events')
    .select('*')
    .or(`published_at.gte.${since},first_seen_at.gte.${since}`)
    .order('published_at', { ascending: false })
    .limit(Math.min(500, limit * 4));
  if (input.market && input.market !== 'GLOBAL') query = query.in('market', [input.market, 'GLOBAL']);
  if (input.market === 'GLOBAL') query = query.eq('market', 'GLOBAL');
  if (input.eventType) query = query.eq('event_type', input.eventType);
  if (input.severity) query = query.eq('severity', input.severity);
  if (input.symbol) query = query.contains('symbols', [input.symbol.toUpperCase()]);

  const [eventsResult, healthResult] = await Promise.all([
    query,
    client
      .from('market_intelligence_source_health')
      .select('source,status,last_attempt_at,last_success_at,last_error')
      .in('source', requiredIntelligenceSources(input.market)),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (healthResult.error) throw healthResult.error;

  const events = currentEventProjection(
    (eventsResult.data || []).map((row) => storedEvent(row as Record<string, unknown>)),
    limit,
  );
  const riskCutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  let riskQuery = client
    .from('market_intelligence_events')
    .select('source,external_id,severity,published_at,first_seen_at,raw_payload,is_revision')
    .in('severity', ['WATCH', 'RISK'])
    .or(`published_at.gte.${riskCutoff},first_seen_at.gte.${riskCutoff}`)
    .limit(500);
  if (input.market && input.market !== 'GLOBAL') riskQuery = riskQuery.in('market', [input.market, 'GLOBAL']);
  if (input.market === 'GLOBAL') riskQuery = riskQuery.eq('market', 'GLOBAL');
  const riskResult = await riskQuery;
  if (riskResult.error) throw riskResult.error;
  const currentRiskRows = new Map<string, NonNullable<typeof riskResult.data>[number]>();
  for (const row of riskResult.data || []) {
    const key = `${row.source}\u001f${row.external_id}`;
    const existing = currentRiskRows.get(key);
    if (!existing || String(row.first_seen_at) > String(existing.first_seen_at)) currentRiskRows.set(key, row);
  }
  const readinessEvents = [...currentRiskRows.values()].map((row) => ({
    severity: row.severity as IntelligenceSeverity,
    publishedAt: String(row.published_at),
    firstSeenAt: String(row.first_seen_at),
    isRevision: row.is_revision === true,
    payload: row.raw_payload && typeof row.raw_payload === 'object'
      ? row.raw_payload as Record<string, unknown>
      : {},
  }));
  const sourceHealth = buildIntelligenceSourceHealth(
    (healthResult.data || []) as Record<string, unknown>[],
    input.market,
    now,
  );
  const successfulTimestamps = sourceHealth
    .map((source) => source.lastSuccessfulAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  const lastSuccessfulIngestionAt = successfulTimestamps[0]?.toISOString() ?? null;

  return {
    events,
    readiness: computeDecisionReadiness({
      events: readinessEvents,
      lastSuccessfulIngestionAt,
      market: input.market,
      now,
      sourceHealth,
    }),
  };
}
