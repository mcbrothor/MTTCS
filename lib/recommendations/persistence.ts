import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BENCHMARK_BY_UNIVERSE,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_CATEGORY_MARKET,
  RECOMMENDATION_ENGINE_VERSION,
} from './config';
import type { RecommendationCategory } from './types';
import type { DailyCategoryTop10Result, DailyScreenerCandidate } from '@/lib/daily-screeners';

interface PersistRecommendationInput {
  client: SupabaseClient;
  runId: string;
  runDate: string;
  generatedAt: string;
  provider: string;
  model: string;
  result: DailyCategoryTop10Result;
  candidates: DailyScreenerCandidate[];
  telegramSentAt?: string | null;
  marketContext?: Record<string, unknown>;
  marketContextByMarket?: Partial<Record<'US' | 'KR', Record<string, unknown>>>;
  marketContextByCategory?: Partial<Record<RecommendationCategory, Record<string, unknown>>>;
  categories?: RecommendationCategory[];
  candidateSnapshotByTicker?: Record<string, Record<string, unknown>>;
}

export function initialTelegramDelivery(sentAt?: string | null) {
  return sentAt
    ? { telegram_status: 'SENT' as const, telegram_sent_at: sentAt }
    : { telegram_status: 'PENDING' as const, telegram_sent_at: null };
}

export function preservedTelegramDelivery(existingStatus?: string | null, existingSentAt?: string | null) {
  return existingStatus === 'SENT' && existingSentAt
    ? { telegram_status: 'SENT' as const, telegram_sent_at: existingSentAt }
    : initialTelegramDelivery(null);
}

export function shouldPreserveSentPublication(isOfficial: boolean, telegramStatus?: string | null) {
  return isOfficial && telegramStatus === 'SENT';
}

export function shouldPreservePublishedPublication(
  isOfficial: boolean,
  publicationStatus?: string | null,
) {
  return isOfficial ? publicationStatus === 'PUBLISHED' : publicationStatus === 'SHADOW';
}

export function canPromoteShadowPublication(
  existingOfficial: boolean,
  requestedOfficial: boolean,
  publicationStatus?: string | null,
) {
  return !existingOfficial && requestedOfficial && publicationStatus === 'SHADOW';
}

export function canReplaceIncompleteOfficial(publicationStatus?: string | null) {
  return publicationStatus === 'DRAFT' || publicationStatus === 'FAILED';
}

function validateCategoryRows(result: DailyCategoryTop10Result, category: RecommendationCategory) {
  const rows = result.categories[category];
  if (!Array.isArray(rows) || rows.length !== 10) throw new Error(`${category} recommendation publication requires exactly 10 picks.`);
  if (new Set(rows.map((row) => row.ticker)).size !== 10) throw new Error(`${category} recommendation publication contains duplicate tickers.`);
  if (new Set(rows.map((row) => row.rank)).size !== 10) throw new Error(`${category} recommendation publication contains duplicate ranks.`);
  return rows;
}

function cleanSecurityName(name: string | null | undefined, ticker: string) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase() === ticker.trim().toUpperCase() ? null : trimmed;
}

