import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDiagnosticFindings } from './core';
import { RECOMMENDATION_ANALYZER_VERSION } from './config';
import {
  buildRecommendationEvidenceManifest,
  buildRecommendationPriceEvidence,
  calculateNetRecommendationPerformance,
} from './evidence-performance';
import {
  extractRecommendationMarketRegime,
  refreshRecommendationEvidenceEvaluations,
  registerRecommendationEvidenceManifests,
} from './evidence-repository';
import {
  RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS,
  claimRecommendationPerformanceShard,
  completeRecommendationPerformanceShard,
  finalizeRecommendationPerformanceBatchIfReady,
  recommendationPerformanceUtcBatchDate,
} from './performance-barrier';
import {
  classifyRecommendationShardOutcome,
  createRecommendationPerformanceRuntime,
  isRecommendationPerformanceDeadlineError,
  RECOMMENDATION_PERFORMANCE_MIN_FINALIZATION_MS,
} from './performance-runtime';
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
  action_state: 'ACTIVE';
  recommendation_publications: {
    run_date: string;
    market: RecommendationMarket;
    category: RecommendationCategory | null;
    generated_at: string;
    engine_version: string;
    prompt_version: string | null;
    market_context: Record<string, unknown>;
    is_official: boolean;
  };
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  return Math.abs(result);
}

function deferredRecommendationPerformanceFinalization(
  payload: Record<string, unknown>,
  claimStatus: string,
) {
  const numberArray = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item)).map(Number)
    : [];
  return {
    finalized: false,
    findings: 0,
    evidence: null,
    claimed: false,
    claimStatus,
    claimToken: null,
    barrierStatus: String(payload.barrier_status || 'WAITING'),
    successfulShards: Number(payload.successful_shards || 0),
    requiredShards: Number(payload.required_shards || RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS),
    degradedShards: numberArray(payload.degraded_shards),
    missingShards: numberArray(payload.missing_shards),
  };
}

export async function loadActivePicks(
  client: SupabaseClient,
  market: RecommendationMarket,
  signal?: AbortSignal,
) {
  const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows: PickRow[] = [];
  for (let from = 0; ; from += 1000) {
    const request = client
      .from('recommendation_picks')
      .select('id, publication_id, ticker, exchange, source, sector, rank, confidence, benchmark_symbol, signal_price, action_state, recommendation_publications!inner(run_date, market, category, generated_at, engine_version, prompt_version, market_context, is_official, status)')
      .eq('action_state', 'ACTIVE')
      .eq('recommendation_publications.market', market)
      .in('recommendation_publications.status', ['PUBLISHED', 'SHADOW'])
      .gte('recommendation_publications.run_date', cutoff)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) throw error;
    rows.push(...((data || []) as unknown as PickRow[]));
    if ((data || []).length < 1000) break;
  }
  return rows;
}

async function upsertPriceSeries(
  client: SupabaseClient,
  rows: Record<string, unknown>[],
  signal?: AbortSignal,
) {
  for (let index = 0; index < rows.length; index += 500) {
    const request = client
      .from('recommendation_market_prices')
      .upsert(rows.slice(index, index + 500), { onConflict: 'market,instrument,trade_date' });
    const { error } = await (signal ? request.abortSignal(signal) : request);
    if (error) throw error;
  }
}

