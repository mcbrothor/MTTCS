import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecommendationCategory, RecommendationHorizon, RecommendationMarket } from './types';

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface FrequentRecommendationPickInput {
  ticker: string;
  name: string | null;
  rank: number;
  runDate: string;
}

export interface RecommendationContributionInput {
  ticker: string;
  name: string | null;
  returnPct: number | string | null;
  excessReturnPct: number | string | null;
}

export function summarizeTickerContributions(
  rows: RecommendationContributionInput[],
  limitPerDirection = 5,
) {
  const grouped = new Map<string, RecommendationContributionInput[]>();
  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!ticker || numberOrNull(row.excessReturnPct) === null) continue;
    grouped.set(ticker, [...(grouped.get(ticker) || []), { ...row, ticker }]);
  }

  const contributions = [...grouped.entries()].map(([ticker, tickerRows]) => {
    const excessReturns = tickerRows
      .map((row) => numberOrNull(row.excessReturnPct))
      .filter((value): value is number => value !== null);
    const returns = tickerRows
      .map((row) => numberOrNull(row.returnPct))
      .filter((value): value is number => value !== null);
    const excessSum = excessReturns.reduce((sum, value) => sum + value, 0);
    return {
      ticker,
      name: tickerRows.find((row) => row.name?.trim())?.name?.trim() || null,
      evaluationCount: excessReturns.length,
      averageReturnPct: returns.length
        ? round(returns.reduce((sum, value) => sum + value, 0) / returns.length)
        : null,
      averageExcessReturnPct: round(excessSum / excessReturns.length),
      contributionPctPoints: rows.length ? round(excessSum / rows.length) : 0,
    };
  });

  const limit = Math.max(1, limitPerDirection);
  const positive = contributions
    .filter((row) => row.contributionPctPoints > 0)
    .sort((left, right) => right.contributionPctPoints - left.contributionPctPoints)
    .slice(0, limit);
  const negative = contributions
    .filter((row) => row.contributionPctPoints < 0)
    .sort((left, right) => left.contributionPctPoints - right.contributionPctPoints)
    .slice(0, limit);
  return [...positive, ...negative];
}

export function summarizeFrequentRecommendationPicks(rows: FrequentRecommendationPickInput[], limit = 5) {
  const grouped = new Map<string, FrequentRecommendationPickInput[]>();
  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!ticker) continue;
    grouped.set(ticker, [...(grouped.get(ticker) || []), { ...row, ticker }]);
  }

  return [...grouped.entries()]
    .map(([ticker, picks]) => ({
      ticker,
      name: [...picks].sort((a, b) => b.runDate.localeCompare(a.runDate)).find((pick) => pick.name)?.name || null,
      recommendationCount: picks.length,
      averageRank: round(picks.reduce((sum, pick) => sum + Number(pick.rank), 0) / picks.length, 1),
      latestRunDate: picks.map((pick) => pick.runDate).sort().at(-1) as string,
    }))
    .sort((a, b) => b.recommendationCount - a.recommendationCount
      || a.averageRank - b.averageRank
      || b.latestRunDate.localeCompare(a.latestRunDate)
      || a.ticker.localeCompare(b.ticker))
    .slice(0, Math.max(0, limit));
}

