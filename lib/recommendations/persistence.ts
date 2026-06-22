import type { SupabaseClient } from '@supabase/supabase-js';
import { BENCHMARK_BY_UNIVERSE, RECOMMENDATION_ENGINE_VERSION } from './config';
import type { DailyMarketTop10Result, DailyScreenerCandidate } from '@/lib/daily-screeners';

interface PersistRecommendationInput {
  client: SupabaseClient;
  runId: string;
  runDate: string;
  generatedAt: string;
  provider: string;
  model: string;
  result: DailyMarketTop10Result;
  candidates: DailyScreenerCandidate[];
  telegramSentAt?: string | null;
  marketContext?: Record<string, unknown>;
  marketContextByMarket?: Partial<Record<'US' | 'KR', Record<string, unknown>>>;
  markets?: ('US' | 'KR')[];
  candidateSnapshotByTicker?: Record<string, Record<string, unknown>>;
}

export function initialTelegramDelivery(sentAt?: string | null) {
  return sentAt
    ? { telegram_status: 'SENT' as const, telegram_sent_at: sentAt }
    : { telegram_status: 'PENDING' as const, telegram_sent_at: null };
}

function validateMarketRows(result: DailyMarketTop10Result, market: 'US' | 'KR') {
  const rows = result.markets[market];
  if (!Array.isArray(rows) || rows.length !== 10) throw new Error(`${market} recommendation publication requires exactly 10 picks.`);
  if (new Set(rows.map((row) => row.ticker)).size !== 10) throw new Error(`${market} recommendation publication contains duplicate tickers.`);
  if (new Set(rows.map((row) => row.rank)).size !== 10) throw new Error(`${market} recommendation publication contains duplicate ranks.`);
  return rows;
}

export function pickCandidateSnapshot(
  pick: DailyMarketTop10Result['markets']['US'][number],
  candidates: DailyScreenerCandidate[],
  extra?: Record<string, unknown>,
) {
  const matching = candidates.filter((candidate) => candidate.ticker.toUpperCase() === pick.ticker.toUpperCase());
  const preferred = matching.find((candidate) => candidate.universe === pick.universe) || matching[0];
  if (!preferred) throw new Error(`Candidate snapshot missing for ${pick.ticker}.`);
  const sector = typeof preferred.metrics.sector === 'string'
    ? preferred.metrics.sector
    : typeof preferred.raw.sector === 'string' ? preferred.raw.sector : null;
  return {
    preferred,
    sector,
    snapshot: {
      selected_source: pick.source,
      source_candidates: matching.map((candidate) => ({
        source: candidate.source,
        universe: candidate.universe,
        exchange: candidate.exchange,
        score: candidate.score,
        grade: candidate.grade,
        reason: candidate.reason,
        price: candidate.price,
        price_as_of: candidate.priceAsOf,
        raw_metrics: candidate.metrics,
        raw: candidate.raw,
      })),
      ...extra,
    },
  };
}

export async function persistRecommendationPolicy(input: PersistRecommendationInput & {
  market: 'US' | 'KR';
  engineVersion: string;
  isOfficial: boolean;
}) {
  const market = input.market;
  const picks = validateMarketRows(input.result, market);
  const { data: existing, error: existingError } = await input.client
    .from('recommendation_publications')
    .select('id, version, is_official')
    .eq('run_date', input.runDate)
    .eq('market', market)
    .eq('engine_version', input.engineVersion)
    .maybeSingle();
  if (existingError) throw existingError;

  let publication;
  if (existing) {
    if (existing.is_official !== input.isOfficial) {
      throw new Error(`Publication policy ${input.engineVersion} cannot change official status.`);
    }
    const { error: deleteError } = await input.client.from('recommendation_picks').delete().eq('publication_id', existing.id);
    if (deleteError) throw deleteError;
    const { data, error } = await input.client.from('recommendation_publications').update({
      status: 'DRAFT',
      generated_at: input.generatedAt,
      prompt_version: 'daily-market-top10-2026.06-v2.1',
      llm_provider: input.provider,
      llm_model: input.model,
      ...initialTelegramDelivery(input.telegramSentAt),
      market_context: input.marketContextByMarket?.[market] || input.marketContext || {},
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    publication = data;
  } else {
    const { data: versions, error: versionsError } = await input.client
      .from('recommendation_publications')
      .select('version')
      .eq('run_date', input.runDate)
      .eq('market', market)
      .order('version', { ascending: false })
      .limit(1);
    if (versionsError) throw versionsError;
    const version = Number(versions?.[0]?.version || 0) + 1;
    const { data, error } = await input.client.from('recommendation_publications').insert({
      screener_run_id: input.runId,
      run_date: input.runDate,
      market,
      version,
      is_official: input.isOfficial,
      status: 'DRAFT',
      generated_at: input.generatedAt,
      engine_version: input.engineVersion,
      prompt_version: 'daily-market-top10-2026.06-v2.1',
      llm_provider: input.provider,
      llm_model: input.model,
      ...initialTelegramDelivery(input.telegramSentAt),
      market_context: input.marketContextByMarket?.[market] || input.marketContext || {},
    }).select('*').single();
    if (error) throw error;
    publication = data;
  }

  try {
    const rows = picks.map((pick) => {
      const candidate = pickCandidateSnapshot(
        pick,
        input.candidates,
        input.candidateSnapshotByTicker?.[pick.ticker],
      );
      return {
        publication_id: publication.id,
        rank: pick.rank,
        ticker: pick.ticker,
        exchange: candidate.preferred.exchange,
        name: pick.name,
        universe: pick.universe,
        source: pick.source,
        score: pick.score,
        grade: pick.grade,
        confidence: pick.confidence,
        reason: pick.reason,
        risk: pick.risk || null,
        sector: candidate.sector,
        benchmark_symbol: BENCHMARK_BY_UNIVERSE[pick.universe],
        signal_price: candidate.preferred.price,
        signal_price_as_of: candidate.preferred.priceAsOf,
        candidate_snapshot: candidate.snapshot,
      };
    });
    const { error: picksError } = await input.client.from('recommendation_picks').insert(rows);
    if (picksError) throw picksError;
    const status = input.isOfficial ? 'PUBLISHED' : 'SHADOW';
    const { error: statusError } = await input.client
      .from('recommendation_publications')
      .update({ status, telegram_status: input.isOfficial ? publication.telegram_status : 'SKIPPED', updated_at: new Date().toISOString() })
      .eq('id', publication.id);
    if (statusError) throw statusError;
    return { ...publication, status, picks: rows };
  } catch (error) {
    await input.client.from('recommendation_publications').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', publication.id);
    throw error;
  }
}

export async function persistRecommendationPublications(input: PersistRecommendationInput) {
  const publications = [];
  for (const market of input.markets || (['US', 'KR'] as const)) {
    publications.push(await persistRecommendationPolicy({
      ...input,
      market,
      engineVersion: RECOMMENDATION_ENGINE_VERSION,
      isOfficial: true,
    }));
  }
  return publications;
}

export async function markRecommendationTelegramStatus(
  client: SupabaseClient,
  publicationId: string,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  sentAt: string | null = null
) {
  const { error } = await client
    .from('recommendation_publications')
    .update({ telegram_status: status, telegram_sent_at: sentAt, updated_at: new Date().toISOString() })
    .eq('id', publicationId);
  if (error) throw error;
}
