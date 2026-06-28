export const LOCAL_ANALYSIS_JOB_TYPES = [
  'FINANCIAL_AUDIT',
  'THESIS_CHECK',
  'COMMITTEE_REVIEW',
  'NEWS_PULSE',
  'RECOMMENDATION_BACKTEST',
] as const;

export type LocalAnalysisJobType = typeof LOCAL_ANALYSIS_JOB_TYPES[number];
export type LocalAnalysisJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type LocalAnalysisJobAction = 'retry' | 'cancel' | 'requeue';

export interface LocalAnalysisJobLike {
  status: string | null;
}

export interface LocalAnalysisQueueSummary {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export interface WorkerFreshness {
  state: 'fresh' | 'stale' | 'missing' | 'invalid';
  ageSeconds: number | null;
}

export function isLocalAnalysisJobType(value: string): value is LocalAnalysisJobType {
  return LOCAL_ANALYSIS_JOB_TYPES.includes(value as LocalAnalysisJobType);
}

export function normalizeLocalAnalysisPayload(jobType: LocalAnalysisJobType, payload: Record<string, unknown>) {
  const ticker = String(payload.ticker || '').trim().toUpperCase();
  const market = payload.market === 'KR' ? 'KR' : payload.market === 'US' ? 'US' : null;

  if (jobType === 'THESIS_CHECK') {
    const thesisId = payload.thesis_id || payload.thesisId || null;
    if (!ticker && !thesisId) throw new Error('THESIS_CHECK requires ticker or thesis_id.');
    return {
      ...payload,
      ticker,
      market,
      thesis_id: thesisId,
      assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : [],
      events: Array.isArray(payload.events) ? payload.events : [],
      evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
    };
  }

  if (jobType === 'COMMITTEE_REVIEW') {
    if (!ticker) throw new Error('COMMITTEE_REVIEW requires ticker.');
    return {
      ...payload,
      ticker,
      market,
      agent_votes: Array.isArray(payload.agent_votes)
        ? payload.agent_votes
        : Array.isArray(payload.agents)
          ? payload.agents
          : [],
    };
  }

  if (jobType === 'NEWS_PULSE') {
    if (!ticker) throw new Error('NEWS_PULSE requires ticker.');
    return {
      ...payload,
      ticker,
      market,
      news: Array.isArray(payload.news) ? payload.news : [],
    };
  }

  if (jobType === 'RECOMMENDATION_BACKTEST') {
    const strategyKey = String(payload.strategy_key || payload.strategyKey || '').trim();
    if (!strategyKey) throw new Error('RECOMMENDATION_BACKTEST requires strategy_key.');
    return {
      ...payload,
      strategy_key: strategyKey,
      dataset_key: payload.dataset_key || payload.datasetKey || null,
      trades: Array.isArray(payload.trades) ? payload.trades : Array.isArray(payload.picks) ? payload.picks : [],
    };
  }

  if (!ticker) throw new Error('FINANCIAL_AUDIT requires ticker.');
  return {
    ...payload,
    ticker,
    market,
    financials: Array.isArray(payload.financials) ? payload.financials : [],
  };
}

export function normalizeLocalAnalysisAction(value: unknown): LocalAnalysisJobAction {
  const action = String(value || '').trim().toLowerCase();
  if (action === 'retry' || action === 'cancel' || action === 'requeue') return action;
  throw new Error('action must be one of: retry, cancel, requeue');
}

export function buildLocalAnalysisQueueSummary(jobs: LocalAnalysisJobLike[]): LocalAnalysisQueueSummary {
  const summary: LocalAnalysisQueueSummary = {
    total: jobs.length,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const job of jobs) {
    if (job.status === 'queued') summary.queued += 1;
    if (job.status === 'running') summary.running += 1;
    if (job.status === 'succeeded') summary.succeeded += 1;
    if (job.status === 'failed') summary.failed += 1;
    if (job.status === 'cancelled') summary.cancelled += 1;
  }

  return summary;
}

export function classifyWorkerFreshness(
  lastSeenAt: string | null | undefined,
  nowMs = Date.now(),
  staleAfterMs = 120_000,
): WorkerFreshness {
  if (!lastSeenAt) return { state: 'missing', ageSeconds: null };
  const seenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(seenMs)) return { state: 'invalid', ageSeconds: null };
  const ageSeconds = Math.max(0, Math.round((nowMs - seenMs) / 1000));
  return {
    state: ageSeconds * 1000 <= staleAfterMs ? 'fresh' : 'stale',
    ageSeconds,
  };
}