export async function readFrequentRecommendationPicks(input: {
  client: SupabaseClient;
  market: RecommendationMarket;
  category?: RecommendationCategory | null;
  asOf?: string;
  days?: number;
  limit?: number;
}) {
  const days = Math.max(1, Math.min(90, input.days || 14));
  const to = input.asOf || new Date().toISOString().slice(0, 10);
  const fromDate = new Date(`${to}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  const from = fromDate.toISOString().slice(0, 10);
  let query = input.client
    .from('recommendation_picks')
    .select('ticker, name, rank, recommendation_publications!inner(run_date, market, category, is_official, status)')
    .eq('recommendation_publications.market', input.market)
    .eq('recommendation_publications.is_official', true)
    .eq('recommendation_publications.status', 'PUBLISHED')
    .gte('recommendation_publications.run_date', from)
    .lte('recommendation_publications.run_date', to)
    .limit(1000);
  if (input.category) query = query.eq('recommendation_publications.category', input.category);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map((row) => {
    const publication = row.recommendation_publications as unknown as { run_date: string };
    return { ticker: row.ticker, name: row.name, rank: row.rank, runDate: publication.run_date };
  });
  return { from, to, picks: summarizeFrequentRecommendationPicks(rows, input.limit || 5) };
}

interface PerformanceReadRow {
  id: string;
  horizon: RecommendationHorizon;
  status: string;
  return_pct: number | string | null;
  benchmark_return_pct: number | string | null;
  excess_return_pct: number | string | null;
  mfe_pct: number | string | null;
  mae_pct: number | string | null;
  quality_status: string;
  evaluation_date: string | null;
  recommendation_picks: {
    id: string;
    ticker: string;
    name: string | null;
    source: string;
    rank: number;
    confidence: number | string;
    universe: string;
    candidate_snapshot: Record<string, unknown>;
    recommendation_publications: { id: string; run_date: string; market: RecommendationMarket; category: RecommendationCategory | null; engine_version: string; is_official: boolean };
  };
}

export async function readRecommendationPublications(input: {
  client: SupabaseClient;
  market: RecommendationMarket;
  category?: RecommendationCategory | null;
  from?: string | null;
  to?: string | null;
  cursor?: string | null;
  limit?: number;
}) {
  let query = input.client
    .from('recommendation_publications')
    .select('id, run_date, market, category, version, status, generated_at, first_tradable_date, entry_status, engine_version, llm_provider, llm_model, market_context, telegram_status, telegram_sent_at, recommendation_picks(id, rank, ticker, exchange, name, universe, source, score, grade, confidence, reason, risk, sector, benchmark_symbol, signal_price, signal_price_as_of, recommendation_performance(horizon, status, session_count, entry_date, entry_price, evaluation_date, evaluation_price, return_pct, benchmark_return_pct, excess_return_pct, mfe_pct, mae_pct, quality_status, error_message))')
    .eq('market', input.market)
    .eq('is_official', true)
    .eq('status', 'PUBLISHED')
    .order('run_date', { ascending: false })
    .limit(Math.max(1, Math.min(100, input.limit || 20)));
  if (input.category) query = query.eq('category', input.category);
  if (input.from) query = query.gte('run_date', input.from);
  if (input.to) query = query.lte('run_date', input.to);
  if (input.cursor) query = query.lt('run_date', input.cursor);
  const { data, error } = await query;
  if (error) throw error;
  const publications = (data || []).map((publication) => ({
    ...publication,
    recommendation_picks: [...(publication.recommendation_picks || [])].sort((a, b) => a.rank - b.rank),
  }));
  return {
    publications,
    nextCursor: publications.length === (input.limit || 20) ? publications.at(-1)?.run_date || null : null,
  };
}

async function readPerformanceRows(input: {
  client: SupabaseClient;
  market: RecommendationMarket;
  category?: RecommendationCategory | null;
  from?: string | null;
  to?: string | null;
  evaluationFrom?: string | null;
  evaluationTo?: string | null;
  horizon?: RecommendationHorizon | null;
  official?: boolean;
  engineVersion?: string | null;
}) {
  const pageSize = 1000;
  const rows: PerformanceReadRow[] = [];

  for (let fromIndex = 0; ; fromIndex += pageSize) {
    let query = input.client
      .from('recommendation_performance')
      .select('id, horizon, status, return_pct, benchmark_return_pct, excess_return_pct, mfe_pct, mae_pct, quality_status, evaluation_date, recommendation_picks!inner(id, ticker, name, source, rank, confidence, universe, candidate_snapshot, recommendation_publications!inner(id, run_date, market, category, engine_version, is_official))')
      .eq('status', 'MATURED')
      .in('quality_status', ['FULL', 'FALLBACK'])
      .eq('recommendation_picks.recommendation_publications.market', input.market)
      .order('evaluation_date', { ascending: true })
      .order('id', { ascending: true });
    if (input.category) query = query.eq('recommendation_picks.recommendation_publications.category', input.category);
    if (input.official !== undefined) query = query.eq('recommendation_picks.recommendation_publications.is_official', input.official);
    if (input.engineVersion) query = query.eq('recommendation_picks.recommendation_publications.engine_version', input.engineVersion);
    if (input.horizon) query = query.eq('horizon', input.horizon);
    if (input.from) query = query.gte('recommendation_picks.recommendation_publications.run_date', input.from);
    if (input.to) query = query.lte('recommendation_picks.recommendation_publications.run_date', input.to);
    if (input.evaluationFrom) query = query.gte('evaluation_date', input.evaluationFrom);
    if (input.evaluationTo) query = query.lte('evaluation_date', input.evaluationTo);

    const { data, error } = await query.range(fromIndex, fromIndex + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as unknown as PerformanceReadRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function summarize(rows: PerformanceReadRow[]) {
  const returns = rows.map((row) => numberOrNull(row.return_pct)).filter((value): value is number => value !== null);
  const excess = rows.map((row) => numberOrNull(row.excess_return_pct)).filter((value): value is number => value !== null);
  const mfe = rows.map((row) => numberOrNull(row.mfe_pct)).filter((value): value is number => value !== null);
  const mae = rows.map((row) => numberOrNull(row.mae_pct)).filter((value): value is number => value !== null);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const lowerDecileCount = Math.max(1, Math.ceil(returns.length * 0.1));
  const lowerDecile = [...returns].sort((a, b) => a - b).slice(0, lowerDecileCount);
  const flowCovered = rows.filter((row) => {
    const flow = row.recommendation_picks.candidate_snapshot?.investor_flow as { quality?: unknown } | undefined;
    return flow?.quality === 'FULL' || flow?.quality === 'STALE';
  }).length;
  return {
    sampleSize: rows.length,
    positiveHitRate: rows.length ? round((returns.filter((value) => value > 0).length / rows.length) * 100) : null,
    benchmarkWinRate: rows.length ? round((excess.filter((value) => value > 0).length / rows.length) * 100) : null,
    averageReturnPct: returns.length ? round(sum(returns) / returns.length) : null,
    medianReturnPct: returns.length ? round(median(returns) as number) : null,
    averageExcessReturnPct: excess.length ? round(sum(excess) / excess.length) : null,
    averageMfePct: mfe.length ? round(sum(mfe) / mfe.length) : null,
    averageMaePct: mae.length ? round(sum(mae) / mae.length) : null,
    lowerDecileReturnPct: lowerDecile.length ? round(sum(lowerDecile) / lowerDecile.length) : null,
    flowCoveragePct: rows.length ? round((flowCovered / rows.length) * 100) : null,
  };
}

export async function readRecommendationMetrics(input: {
  client: SupabaseClient;
  market: RecommendationMarket;
  category?: RecommendationCategory | null;
  from?: string | null;
  to?: string | null;
  evaluationFrom?: string | null;
  evaluationTo?: string | null;
  horizon?: RecommendationHorizon | null;
  official?: boolean;
  engineVersion?: string | null;
}) {
  const rows = await readPerformanceRows({ ...input, official: input.official ?? (input.engineVersion ? undefined : true) });
  const horizons = (['D5', 'D20', 'D60'] as RecommendationHorizon[]).map((horizon) => {
    const horizonRows = rows.filter((row) => row.horizon === horizon);
    return {
      horizon,
      ...summarize(horizonRows),
      contributors: summarizeTickerContributions(horizonRows.map((row) => ({
        ticker: row.recommendation_picks.ticker,
        name: row.recommendation_picks.name,
        returnPct: row.return_pct,
        excessReturnPct: row.excess_return_pct,
      }))),
    };
  });
  const segmentMap = new Map<string, PerformanceReadRow[]>();
  for (const row of rows.filter((item) => item.horizon !== 'LIVE')) {
    const key = `${row.horizon}:${row.recommendation_picks.source}`;
    segmentMap.set(key, [...(segmentMap.get(key) || []), row]);
  }
  const segments = [...segmentMap.entries()].map(([key, group]) => {
    const [horizon, source] = key.split(':');
    return { horizon, source, ...summarize(group) };
  }).sort((a, b) => a.horizon.localeCompare(b.horizon) || (a.averageExcessReturnPct ?? 0) - (b.averageExcessReturnPct ?? 0));

  const cohortMap = new Map<string, PerformanceReadRow[]>();
  for (const row of rows.filter((item) => item.horizon !== 'LIVE')) {
    const pub = row.recommendation_picks.recommendation_publications;
    const key = `${pub.run_date}:${row.horizon}`;
    cohortMap.set(key, [...(cohortMap.get(key) || []), row]);
  }
  const cohorts = [...cohortMap.entries()].map(([key, group]) => {
    const [runDate, horizon] = key.split(':');
    return { runDate, horizon, ...summarize(group) };
  }).sort((a, b) => a.runDate.localeCompare(b.runDate));
  return {
    engineVersion: input.engineVersion || null,
    horizons,
    segments,
    cohorts,
    dataAsOf: rows.map((row) => row.evaluation_date).filter(Boolean).sort().at(-1) || null,
  };
}

export async function readRecommendationDiagnostics(input: {
  client: SupabaseClient;
  market: RecommendationMarket;
  category?: RecommendationCategory | null;
  horizon?: RecommendationHorizon | null;
  cause?: string | null;
  status?: string | null;
  analyzedFrom?: string | null;
  analyzedTo?: string | null;
}) {
  let query = input.client
    .from('recommendation_diagnostic_findings')
    .select('*')
    .eq('market', input.market)
    .order('analyzed_at', { ascending: false })
    .limit(500);
  if (input.category) query = query.eq('category', input.category);
  if (input.horizon) query = query.eq('horizon', input.horizon);
  if (input.cause) query = query.eq('cause_code', input.cause);
  if (input.status) query = query.eq('finding_status', input.status);
  if (input.analyzedFrom) query = query.gte('analyzed_at', input.analyzedFrom);
  if (input.analyzedTo) query = query.lte('analyzed_at', input.analyzedTo);
  const { data, error } = await query;
  if (error) throw error;
  const latestByScope = new Map<string, (typeof data)[number]>();
  for (const row of data || []) {
    const key = `${row.category || input.category || input.market}:${row.horizon}:${row.scope_type}:${row.scope_key}:${row.cause_code}`;
    if (!latestByScope.has(key)) latestByScope.set(key, row);
  }
  const findings = [...latestByScope.values()];
  const causeSummary = new Map<string, { causeCode: string; count: number; critical: number; confirmed: number }>();
  for (const finding of findings) {
    const summary = causeSummary.get(finding.cause_code) || { causeCode: finding.cause_code, count: 0, critical: 0, confirmed: 0 };
    summary.count += 1;
    if (finding.severity === 'CRITICAL') summary.critical += 1;
    if (finding.finding_status === 'CONFIRMED') summary.confirmed += 1;
    causeSummary.set(finding.cause_code, summary);
  }
  return { findings, causeSummary: [...causeSummary.values()].sort((a, b) => b.critical - a.critical || b.count - a.count) };
}
