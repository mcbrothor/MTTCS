import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateRecommendationPerformance, buildDiagnosticFindings } from './core';
import { RECOMMENDATION_ANALYZER_VERSION } from './config';
import { fetchRecommendationBenchmarkBars, fetchRecommendationSecurityBars, recommendationPriceRows } from './prices';
import type { DiagnosticInput, RecommendationCategory, RecommendationHorizon, RecommendationMarket } from './types';

interface PickRow {
  id: string;
  publication_id: string;
  ticker: string;
  exchange: string;
  source: string;
  sector: string | null;
  rank: number;
  confidence: number;
  benchmark_symbol: string;
  signal_price: number | null;
  recommendation_publications: {
    run_date: string;
    market: RecommendationMarket;
    category: RecommendationCategory | null;
    generated_at: string;
  };
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  return Math.abs(result);
}

async function loadActivePicks(client: SupabaseClient, market: RecommendationMarket) {
  const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows: PickRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from('recommendation_picks')
      .select('id, publication_id, ticker, exchange, source, sector, rank, confidence, benchmark_symbol, signal_price, recommendation_publications!inner(run_date, market, category, generated_at, status)')
      .eq('recommendation_publications.market', market)
      .in('recommendation_publications.status', ['PUBLISHED', 'SHADOW'])
      .gte('recommendation_publications.run_date', cutoff)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as unknown as PickRow[]));
    if ((data || []).length < 1000) break;
  }
  return rows;
}

async function upsertPriceSeries(client: SupabaseClient, rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client
      .from('recommendation_market_prices')
      .upsert(rows.slice(index, index + 500), { onConflict: 'market,instrument,trade_date' });
    if (error) throw error;
  }
}

export async function runRecommendationPerformanceBatch(input: {
  client: SupabaseClient;
  market: RecommendationMarket;
  shard?: number;
  shards?: number;
}) {
  const shards = Math.max(1, Math.min(16, input.shards || 1));
  const shard = Math.max(0, Math.min(shards - 1, input.shard || 0));
  const allPicks = await loadActivePicks(input.client, input.market);
  const picks = allPicks.filter((pick) => hash(`${pick.exchange}:${pick.ticker}`) % shards === shard);
  const bySecurity = new Map<string, PickRow[]>();
  for (const pick of picks) {
    const key = `${pick.exchange}:${pick.ticker}`;
    bySecurity.set(key, [...(bySecurity.get(key) || []), pick]);
  }
  const benchmarkCache = new Map<string, Awaited<ReturnType<typeof fetchRecommendationBenchmarkBars>>>();
  let updated = 0;
  const errors: { ticker: string; message: string }[] = [];

  for (const securityPicks of bySecurity.values()) {
    const first = securityPicks[0];
    try {
      const security = await fetchRecommendationSecurityBars({ ticker: first.ticker, exchange: first.exchange, market: input.market, targetBars: 160 });
      await upsertPriceSeries(input.client, recommendationPriceRows(input.market, security, 'SECURITY'));
      for (const pick of securityPicks) {
        let benchmark = benchmarkCache.get(pick.benchmark_symbol);
        if (!benchmark) {
          benchmark = await fetchRecommendationBenchmarkBars(pick.benchmark_symbol);
          benchmarkCache.set(pick.benchmark_symbol, benchmark);
          await upsertPriceSeries(input.client, recommendationPriceRows(input.market, benchmark, 'BENCHMARK'));
        }
        for (const horizon of ['LIVE', 'D5', 'D20', 'D60'] as RecommendationHorizon[]) {
          const result = calculateRecommendationPerformance({
            generatedAt: pick.recommendation_publications.generated_at,
            market: input.market,
            horizon,
            bars: security.bars,
            benchmarkBars: benchmark.bars,
          });
          const { error } = await input.client.from('recommendation_performance').upsert({
            pick_id: pick.id,
            horizon,
            status: result.status,
            session_count: result.sessionCount,
            entry_date: result.entryDate,
            entry_price: result.entryPrice,
            evaluation_date: result.evaluationDate,
            evaluation_price: result.evaluationPrice,
            benchmark_entry_price: result.benchmarkEntryPrice,
            benchmark_evaluation_price: result.benchmarkEvaluationPrice,
            return_pct: result.returnPct,
            benchmark_return_pct: result.benchmarkReturnPct,
            excess_return_pct: result.excessReturnPct,
            mfe_pct: result.mfePct,
            mae_pct: result.maePct,
            quality_status: result.qualityStatus,
            error_message: result.errorMessage,
            calculated_at: new Date().toISOString(),
          }, { onConflict: 'pick_id,horizon' });
          if (error) throw error;
          if (result.entryDate) {
            await input.client.from('recommendation_publications').update({
              first_tradable_date: result.entryDate,
              entry_status: result.status === 'ERROR' ? 'ERROR' : 'READY',
              updated_at: new Date().toISOString(),
            }).eq('id', pick.publication_id);
          }
          updated += 1;
        }
      }
    } catch (error) {
      errors.push({ ticker: first.ticker, message: error instanceof Error ? error.message : 'Unknown price refresh failure' });
    }
  }

  const findingCount = shard === shards - 1
    ? await refreshRecommendationDiagnostics(input.client, input.market)
    : 0;

  await input.client.from('data_pipeline_runs').insert({
    pipeline: 'recommendation-performance',
    provider: 'KIS/Yahoo',
    market: input.market,
    status: errors.length ? 'DEGRADED' : 'SUCCESS',
    observed_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    fallback_used: errors.length > 0,
    fallback_reason: errors.length ? `${errors.length} securities failed` : null,
    metadata: { shard, shards, picks: picks.length, securities: bySecurity.size, performance_rows: updated, findings: findingCount, errors },
  });

  return { market: input.market, shard, shards, picks: picks.length, securities: bySecurity.size, updated, findings: findingCount, errors };
}

