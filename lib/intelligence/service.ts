import { recordPipelineRun } from '@/lib/data/pipeline-health';
import { getErrorMessage } from '@/lib/api/response';
import { dedupeEvents } from './model.ts';
import {
  upsertIntelligenceEvents,
  upsertIntelligenceSourceHealth,
} from './repository.ts';
import { fetchBlsIndicators, fetchOfficialFeed, OFFICIAL_FEEDS } from './sources.ts';
import type { IntelligenceEvent, IntelligenceSourceResult } from './types.ts';

export type IntelligenceIngestionMode = 'feeds' | 'indicators' | 'all';

async function collectSource(
  source: string,
  operation: () => Promise<IntelligenceEvent[]>,
  minimumEvents = 1,
): Promise<{ result: IntelligenceSourceResult; events: IntelligenceEvent[] }> {
  try {
    const events = await operation();
    if (events.length < minimumEvents) {
      throw new Error(`${source} returned ${events.length} events; expected at least ${minimumEvents}`);
    }
    return { result: { source, status: 'SUCCESS', eventCount: events.length }, events };
  } catch (error) {
    return {
      result: {
        source,
        status: 'FAILED',
        eventCount: 0,
        error: getErrorMessage(error).slice(0, 500),
      },
      events: [],
    };
  }
}

export async function runMarketIntelligenceIngestion(input: {
  mode?: IntelligenceIngestionMode;
  dryRun?: boolean;
} = {}) {
  const mode = input.mode ?? 'all';
  const tasks: Promise<{ result: IntelligenceSourceResult; events: IntelligenceEvent[] }>[] = [];
  if (mode === 'feeds' || mode === 'all') {
    tasks.push(...OFFICIAL_FEEDS.map((source) => collectSource(source.key, () => fetchOfficialFeed(source))));
  }
  if (mode === 'indicators' || mode === 'all') {
    tasks.push(collectSource('BLS', fetchBlsIndicators, 4));
  }

  const collected = await Promise.all(tasks);
  let sourceResults = collected.map((item) => item.result);
  const events = dedupeEvents(collected.flatMap((item) => item.events));
  const succeeded = sourceResults.filter((result) => result.status === 'SUCCESS').length;
  const failed = sourceResults.length - succeeded;
  let status: 'SUCCESS' | 'DEGRADED' | 'FAILED' = succeeded === 0
    ? 'FAILED'
    : failed > 0
      ? 'DEGRADED'
      : 'SUCCESS';
  let persisted = 0;
  let persistenceError: string | null = null;

  if (!input.dryRun && succeeded > 0) {
    try {
      const rows = await upsertIntelligenceEvents(events);
      persisted = rows.length;
    } catch (error) {
      persistenceError = getErrorMessage(error).slice(0, 500);
      status = 'FAILED';
      sourceResults = sourceResults.map((result) => ({
        ...result,
        status: 'FAILED',
        error: `event persistence failed: ${persistenceError}`,
      }));
    }
  }

  if (!input.dryRun) {
    await upsertIntelligenceSourceHealth(sourceResults, mode);
    await recordPipelineRun({
      pipeline: 'market-intelligence',
      provider: sourceResults.map((result) => result.source).join('+') || 'none',
      status,
      observedAt: events.map((event) => event.observedAt).sort().at(-1) || null,
      fallbackUsed: failed > 0,
      fallbackReason: failed > 0 ? `${failed}/${sourceResults.length} sources failed` : null,
      errorMessage: status === 'FAILED'
        ? (persistenceError || sourceResults.map((result) => result.error).filter(Boolean).join(' | ')).slice(0, 1000)
        : null,
      metadata: {
        mode,
        fetched: events.length,
        persisted,
        sources: sourceResults,
        persistenceError,
      },
      throwOnError: true,
    });
  }

  return {
    mode,
    dryRun: Boolean(input.dryRun),
    status,
    fetched: events.length,
    persisted,
    sourceResults,
    sample: input.dryRun ? events.slice(0, 10) : undefined,
  };
}
