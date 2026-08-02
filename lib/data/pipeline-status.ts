export type PipelineRunStatus = 'SUCCESS' | 'DEGRADED' | 'FAILED';

export interface PipelineRunRow {
  id: string;
  pipeline: string;
  provider: string;
  market: string | null;
  status: PipelineRunStatus;
  observed_at: string | null;
  fetched_at?: string | null;
  completed_at: string | null;
  created_at?: string | null;
  fallback_used: boolean;
  fallback_reason?: string | null;
  error_message: string | null;
  metadata?: Record<string, unknown> | null;
}

const HOUR = 60 * 60;

export function pipelineRunScope(row: Pick<PipelineRunRow, 'pipeline' | 'market' | 'metadata'>) {
  const mode = row.pipeline === 'market-intelligence'
    ? String(row.metadata?.mode || 'unknown')
    : 'default';
  return `${row.pipeline}:${row.market || 'ALL'}:${mode}`;
}

export function pipelineExpectedMaxAgeSeconds(row: Pick<PipelineRunRow, 'pipeline' | 'metadata'>) {
  if (row.pipeline === 'market-intelligence') {
    return row.metadata?.mode === 'feeds' ? HOUR : 36 * HOUR;
  }
  if (row.pipeline === 'portfolio-risk') return 15 * 60;
  if (row.pipeline === 'recommendation-performance') return 30 * HOUR;
  if (row.pipeline === 'macro') return 36 * HOUR;
  if (row.pipeline === 'risk-barometer') return 36 * HOUR;
  if (row.pipeline === 'gold-strategy' || row.pipeline === 'nasdaq-strategy') return 36 * HOUR;
  return 36 * HOUR;
}

function parsedTime(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sourceTimestamp(row: PipelineRunRow) {
  return parsedTime(row.observed_at) === null ? null : row.observed_at;
}

export function buildPipelineHealthRows(inputRows: PipelineRunRow[], now = new Date()) {
  const grouped = new Map<string, PipelineRunRow[]>();
  for (const row of inputRows) {
    const scope = pipelineRunScope(row);
    grouped.set(scope, [...(grouped.get(scope) || []), row]);
  }

  return [...grouped.values()].map((group) => {
    const sorted = [...group].sort((left, right) => (
      (parsedTime(right.created_at || right.completed_at || right.observed_at) || 0)
      - (parsedTime(left.created_at || left.completed_at || left.observed_at) || 0)
    ));
    const latest = sorted[0];
    const latestSourceAt = sourceTimestamp(latest);
    const latestSourceMs = parsedTime(latestSourceAt);
    const expectedMaxAgeSeconds = pipelineExpectedMaxAgeSeconds(latest);
    const ageSeconds = latestSourceMs === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - latestSourceMs) / 1000));
    const freshnessStatus = ageSeconds === null
      ? 'UNKNOWN'
      : ageSeconds > expectedMaxAgeSeconds ? 'STALE' : 'FRESH';
    const recordedStatus = latest.status;
    const effectiveStatus: PipelineRunStatus = recordedStatus === 'FAILED'
      || freshnessStatus !== 'FRESH'
      ? 'FAILED'
      : recordedStatus === 'DEGRADED' || latest.fallback_used
        ? 'DEGRADED'
        : 'SUCCESS';
    const lastSuccess = sorted.find((row) => row.status === 'SUCCESS');
    const nextExpectedAt = latestSourceMs === null
      ? null
      : new Date(latestSourceMs + expectedMaxAgeSeconds * 1000).toISOString();

    return {
      ...latest,
      status: effectiveStatus,
      recorded_status: recordedStatus,
      freshness_status: freshnessStatus as 'FRESH' | 'STALE' | 'UNKNOWN',
      freshness_at: latestSourceAt,
      age_seconds: ageSeconds,
      expected_max_age_seconds: expectedMaxAgeSeconds,
      next_expected_at: nextExpectedAt,
      last_success_at: lastSuccess ? sourceTimestamp(lastSuccess) : null,
      stale_reason: freshnessStatus === 'UNKNOWN'
        ? '원천 데이터 관측 시각이 없습니다.'
        : freshnessStatus === 'STALE'
          ? `원천 데이터가 ${expectedMaxAgeSeconds}초 SLA를 초과했습니다.`
          : null,
    };
  }).sort((left, right) => pipelineRunScope(left).localeCompare(pipelineRunScope(right)));
}