export async function refreshRecommendationDiagnostics(client: SupabaseClient, market: RecommendationMarket) {
  const { data, error } = await client
    .from('recommendation_performance')
    .select('horizon, status, return_pct, benchmark_return_pct, excess_return_pct, mfe_pct, mae_pct, quality_status, entry_price, recommendation_picks!inner(id, publication_id, source, sector, rank, confidence, signal_price, recommendation_publications!inner(run_date, market, category, is_official))')
    .eq('recommendation_picks.recommendation_publications.market', market)
    .eq('recommendation_picks.recommendation_publications.is_official', true)
    .limit(10000);
  if (error) throw error;

  const diagnosticRows: DiagnosticInput[] = (data || []).map((row) => {
    const pick = row.recommendation_picks as unknown as {
      id: string;
      publication_id: string;
      source: string;
      sector: string | null;
      rank: number;
      confidence: number;
      signal_price: number | null;
      recommendation_publications: { run_date: string; category: RecommendationCategory | null };
    };
    const entryPrice = Number(row.entry_price);
    const signalPrice = Number(pick.signal_price);
    return {
      pickId: pick.id,
      publicationId: pick.publication_id,
      market,
      category: pick.recommendation_publications.category ?? null,
      horizon: row.horizon as RecommendationHorizon,
      source: pick.source,
      sector: pick.sector,
      rank: pick.rank,
      confidence: Number(pick.confidence),
      entryGapPct: signalPrice > 0 && entryPrice > 0 ? Number((((entryPrice / signalPrice) - 1) * 100).toFixed(2)) : null,
      returnPct: row.return_pct === null ? null : Number(row.return_pct),
      benchmarkReturnPct: row.benchmark_return_pct === null ? null : Number(row.benchmark_return_pct),
      excessReturnPct: row.excess_return_pct === null ? null : Number(row.excess_return_pct),
      mfePct: row.mfe_pct === null ? null : Number(row.mfe_pct),
      maePct: row.mae_pct === null ? null : Number(row.mae_pct),
      qualityStatus: row.quality_status as DiagnosticInput['qualityStatus'],
      performanceStatus: row.status as DiagnosticInput['performanceStatus'],
      runDate: pick.recommendation_publications.run_date,
    };
  });
  const findings = buildDiagnosticFindings(diagnosticRows);
  const { error: deleteError } = await client
    .from('recommendation_diagnostic_findings')
    .delete()
    .eq('market', market)
    .eq('analyzer_version', RECOMMENDATION_ANALYZER_VERSION);
  if (deleteError) throw deleteError;
  if (findings.length === 0) return 0;

  const batchId = randomUUID();
  const rows = findings.map((finding) => ({
    analysis_batch_id: batchId,
    analyzer_version: RECOMMENDATION_ANALYZER_VERSION,
    market: finding.market,
    category: finding.category ?? null,
    horizon: finding.horizon,
    publication_id: finding.publicationId,
    pick_id: finding.pickId,
    scope_type: finding.scopeType,
    scope_key: finding.scopeKey,
    cause_code: finding.causeCode,
    finding_status: finding.findingStatus,
    severity: finding.severity,
    confidence: finding.confidence,
    sample_size: finding.sampleSize,
    summary_ko: finding.summaryKo,
    evidence: finding.evidence,
    affected_pick_ids: finding.affectedPickIds,
    analyzed_at: new Date().toISOString(),
  }));
  const { error: insertError } = await client.from('recommendation_diagnostic_findings').insert(rows);
  if (insertError) throw insertError;
  return rows.length;
}
