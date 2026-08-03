const DECISION_CODES = ['WATCH', 'ACCEPT', 'REJECT', 'NO_ACTION'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isRecommendationDecisionAppendResponse(
  value: unknown,
  expectedPickId: string,
  expectedDecisionCode: string,
) {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.meta)) return false;
  const { data, meta } = value;
  if (Object.keys(data).length !== 2 || data.action !== 'RECORD_DECISION' || !isRecord(data.result)) return false;
  const result = data.result;
  const resultKeys = ['id', 'decision_hash', 'pick_id', 'decision_code', 'decided_at'];
  return Object.keys(result).length === resultKeys.length
    && resultKeys.every((key) => key in result)
    && typeof result.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id)
    && typeof result.decision_hash === 'string'
    && /^[a-f0-9]{64}$/.test(result.decision_hash)
    && result.pick_id === expectedPickId
    && DECISION_CODES.includes(result.decision_code as (typeof DECISION_CODES)[number])
    && result.decision_code === expectedDecisionCode
    && typeof result.decided_at === 'string'
    && Number.isFinite(Date.parse(result.decided_at))
    && typeof meta.asOf === 'string'
    && Number.isFinite(Date.parse(meta.asOf))
    && typeof meta.source === 'string'
    && typeof meta.provider === 'string'
    && ['REALTIME', 'DELAYED_15M', 'EOD', 'UNKNOWN'].includes(String(meta.delay))
    && typeof meta.fallbackUsed === 'boolean'
    && Array.isArray(meta.warnings)
    && meta.warnings.every((warning) => typeof warning === 'string');
}

export function assuranceFailureMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.message === 'string' ? value.message : fallback;
}
