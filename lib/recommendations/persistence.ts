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

function pickCandidateSnapshot(pick: DailyMarketTop10Result['markets']['US'][number], candidates: DailyScreenerCandidate[]) {
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
    },
  };
}

export async function persistRecommendationPublications(input: PersistRecommendationInput) {
  const publications = [];
  for (const market of ['US', 'KR'] as const) {
    const picks = validateMarketRows(input.result, market);
    const { data: existing, error: existingError } = await input.client
      .from('recommendation_publications')
      .select('id, version, is_official')
      .eq('run_date', input.runDate)
      .eq('market', market)
      .order('version', { ascending: false });
    if (existingError) throw existingError;

    const officialExists = (existing || []).some((row) => row.is_official);
    const version = Number(existing?.[0]?.version || 0) + 1;
    const isOfficial = !officialExists;
    const { data: publication, error: publicationError } = await input.client
      .from('recommendation_publications')
      .insert({
        screener_run_id: input.runId,
        run_date: input.runDate,
        market,
        version,
        is_official: isOfficial,
        status: 'DRAFT',
        generated_at: input.generatedAt,
        engine_version: RECOMMENDATION_ENGINE_VERSION,
        prompt_version: 'daily-market-top10-2026.06-v1',
        llm_provider: input.provider,
        llm_model: input.model,
        ...initialTelegramDelivery(input.telegramSentAt),
        market_context: input.marketContextByMarket?.[market] || input.marketContext || {},
      })
      .select('*')
      .single();
    if (publicationError) throw publicationError;

    try {
      const rows = picks.map((pick) => {
        const candidate = pickCandidateSnapshot(pick, input.candidates);
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
      const status = isOfficial ? 'PUBLISHED' : 'SHADOW';
      const { error: statusError } = await input.client
        .from('recommendation_publications')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', publication.id);
      if (statusError) throw statusError;
      publications.push({ ...publication, status, picks: rows });
    } catch (error) {
      await input.client
        .from('recommendation_publications')
        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', publication.id);
      throw error;
    }
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