export function pickCandidateSnapshot(
  pick: DailyCategoryTop10Result['categories']['NASDAQ100'][number],
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
        name: candidate.name,
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
  category: RecommendationCategory;
  engineVersion: string;
  isOfficial: boolean;
}) {
  const category = input.category;
  const market = RECOMMENDATION_CATEGORY_MARKET[category];
  const picks = validateCategoryRows(input.result, category);
  const marketContext = input.marketContextByCategory?.[category]
    || input.marketContextByMarket?.[market]
    || input.marketContext
    || {};
  const { data: existing, error: existingError } = await input.client
    .from('recommendation_publications')
    .select('id, version, is_official, status, telegram_status, telegram_sent_at')
    .eq('run_date', input.runDate)
    .eq('category', category)
    .eq('engine_version', input.engineVersion)
    .maybeSingle();
  if (existingError) throw existingError;

  let publication;
  if (existing) {
    if (existing.is_official !== input.isOfficial) {
      if (canPromoteShadowPublication(existing.is_official, input.isOfficial, existing.status)) {
        const { data: categoryOfficial, error: categoryOfficialError } = await input.client
          .from('recommendation_publications')
          .select('id, engine_version, status')
          .eq('run_date', input.runDate)
          .eq('category', category)
          .eq('is_official', true)
          .maybeSingle();
        if (categoryOfficialError) throw categoryOfficialError;
        if (categoryOfficial && !canReplaceIncompleteOfficial(categoryOfficial.status)) {
          throw new Error(`Category ${category} already has official publication ${categoryOfficial.engine_version}.`);
        }
        if (categoryOfficial) {
          const { data: demoted, error: demoteError } = await input.client
            .from('recommendation_publications')
            .update({
              is_official: false,
              telegram_status: 'SKIPPED',
              telegram_sent_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', categoryOfficial.id)
            .eq('is_official', true)
            .eq('status', categoryOfficial.status)
            .select('id')
            .maybeSingle();
          if (demoteError) throw demoteError;
          if (!demoted) throw new Error(`Incomplete official publication ${categoryOfficial.id} changed during recovery.`);
        }
        const { data: promoted, error: promoteError } = await input.client
          .from('recommendation_publications')
          .update({
            is_official: true,
            status: 'PUBLISHED',
            telegram_status: 'PENDING',
            telegram_sent_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('is_official', false)
          .eq('status', 'SHADOW')
          .select('*, recommendation_picks(*)')
          .single();
        if (promoteError) throw promoteError;
        return {
          ...promoted,
          picks: [...(promoted.recommendation_picks || [])].sort((left, right) => left.rank - right.rank),
        };
      }
      throw new Error(`Publication policy ${input.engineVersion} cannot change official status.`);
    }
    if (shouldPreservePublishedPublication(existing.is_official, existing.status)) {
      const { data: preserved, error: preservedError } = await input.client
        .from('recommendation_publications')
        .select('*, recommendation_picks(*)')
        .eq('id', existing.id)
        .single();
      if (preservedError) throw preservedError;
      return {
        ...preserved,
        picks: [...(preserved.recommendation_picks || [])].sort((left, right) => left.rank - right.rank),
      };
    }
    const { error: deleteError } = await input.client.from('recommendation_picks').delete().eq('publication_id', existing.id);
    if (deleteError) throw deleteError;
    const { data, error } = await input.client.from('recommendation_publications').update({
      status: 'DRAFT',
      generated_at: input.generatedAt,
      prompt_version: 'daily-category-top10-2026.07-v1',
      llm_provider: input.provider,
      llm_model: input.model,
      ...(input.telegramSentAt
        ? initialTelegramDelivery(input.telegramSentAt)
        : preservedTelegramDelivery(existing.telegram_status, existing.telegram_sent_at)),
      market_context: marketContext,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    publication = data;
  } else {
    const { data: versions, error: versionsError } = await input.client
      .from('recommendation_publications')
      .select('version')
      .eq('run_date', input.runDate)
      .eq('category', category)
      .order('version', { ascending: false })
      .limit(1);
    if (versionsError) throw versionsError;
    const version = Number(versions?.[0]?.version || 0) + 1;
    const { data, error } = await input.client.from('recommendation_publications').insert({
      screener_run_id: input.runId,
      run_date: input.runDate,
      market,
      category,
      version,
      is_official: input.isOfficial,
      status: 'DRAFT',
      generated_at: input.generatedAt,
      engine_version: input.engineVersion,
      prompt_version: 'daily-category-top10-2026.07-v1',
      llm_provider: input.provider,
      llm_model: input.model,
      ...initialTelegramDelivery(input.telegramSentAt),
      market_context: marketContext,
    }).select('*').single();
    if (error) throw error;
    publication = data;
  }

  try {
    const rows = picks.map((pick) => {
      const candidate = pickCandidateSnapshot(
        pick,
        input.candidates,
        input.candidateSnapshotByTicker?.[`${category}:${pick.ticker}`] || input.candidateSnapshotByTicker?.[pick.ticker],
      );
      const name = cleanSecurityName(pick.name, pick.ticker)
        ?? cleanSecurityName(candidate.preferred.name, pick.ticker)
        ?? input.candidates
          .map((item) => item.ticker.toUpperCase() === pick.ticker.toUpperCase() ? cleanSecurityName(item.name, pick.ticker) : null)
          .find((item): item is string => Boolean(item))
        ?? pick.ticker;
      return {
        publication_id: publication.id,
        rank: pick.rank,
        ticker: pick.ticker,
        exchange: candidate.preferred.exchange,
        name,
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
  for (const category of input.categories || RECOMMENDATION_CATEGORIES) {
    publications.push(await persistRecommendationPolicy({
      ...input,
      category,
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
  const { data, error } = await client
    .from('recommendation_publications')
    .update({ telegram_status: status, telegram_sent_at: sentAt, updated_at: new Date().toISOString() })
    .eq('id', publicationId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Recommendation publication ${publicationId} was not updated.`);
}