export async function runRecommendationPerformanceBatch(input: {
  client: SupabaseClient;
  market: RecommendationMarket;
  shard?: number;
  shards?: number;
  batchDate?: string;
}) {
  const shards = input.shards ?? RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS;
  const shard = input.shard ?? 0;
  const batchDate = input.batchDate || recommendationPerformanceUtcBatchDate();
  if (shards !== RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS) {
    throw new Error(`Recommendation performance requires exactly ${RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS} shards.`);
  }
  if (!Number.isInteger(shard) || shard < 0 || shard >= shards) {
    throw new Error(`Recommendation performance shard must be between 0 and ${shards - 1}.`);
  }

  const runtime = createRecommendationPerformanceRuntime();
  let shardClaim: Awaited<ReturnType<typeof claimRecommendationPerformanceShard>>;
  try {
    shardClaim = await claimRecommendationPerformanceShard({
      client: input.client,
      batchDate,
      market: input.market,
      shard,
      signal: runtime.signal,
    });
  } catch (error) {
    runtime.dispose();
    throw error;
  }
  if (!shardClaim.claimed) {
    try {
      const finalization = await finalizeRecommendationPerformanceBatchIfReady({
        client: input.client,
        batchDate,
        market: input.market,
        signal: runtime.signal,
        refreshDiagnostics: () => refreshRecommendationDiagnostics(input.client, input.market, runtime.signal),
        refreshEvidence: () => refreshRecommendationEvidenceEvaluations(input.client, input.market, runtime.signal),
      });
      return {
        market: input.market,
        batchDate,
        shard,
        shards,
        skipped: true,
        skipReason: shardClaim.claimStatus,
        barrier: finalization,
        picks: 0,
        securities: 0,
        updated: 0,
        evidenceRows: 0,
        evidence: finalization.evidence,
        findings: finalization.findings,
        errors: [],
      };
    } finally {
      runtime.dispose();
    }
  }
  if (!shardClaim.claimToken) {
    runtime.dispose();
    throw new Error('Recommendation performance shard claim did not return a token.');
  }

  let shardCompletionRecorded = false;
  let recordedShardStatus: 'SUCCESS' | 'DEGRADED' | 'FAILED' | null = null;
  let pipelineRunRecorded = false;
  let barrierStatus = shardClaim.barrierStatus;
  try {
  const allPicks = await loadActivePicks(input.client, input.market, runtime.signal);
  runtime.throwIfExpired();
  const picks = allPicks.filter((pick) => hash(`${pick.exchange}:${pick.ticker}`) % shards === shard);
  const bySecurity = new Map<string, PickRow[]>();
  for (const pick of picks) {
    const key = `${pick.exchange}:${pick.ticker}`;
    bySecurity.set(key, [...(bySecurity.get(key) || []), pick]);
  }
  const benchmarkCache = new Map<string, Awaited<ReturnType<typeof fetchRecommendationBenchmarkBars>>>();
  const evidenceManifestCache = new Map<string, string>();
  const updatedPublications = new Set<string>();
  let updated = 0;
  let evidenceRows = 0;
  let attemptedSecurities = 0;
  let processedSecurities = 0;
  let stoppedByDeadline = false;
  const errors: { ticker: string; message: string }[] = [];

  for (const securityPicks of bySecurity.values()) {
    const first = securityPicks[0];
    attemptedSecurities += 1;
    try {
      runtime.throwIfExpired();
      const security = await fetchRecommendationSecurityBars({
        ticker: first.ticker,
        exchange: first.exchange,
        market: input.market,
        targetBars: 160,
        signal: runtime.signal,
        timeoutMs: runtime.providerTimeoutMs(),
      });
      runtime.throwIfExpired();
      await upsertPriceSeries(
        input.client,
        recommendationPriceRows(input.market, security, 'SECURITY'),
        runtime.signal,
      );
      const performanceRows: {
        manifestHash: string;
        evidenceReady: boolean;
        row: Record<string, unknown>;
      }[] = [];
      const evidenceManifests = new Map<
        string,
        ReturnType<typeof buildRecommendationEvidenceManifest>
      >();
      const publicationUpdates = new Map<
        string,
        { firstTradableDate: string; entryStatus: 'READY' | 'ERROR' }
      >();
      for (const pick of securityPicks) {
        runtime.throwIfExpired();
        let benchmark = benchmarkCache.get(pick.benchmark_symbol);
        if (!benchmark) {
          benchmark = await fetchRecommendationBenchmarkBars(pick.benchmark_symbol, {
            signal: runtime.signal,
            timeoutMs: runtime.providerTimeoutMs(),
          });
          benchmarkCache.set(pick.benchmark_symbol, benchmark);
          await upsertPriceSeries(
            input.client,
            recommendationPriceRows(input.market, benchmark, 'BENCHMARK'),
            runtime.signal,
          );
        }
        const marketRegime = extractRecommendationMarketRegime(pick.recommendation_publications.market_context);
        for (const horizon of ['LIVE', 'D5', 'D20', 'D60'] as RecommendationHorizon[]) {
          runtime.throwIfExpired();
          const calculation = buildRecommendationPriceEvidence({
            pickId: pick.id,
            generatedAt: pick.recommendation_publications.generated_at,
            market: input.market,
            horizon,
            security,
            benchmark,
          });
          const { result, dataManifest } = calculation;
          const evidenceManifest = buildRecommendationEvidenceManifest({
            pickId: pick.id,
            engineId: pick.recommendation_publications.engine_version,
            promptId: pick.recommendation_publications.prompt_version,
            calculation,
            marketRegime,
          });
          evidenceManifests.set(evidenceManifest.manifestHash, evidenceManifest);
          const net = calculateNetRecommendationPerformance({
            market: input.market,
            grossReturnPct: result.returnPct,
            benchmarkReturnPct: result.benchmarkReturnPct,
          });
          const evidenceStatus = result.status === 'MATURED'
            && evidenceManifest.evidenceStatus === 'READY'
            && net.costEvidenceStatus !== 'MISSING'
            ? 'READY'
            : 'INCOMPLETE';
          performanceRows.push({
            manifestHash: evidenceManifest.manifestHash,
            evidenceReady: evidenceStatus === 'READY',
            row: {
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
              net_return_pct: net.netReturnPct,
              net_excess_return_pct: net.netExcessReturnPct,
              total_cost_pct: net.totalCostPct,
              commission_cost_pct: net.commissionCostPct,
              tax_cost_pct: net.taxCostPct,
              slippage_cost_pct: net.slippageCostPct,
              fx_cost_pct: net.fxCostPct,
              cost_model_version: net.costModelVersion,
              cost_evidence_status: net.costEvidenceStatus,
              account_evidence_status: net.accountEvidenceStatus,
              data_evidence_tier: dataManifest.evidenceTier,
              evidence_status: evidenceStatus,
              market_regime: marketRegime,
              mfe_pct: result.mfePct,
              mae_pct: result.maePct,
              quality_status: result.qualityStatus,
              error_message: result.errorMessage,
              calculated_at: new Date().toISOString(),
            },
          });
          if (result.entryDate) {
            publicationUpdates.set(pick.publication_id, {
              firstTradableDate: result.entryDate,
              entryStatus: result.status === 'ERROR' ? 'ERROR' : 'READY',
            });
          }
        }
      }

      runtime.throwIfExpired();
      const unregisteredManifests = [...evidenceManifests.values()].filter(
        (manifest) => !evidenceManifestCache.has(manifest.manifestHash),
      );
      if (unregisteredManifests.length > 0) {
        const registered = await registerRecommendationEvidenceManifests(
          input.client,
          unregisteredManifests,
          runtime.signal,
        );
        for (const [manifestHash, id] of registered) evidenceManifestCache.set(manifestHash, id);
      }

      const persistedPerformanceRows = performanceRows.map((pending) => {
        const evidenceManifestId = evidenceManifestCache.get(pending.manifestHash);
        if (!evidenceManifestId) {
          throw new Error(`Evidence manifest ${pending.manifestHash} was not registered.`);
        }
        return { ...pending.row, evidence_manifest_id: evidenceManifestId };
      });
      for (let index = 0; index < persistedPerformanceRows.length; index += 500) {
        runtime.throwIfExpired();
        const performanceRequest = input.client
          .from('recommendation_performance')
          .upsert(persistedPerformanceRows.slice(index, index + 500), {
            onConflict: 'pick_id,horizon',
          });
        const { error } = await performanceRequest.abortSignal(runtime.signal);
        if (error) throw error;
      }

      const publicationUpdateGroups = new Map<
        string,
        { firstTradableDate: string; entryStatus: 'READY' | 'ERROR'; ids: string[] }
      >();
      for (const [publicationId, publicationUpdate] of publicationUpdates) {
        if (updatedPublications.has(publicationId)) continue;
        const groupKey = JSON.stringify([
          publicationUpdate.firstTradableDate,
          publicationUpdate.entryStatus,
        ]);
        const group = publicationUpdateGroups.get(groupKey) || { ...publicationUpdate, ids: [] };
        group.ids.push(publicationId);
        publicationUpdateGroups.set(groupKey, group);
      }
      for (const group of publicationUpdateGroups.values()) {
        runtime.throwIfExpired();
        const publicationRequest = input.client.from('recommendation_publications').update({
          first_tradable_date: group.firstTradableDate,
          entry_status: group.entryStatus,
          updated_at: new Date().toISOString(),
        }).in('id', group.ids);
        const { error: publicationError } = await publicationRequest.abortSignal(runtime.signal);
        if (publicationError) throw publicationError;
        for (const publicationId of group.ids) updatedPublications.add(publicationId);
      }

      updated += performanceRows.length;
      evidenceRows += performanceRows.filter((row) => row.evidenceReady).length;
      processedSecurities += 1;
    } catch (error) {
      const deadlineFailure = runtime.deadlineReached()
        || isRecommendationPerformanceDeadlineError(error);
      if (deadlineFailure) stoppedByDeadline = true;
      errors.push({
        ticker: first.ticker,
        message: deadlineFailure
          ? 'Recommendation performance shard work deadline reached.'
          : error instanceof Error ? error.message : 'Unknown price refresh failure',
      });
      if (deadlineFailure) break;
    }
  }

  const remainingSecurities = Math.max(0, bySecurity.size - processedSecurities);
  const deadlineReached = stoppedByDeadline || runtime.deadlineReached();
  const shardStatus = classifyRecommendationShardOutcome({
    deadlineReached,
    errorCount: errors.length,
    processedSecurities,
    totalSecurities: bySecurity.size,
  });
  const shardMetadata = {
    batch_date: batchDate,
    market: input.market,
    shard,
    shards,
    picks: picks.length,
    securities: bySecurity.size,
    attempted_securities: attemptedSecurities,
    processed_securities: processedSecurities,
    remaining_securities: remainingSecurities,
    deadline_reached: deadlineReached,
    work_budget_ms: runtime.deadlineAt - runtime.startedAt,
    work_elapsed_ms: Date.now() - runtime.startedAt,
    performance_rows: updated,
    evidence_rows: evidenceRows,
    errors,
  };
  const shardCompletion = await completeRecommendationPerformanceShard({
    client: input.client,
    batchDate,
    market: input.market,
    shard,
    claimToken: shardClaim.claimToken,
    status: shardStatus,
    metadata: shardMetadata,
    errorMessage: deadlineReached
      ? `Shard deadline reached with ${remainingSecurities} securities not attempted`
      : errors.length ? `${errors.length} securities failed` : null,
  });
  shardCompletionRecorded = true;
  recordedShardStatus = shardStatus;
  barrierStatus = String(shardCompletion.barrier_status || barrierStatus);

  const finalization = shardStatus === 'SUCCESS'
    && runtime.remainingMs() >= RECOMMENDATION_PERFORMANCE_MIN_FINALIZATION_MS
    ? await finalizeRecommendationPerformanceBatchIfReady({
        client: input.client,
        batchDate,
        market: input.market,
        signal: runtime.signal,
        refreshDiagnostics: () => refreshRecommendationDiagnostics(input.client, input.market, runtime.signal),
        refreshEvidence: () => refreshRecommendationEvidenceEvaluations(input.client, input.market, runtime.signal),
      })
    : deferredRecommendationPerformanceFinalization(
        shardCompletion,
        shardStatus === 'DEGRADED' ? 'SHARD_DEGRADED' : 'DEFERRED_RUNTIME_BUDGET',
      );
  barrierStatus = finalization.barrierStatus;
  const findingCount = finalization.findings;
  const evidence = finalization.evidence
    || { evaluated: 0, groups: 0, promotionPasses: 0, accountEvidenceStatus: 'NOT_AVAILABLE' as const };

  const { error: pipelineRunError } = await input.client.from('data_pipeline_runs').insert({
    pipeline: 'recommendation-performance',
    provider: 'KIS/Yahoo',
    market: input.market,
    status: shardStatus,
    observed_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    fallback_used: errors.length > 0,
    fallback_reason: deadlineReached
      ? `Shard deadline reached with ${remainingSecurities} securities not attempted`
      : errors.length ? `${errors.length} securities failed` : null,
    metadata: {
      batch_date: batchDate,
      batch_key: `${batchDate}:${input.market}`,
      shard,
      shards,
      shard_status: shardStatus,
      shard_attempt: shardClaim.attemptCount,
      barrier_status: barrierStatus,
      barrier_claim_status: finalization.claimStatus,
      barrier_successful_shards: finalization.successfulShards,
      barrier_required_shards: finalization.requiredShards,
      barrier_degraded_shards: finalization.degradedShards,
      barrier_missing_shards: finalization.missingShards,
      finalization_status: finalization.finalized ? 'SUCCESS' : 'PENDING',
      finalization_claimed: finalization.claimed,
      picks: picks.length,
      securities: bySecurity.size,
      attempted_securities: attemptedSecurities,
      processed_securities: processedSecurities,
      remaining_securities: remainingSecurities,
      deadline_reached: deadlineReached,
      work_budget_ms: runtime.deadlineAt - runtime.startedAt,
      work_elapsed_ms: Date.now() - runtime.startedAt,
      performance_rows: updated,
      evidence_rows: evidenceRows,
      evidence_evaluations: evidence.evaluated,
      findings: findingCount,
      account_evidence_status: evidence.accountEvidenceStatus,
      errors,
    },
  });
  if (pipelineRunError) throw pipelineRunError;
  pipelineRunRecorded = true;

  return {
    market: input.market,
    batchDate,
    shard,
    shards,
    skipped: false,
    shardStatus,
    deadlineReached,
    barrier: finalization,
    picks: picks.length,
    securities: bySecurity.size,
    attemptedSecurities,
    processedSecurities,
    remainingSecurities,
    updated,
    evidenceRows,
    evidence,
    findings: findingCount,
    errors,
  };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recommendation performance failure';
    if (!shardCompletionRecorded) {
      try {
        const failedCompletion = await completeRecommendationPerformanceShard({
          client: input.client,
          batchDate,
          market: input.market,
          shard,
          claimToken: shardClaim.claimToken,
          status: 'FAILED',
          metadata: { batch_date: batchDate, market: input.market, shard, shards },
          errorMessage: message,
        });
        shardCompletionRecorded = true;
        recordedShardStatus = 'FAILED';
        barrierStatus = String(failedCompletion.barrier_status || barrierStatus);
      } catch (completionError) {
        const completionMessage = completionError instanceof Error ? completionError.message : String(completionError);
        throw new Error(`${message}; shard failure ledger update also failed: ${completionMessage}`, { cause: error });
      }
    }
    if (!pipelineRunRecorded) {
      const { error: pipelineRunError } = await input.client.from('data_pipeline_runs').insert({
        pipeline: 'recommendation-performance',
        provider: 'KIS/Yahoo',
        market: input.market,
        status: 'FAILED',
        observed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        fallback_used: false,
        fallback_reason: null,
        error_message: message,
        metadata: {
          batch_date: batchDate,
          batch_key: `${batchDate}:${input.market}`,
          shard,
          shards,
          shard_status: recordedShardStatus || 'FAILED',
          barrier_status: barrierStatus,
          finalization_status: recordedShardStatus === 'SUCCESS' ? 'FAILED' : 'BLOCKED',
        },
      });
      if (pipelineRunError) {
        throw new Error(`${message}; pipeline failure ledger update also failed: ${pipelineRunError.message}`, { cause: error });
      }
    }
    throw error;
  } finally {
    runtime.dispose();
  }
}

export async function refreshRecommendationDiagnostics(
  client: SupabaseClient,
  market: RecommendationMarket,
  signal?: AbortSignal,
) {
  const request = client
    .from('recommendation_performance')
    .select('horizon, status, return_pct, benchmark_return_pct, excess_return_pct, mfe_pct, mae_pct, quality_status, entry_price, recommendation_picks!inner(id, publication_id, source, sector, rank, confidence, signal_price, recommendation_publications!inner(run_date, market, category, is_official))')
    .eq('recommendation_picks.recommendation_publications.market', market)
    .eq('recommendation_picks.recommendation_publications.is_official', true)
    .limit(10000);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
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
  const deleteRequest = client
    .from('recommendation_diagnostic_findings')
    .delete()
    .eq('market', market)
    .eq('analyzer_version', RECOMMENDATION_ANALYZER_VERSION);
  const { error: deleteError } = await (signal ? deleteRequest.abortSignal(signal) : deleteRequest);
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
  const insertRequest = client.from('recommendation_diagnostic_findings').insert(rows);
  const { error: insertError } = await (signal ? insertRequest.abortSignal(signal) : insertRequest);
  if (insertError) throw insertError;
  return rows.length;
}
