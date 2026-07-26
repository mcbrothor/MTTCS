import crypto from 'node:crypto';

export const DEFAULT_JOB_TYPES = [
  'FINANCIAL_AUDIT',
  'THESIS_CHECK',
  'COMMITTEE_REVIEW',
  'NEWS_PULSE',
  'RECOMMENDATION_BACKTEST',
];

export const COMPLETED_JOB_STATUSES = ['succeeded', 'failed', 'cancelled'];

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashPayload(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function envNumber(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envList(env, name, fallback) {
  const raw = env[name];
  if (!raw) return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

export function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeMarket(value) {
  return value === 'KR' ? 'KR' : value === 'US' ? 'US' : null;
}

function clamp(value, min = 0, max = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function compactText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim();
}

export function buildWorkerConfig(env = process.env) {
  const pollMs = Math.max(1_000, envNumber(env, 'MTN_LOCAL_WORKER_POLL_MS', 30_000));
  return {
    workerId: env.MTN_LOCAL_WORKER_ID || `mtn-local-${process.pid}`,
    pollMs,
    maxPollMs: Math.max(pollMs, envNumber(env, 'MTN_LOCAL_WORKER_MAX_POLL_MS', 300_000)),
    staleAfterSeconds: envNumber(env, 'MTN_LOCAL_WORKER_STALE_AFTER_SECONDS', 900),
    jobTypes: envList(env, 'MTN_LOCAL_WORKER_JOB_TYPES', DEFAULT_JOB_TYPES),
    once: env.MTN_LOCAL_WORKER_ONCE?.toLowerCase() === 'true',
  };
}

export function buildFinancialAuditResult(payload) {
  const ticker = normalizeTicker(payload?.ticker);
  if (!ticker) throw new Error('FINANCIAL_AUDIT payload requires ticker.');
  const market = normalizeMarket(payload?.market);
  const toleranceWarnPct = Number(payload?.toleranceWarnPct ?? 5);
  const toleranceFailPct = Number(payload?.toleranceFailPct ?? 15);
  const rows = Array.isArray(payload?.financials) ? payload.financials : [];
  const grouped = new Map();

  for (const row of rows) {
    const metric = String(row?.metric || '').trim();
    const source = String(row?.source || '').trim();
    const numeric = Number(row?.value);
    if (!metric || !source || !Number.isFinite(numeric)) continue;
    const period = String(row?.period || row?.statement_period || 'latest');
    const currency = String(row?.currency || '').toUpperCase();
    const key = `${metric}::${period}::${currency}`;
    const group = grouped.get(key) || { metric, period, currency, values: [] };
    group.values.push({ source, value: numeric, asOf: row?.asOf || row?.source_as_of || null });
    grouped.set(key, group);
  }

  const findings = [];
  let maxVariancePct = null;
  let sourceCount = 0;

  for (const group of grouped.values()) {
    sourceCount += new Set(group.values.map((item) => item.source)).size;
    if (group.values.length < 2) {
      findings.push({
        code: 'SINGLE_SOURCE',
        severity: 'WARN',
        metric: group.metric,
        period: group.period,
        currency: group.currency || null,
        summary: `${group.metric} has only one usable source.`,
        values: group.values,
      });
      continue;
    }

    const values = group.values.map((item) => item.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const midpoint = Math.abs((min + max) / 2);
    const variancePct = midpoint > 0 ? ((max - min) / midpoint) * 100 : max === min ? 0 : 100;
    maxVariancePct = maxVariancePct === null ? variancePct : Math.max(maxVariancePct, variancePct);
    if (variancePct >= toleranceFailPct) {
      findings.push({
        code: 'SOURCE_CONFLICT',
        severity: 'CRITICAL',
        metric: group.metric,
        period: group.period,
        currency: group.currency || null,
        variancePct: Number(variancePct.toFixed(2)),
        summary: `${group.metric} differs by ${variancePct.toFixed(2)}% across sources.`,
        values: group.values,
      });
    } else if (variancePct >= toleranceWarnPct) {
      findings.push({
        code: 'SOURCE_VARIANCE',
        severity: 'WARN',
        metric: group.metric,
        period: group.period,
        currency: group.currency || null,
        variancePct: Number(variancePct.toFixed(2)),
        summary: `${group.metric} differs by ${variancePct.toFixed(2)}% across sources.`,
        values: group.values,
      });
    }
  }

  if (rows.length === 0 || grouped.size === 0) {
    findings.push({
      code: 'DATA_MISSING',
      severity: 'CRITICAL',
      summary: 'No usable financial metrics were provided for audit.',
    });
  }

  const hasCritical = findings.some((finding) => finding.severity === 'CRITICAL');
  const hasWarn = findings.some((finding) => finding.severity === 'WARN');
  const status = hasCritical ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';
  const severity = hasCritical ? 'CRITICAL' : hasWarn ? 'WARN' : 'INFO';
  const summary = status === 'PASS'
    ? `${ticker} financial audit passed across ${sourceCount} source observations.`
    : status === 'WARN'
      ? `${ticker} financial audit completed with ${findings.length} warning(s).`
      : `${ticker} financial audit failed with ${findings.length} critical issue(s).`;

  return {
    ticker,
    market,
    status,
    severity,
    summary,
    findingCount: findings.length,
    sourceCount,
    maxVariancePct: maxVariancePct === null ? null : Number(maxVariancePct.toFixed(2)),
    findings,
    payloadHash: hashPayload(payload),
  };
}

export function buildThesisCheckResult(payload) {
  const ticker = normalizeTicker(payload?.ticker);
  const thesisId = payload?.thesis_id || payload?.thesisId || null;
  if (!ticker && !thesisId) throw new Error('THESIS_CHECK payload requires ticker or thesis_id.');
  const market = normalizeMarket(payload?.market);
  const assumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const evidence = Array.isArray(payload?.evidence) ? payload.evidence : [];
  const impacts = [...events, ...evidence].map((item) => String(item?.impact || item?.impact_label || 'UNKNOWN').toUpperCase());
  const brokenAssumptions = assumptions.filter((item) => String(item?.status || '').toUpperCase() === 'BROKEN');
  const weakenedAssumptions = assumptions.filter((item) => String(item?.status || '').toUpperCase() === 'WEAKENED');
  const impact = brokenAssumptions.length > 0 || impacts.includes('BREAKS')
    ? 'BREAKS'
    : weakenedAssumptions.length > 0 || impacts.includes('WEAKENS')
      ? 'WEAKENS'
      : impacts.includes('STRENGTHENS')
        ? 'STRENGTHENS'
        : impacts.includes('NEUTRAL')
          ? 'NEUTRAL'
          : 'UNKNOWN';
  const health = impact === 'BREAKS' ? 'BROKEN' : impact === 'WEAKENS' ? 'WATCH' : impact === 'STRENGTHENS' ? 'HEALTHY' : 'UNKNOWN';
  const summary = compactText(
    payload?.summary,
    `${ticker || thesisId} thesis check: ${impact.toLowerCase()} (${assumptions.length} assumption(s), ${events.length + evidence.length} evidence item(s)).`,
  );
  return {
    ticker: ticker || null,
    market,
    thesisId,
    impact,
    health,
    summary,
    assumptionCount: assumptions.length,
    evidenceCount: events.length + evidence.length,
    assumptions,
    events,
    evidence,
    payloadHash: hashPayload(payload),
  };
}

export function buildNewsPulseResult(payload) {
  const ticker = normalizeTicker(payload?.ticker);
  if (!ticker) throw new Error('NEWS_PULSE payload requires ticker.');
  const market = normalizeMarket(payload?.market);
  const news = Array.isArray(payload?.news) ? payload.news : [];
  const counts = { STRENGTHENS: 0, NEUTRAL: 0, WEAKENS: 0, BREAKS: 0, UNKNOWN: 0 };
  for (const item of news) {
    const label = String(item?.impact_label || item?.impact || 'UNKNOWN').toUpperCase();
    counts[label in counts ? label : 'UNKNOWN'] += 1;
  }
  const dominantImpact = counts.BREAKS > 0
    ? 'BREAKS'
    : counts.WEAKENS > counts.STRENGTHENS
      ? 'WEAKENS'
      : counts.STRENGTHENS > 0
        ? 'STRENGTHENS'
        : counts.NEUTRAL > 0
          ? 'NEUTRAL'
          : 'UNKNOWN';
  const summary = compactText(
    payload?.summary,
    `${ticker} news pulse: ${dominantImpact.toLowerCase()} from ${news.length} news item(s).`,
  );
  return {
    ticker,
    market,
    dominantImpact,
    summary,
    newsCount: news.length,
    counts,
    news,
    payloadHash: hashPayload(payload),
  };
}

function normalizeVoteRecommendation(value) {
  const raw = String(value || 'WATCH').toUpperCase();
  if (['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL', 'SKIP', 'WATCH'].includes(raw)) return raw;
  return 'WATCH';
}

export function buildCommitteeReviewResult(payload) {
  const ticker = normalizeTicker(payload?.ticker);
  if (!ticker) throw new Error('COMMITTEE_REVIEW payload requires ticker.');
  const market = normalizeMarket(payload?.market);
  const rawVotes = Array.isArray(payload?.agent_votes)
    ? payload.agent_votes
    : Array.isArray(payload?.agents)
      ? payload.agents
      : [];
  const votes = rawVotes.map((vote, index) => ({
    agent_role: compactText(vote?.agent_role || vote?.role || `agent_${index + 1}`),
    recommendation: normalizeVoteRecommendation(vote?.recommendation || vote?.vote),
    confidence: clamp(vote?.confidence ?? 0.5),
    rationale: compactText(vote?.rationale || vote?.summary || 'No rationale provided.'),
    evidence: vote?.evidence || {},
  }));
  const scoreByRecommendation = {
    STRONG_BUY: 2,
    BUY: 1,
    HOLD: 0,
    WATCH: 0,
    SKIP: -1,
    SELL: -1,
    STRONG_SELL: -2,
  };
  const weightedScore = votes.length
    ? votes.reduce((sum, vote) => sum + scoreByRecommendation[vote.recommendation] * vote.confidence, 0) / votes.reduce((sum, vote) => sum + vote.confidence, 0)
    : 0;
  const consensus = weightedScore >= 1.35
    ? 'STRONG_BUY'
    : weightedScore >= 0.45
      ? 'BUY'
      : weightedScore <= -1.35
        ? 'STRONG_SELL'
        : weightedScore <= -0.45
          ? 'SELL'
          : 'WATCH';
  const confidence = votes.length ? clamp(votes.reduce((sum, vote) => sum + vote.confidence, 0) / votes.length) : 0.35;
  const summary = compactText(
    payload?.summary,
    `${ticker} committee consensus: ${consensus} from ${votes.length} agent vote(s).`,
  );
  return {
    ticker,
    market,
    consensus,
    confidence: Number(confidence.toFixed(2)),
    summary,
    votes,
    weightedScore: Number(weightedScore.toFixed(3)),
    payloadHash: hashPayload(payload),
  };
}

export function buildRecommendationBacktestResult(payload) {
  const strategyKey = compactText(payload?.strategy_key || payload?.strategyKey || 'local-analysis-backtest');
  const datasetKey = payload?.dataset_key || payload?.datasetKey || null;
  const trades = Array.isArray(payload?.trades)
    ? payload.trades
    : Array.isArray(payload?.picks)
      ? payload.picks
      : [];
  const returns = trades
    .map((item) => Number(item?.return_pct ?? item?.returnPct ?? item?.return))
    .filter((value) => Number.isFinite(value));
  const excessReturns = trades
    .map((item) => Number(item?.excess_return_pct ?? item?.excessReturnPct))
    .filter((value) => Number.isFinite(value));
  const total = returns.length;
  const wins = returns.filter((value) => value > 0).length;
  const losses = returns.filter((value) => value < 0);
  const gains = returns.filter((value) => value > 0);
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const avgReturnPct = average(returns);
  const avgExcessReturnPct = excessReturns.length ? average(excessReturns) : null;
  const payoffRatio = losses.length && gains.length ? Math.abs(average(gains) / average(losses)) : null;
  const metrics = {
    sample_size: total,
    hit_rate: total ? Number((wins / total).toFixed(4)) : 0,
    avg_return_pct: Number(avgReturnPct.toFixed(2)),
    avg_excess_return_pct: avgExcessReturnPct === null ? null : Number(avgExcessReturnPct.toFixed(2)),
    payoff_ratio: payoffRatio === null ? null : Number(payoffRatio.toFixed(2)),
  };
  const status = total === 0 ? 'FAILED' : avgReturnPct > 0 ? 'PASSED' : 'FAILED';
  const summary = compactText(
    payload?.summary,
    `${strategyKey} backtest ${status.toLowerCase()}: ${total} sample(s), hit rate ${(metrics.hit_rate * 100).toFixed(1)}%, avg return ${metrics.avg_return_pct}%.`,
  );
  return {
    strategyKey,
    datasetKey,
    status,
    summary,
    metrics,
    assumptions: payload?.assumptions || {},
    trades,
    payloadHash: hashPayload(payload),
  };
}

export async function claimNextJob(supabase, config) {
  const { data, error } = await supabase.rpc('claim_analysis_job', {
    p_worker_id: config.workerId,
    p_job_types: config.jobTypes,
    p_stale_after_seconds: config.staleAfterSeconds,
  });
  if (error) throw new Error(`claim_analysis_job failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

export async function updateHeartbeat(localDb, config, status, metadata = {}, currentJobId = null) {
  await localDb.query(
    `insert into worker_heartbeats (worker_id, status, last_seen_at, current_job_id, metadata)
     values ($1, $2, now(), $3, $4::jsonb)
     on conflict (worker_id) do update
     set status = excluded.status,
         last_seen_at = excluded.last_seen_at,
         current_job_id = excluded.current_job_id,
         metadata = excluded.metadata`,
    [config.workerId, status, currentJobId, JSON.stringify(metadata)],
  );
}

export async function writeJobLog(localDb, config, jobId, level, message, metadata = {}) {
  await localDb.query(
    `insert into worker_job_logs (supabase_job_id, worker_id, level, message, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [jobId, config.workerId, level, message, JSON.stringify(metadata)],
  );
}

export async function storeFinancialAudit(localDb, job, result) {
  const inserted = await localDb.query(
    `insert into financial_audit_findings
       (supabase_job_id, ticker, market, status, severity, summary, findings, payload_hash)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     returning id, audited_at`,
    [
      job.id,
      result.ticker,
      result.market,
      result.status,
      result.severity,
      result.summary,
      JSON.stringify(result.findings),
      result.payloadHash,
    ],
  );
  return inserted.rows[0];
}

export async function upsertFinancialAuditSummary(supabase, job, result, localRecord) {
  const localEvidenceRef = {
    local_table: 'financial_audit_findings',
    local_id: localRecord.id,
    payload_hash: result.payloadHash,
  };
  const { error } = await supabase
    .from('financial_audit_summaries')
    .upsert({
      job_id: job.id,
      ticker: result.ticker,
      market: result.market,
      status: result.status,
      severity: result.severity,
      summary: result.summary,
      finding_count: result.findingCount,
      source_count: result.sourceCount,
      max_variance_pct: result.maxVariancePct,
      local_evidence_ref: localEvidenceRef,
      audited_at: localRecord.audited_at,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'job_id' });
  if (error) throw new Error(`financial_audit_summaries upsert failed: ${error.message}`);
  return localEvidenceRef;
}

export async function storeThesisCheck(localDb, job, result) {
  const inserted = await localDb.query(
    `insert into research_evidence
       (ticker, market, evidence_type, source, source_ref, claim, extracted_value, confidence, linked_entity_type, linked_entity_id)
     values ($1, $2, 'MANUAL', 'MTN_LOCAL_WORKER', $3, $4, $5::jsonb, $6, 'analysis_jobs', $7)
     returning id, created_at`,
    [
      result.ticker || 'UNKNOWN',
      result.market,
      result.thesisId ? String(result.thesisId) : null,
      result.summary,
      JSON.stringify({
        impact: result.impact,
        health: result.health,
        assumptions: result.assumptions,
        events: result.events,
        evidence: result.evidence,
        payload_hash: result.payloadHash,
      }),
      result.impact === 'UNKNOWN' ? 0.35 : 0.7,
      job.id,
    ],
  );
  return inserted.rows[0];
}

export async function upsertThesisCheckSummary(supabase, job, result, localRecord) {
  const localEvidenceRef = {
    local_table: 'research_evidence',
    local_id: localRecord.id,
    payload_hash: result.payloadHash,
  };
  if (result.thesisId) {
    const { error: eventError } = await supabase
      .from('thesis_check_events')
      .insert({
        thesis_id: result.thesisId,
        job_id: job.id,
        event_type: 'SCHEDULED_CHECK',
        impact: result.impact,
        summary: result.summary,
        evidence: {
          local_evidence_ref: localEvidenceRef,
          assumptions: result.assumptions,
          events: result.events,
          evidence: result.evidence,
        },
      });
    if (eventError) throw new Error(`thesis_check_events insert failed: ${eventError.message}`);

    const { error: thesisError } = await supabase
      .from('investment_theses')
      .update({
        health: result.health,
        status: result.health === 'BROKEN' ? 'BROKEN' : result.health === 'WATCH' ? 'WATCH' : 'ACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', result.thesisId);
    if (thesisError) throw new Error(`investment_theses update failed: ${thesisError.message}`);
  }
  return localEvidenceRef;
}

export async function storeNewsPulse(localDb, job, result) {
  const rows = [];
  for (const item of result.news) {
    const inserted = await localDb.query(
      `insert into news_events
         (ticker, market, source, headline, source_url, published_at, impact_label, summary, raw_payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       returning id`,
      [
        result.ticker,
        result.market,
        compactText(item?.source, 'manual'),
        compactText(item?.headline || item?.title, 'Untitled news item'),
        item?.source_url || item?.url || null,
        item?.published_at || item?.publishedAt || null,
        ['STRENGTHENS', 'NEUTRAL', 'WEAKENS', 'BREAKS', 'UNKNOWN'].includes(String(item?.impact_label || item?.impact || '').toUpperCase())
          ? String(item?.impact_label || item?.impact).toUpperCase()
          : 'UNKNOWN',
        item?.summary || null,
        JSON.stringify(item || {}),
      ],
    );
    rows.push(inserted.rows[0]);
  }
  const evidence = await localDb.query(
    `insert into research_evidence
       (ticker, market, evidence_type, source, claim, extracted_value, confidence, linked_entity_type, linked_entity_id)
     values ($1, $2, 'NEWS', 'MTN_LOCAL_WORKER', $3, $4::jsonb, $5, 'analysis_jobs', $6)
     returning id, created_at`,
    [
      result.ticker,
      result.market,
      result.summary,
      JSON.stringify({ dominant_impact: result.dominantImpact, counts: result.counts, news_event_ids: rows.map((row) => row.id), payload_hash: result.payloadHash }),
      result.dominantImpact === 'UNKNOWN' ? 0.35 : 0.65,
      job.id,
    ],
  );
  return evidence.rows[0];
}

export async function storeCommitteeReview(localDb, supabase, job, result) {
  const localRows = [];
  for (const vote of result.votes) {
    const inserted = await localDb.query(
      `insert into committee_agent_outputs
         (supabase_job_id, ticker, market, agent_role, recommendation, confidence, rationale, evidence)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       returning id`,
      [job.id, result.ticker, result.market, vote.agent_role, vote.recommendation, vote.confidence, vote.rationale, JSON.stringify(vote.evidence || {})],
    );
    localRows.push(inserted.rows[0]);
  }
  const localEvidenceRef = {
    local_table: 'committee_agent_outputs',
    local_ids: localRows.map((row) => row.id),
    payload_hash: result.payloadHash,
  };
  const { data, error } = await supabase
    .from('committee_reviews')
    .insert({
      job_id: job.id,
      ticker: result.ticker,
      market: result.market,
      consensus: result.consensus,
      confidence: result.confidence,
      summary: result.summary,
      agent_votes: result.votes,
      local_evidence_ref: localEvidenceRef,
    })
    .select('id')
    .single();
  if (error) throw new Error(`committee_reviews insert failed: ${error.message}`);
  return { ...localEvidenceRef, supabase_committee_review_id: data.id };
}

export async function storeRecommendationBacktest(localDb, job, result) {
  const inserted = await localDb.query(
    `insert into backtest_runs
       (supabase_job_id, strategy_key, dataset_key, status, metrics, assumptions, error_message, completed_at)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, now())
     returning id, completed_at`,
    [
      job.id,
      result.strategyKey,
      result.datasetKey,
      result.status,
      JSON.stringify(result.metrics),
      JSON.stringify(result.assumptions),
      result.status === 'FAILED' && result.metrics.sample_size === 0 ? 'No usable return samples were provided.' : null,
    ],
  );
  return inserted.rows[0];
}

export async function markJobSucceeded(supabase, job, resultSummary, localEvidenceRef = null) {
  const { error } = await supabase
    .from('analysis_jobs')
    .update({
      status: 'succeeded',
      result_summary: resultSummary,
      local_evidence_ref: localEvidenceRef,
      error_message: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);
  if (error) throw new Error(`analysis_jobs success update failed: ${error.message}`);
}

export async function markJobFailed(supabase, job, errorMessage) {
  const nextStatus = Number(job.attempts || 0) >= Number(job.max_attempts || 1) ? 'failed' : 'queued';
  const { error } = await supabase
    .from('analysis_jobs')
    .update({
      status: nextStatus,
      error_message: errorMessage,
      locked_by: null,
      locked_at: null,
      run_after: new Date(Date.now() + 60_000).toISOString(),
      completed_at: nextStatus === 'failed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);
  if (error) throw new Error(`analysis_jobs failure update failed: ${error.message}`);
}

export async function processJob({ job, config, supabase, localDb }) {
  await writeJobLog(localDb, config, job.id, 'INFO', `Processing ${job.job_type}.`);
  let result;
  let localEvidenceRef;
  let resultSummary;

  if (job.job_type === 'FINANCIAL_AUDIT') {
    result = buildFinancialAuditResult(job.payload || {});
    const localRecord = await storeFinancialAudit(localDb, job, result);
    localEvidenceRef = await upsertFinancialAuditSummary(supabase, job, result, localRecord);
    resultSummary = {
      ticker: result.ticker,
      market: result.market,
      status: result.status,
      severity: result.severity,
      summary: result.summary,
      finding_count: result.findingCount,
      source_count: result.sourceCount,
      max_variance_pct: result.maxVariancePct,
    };
  } else if (job.job_type === 'THESIS_CHECK') {
    result = buildThesisCheckResult(job.payload || {});
    const localRecord = await storeThesisCheck(localDb, job, result);
    localEvidenceRef = await upsertThesisCheckSummary(supabase, job, result, localRecord);
    resultSummary = {
      ticker: result.ticker,
      market: result.market,
      thesis_id: result.thesisId,
      impact: result.impact,
      health: result.health,
      summary: result.summary,
      assumption_count: result.assumptionCount,
      evidence_count: result.evidenceCount,
    };
  } else if (job.job_type === 'NEWS_PULSE') {
    result = buildNewsPulseResult(job.payload || {});
    const localRecord = await storeNewsPulse(localDb, job, result);
    localEvidenceRef = { local_table: 'research_evidence', local_id: localRecord.id, payload_hash: result.payloadHash };
    resultSummary = {
      ticker: result.ticker,
      market: result.market,
      dominant_impact: result.dominantImpact,
      summary: result.summary,
      news_count: result.newsCount,
      counts: result.counts,
    };
  } else if (job.job_type === 'COMMITTEE_REVIEW') {
    result = buildCommitteeReviewResult(job.payload || {});
    localEvidenceRef = await storeCommitteeReview(localDb, supabase, job, result);
    resultSummary = {
      ticker: result.ticker,
      market: result.market,
      consensus: result.consensus,
      confidence: result.confidence,
      summary: result.summary,
      agent_count: result.votes.length,
      weighted_score: result.weightedScore,
    };
  } else if (job.job_type === 'RECOMMENDATION_BACKTEST') {
    result = buildRecommendationBacktestResult(job.payload || {});
    const localRecord = await storeRecommendationBacktest(localDb, job, result);
    localEvidenceRef = { local_table: 'backtest_runs', local_id: localRecord.id, payload_hash: result.payloadHash };
    resultSummary = {
      strategy_key: result.strategyKey,
      dataset_key: result.datasetKey,
      status: result.status,
      summary: result.summary,
      metrics: result.metrics,
    };
  } else {
    throw new Error(`Unsupported job type for current worker implementation: ${job.job_type}`);
  }

  await markJobSucceeded(supabase, job, resultSummary, localEvidenceRef);
  await writeJobLog(localDb, config, job.id, 'INFO', `Completed ${job.job_type}.`, resultSummary);
  return result;
}
