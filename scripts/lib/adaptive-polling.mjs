const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const DEFAULT_NON_TRANSIENT_FAILURE_LIMIT = 3;
const DEFAULT_TRANSIENT_FAILURE_LIMIT = 20;

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function normalizePollingMs(value, { fallbackMs, minMs = 1_000, maxMs = Number.POSITIVE_INFINITY }) {
  const fallback = positiveNumber(fallbackMs, 30_000);
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minMs) return Math.min(maxMs, Math.max(minMs, fallback));
  return Math.min(maxMs, numeric);
}

export function nextAdaptivePollMs(previousMs, options = {}) {
  if (options.worked) return 0;
  const baseMs = positiveNumber(options.baseMs, 30_000);
  const maxMs = Math.max(baseMs, positiveNumber(options.maxMs, 300_000));
  const previous = positiveNumber(previousMs, 0);
  return previous > 0
    ? Math.min(maxMs, Math.max(baseMs, previous * 2))
    : baseMs;
}

export function reachedConsecutiveFailureLimit(count, options = {}) {
  const limit = options.transient
    ? positiveNumber(options.transientLimit, DEFAULT_TRANSIENT_FAILURE_LIMIT)
    : positiveNumber(options.nonTransientLimit, DEFAULT_NON_TRANSIENT_FAILURE_LIMIT);
  return count >= limit;
}

export function isTransientSupabaseError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.cause?.status);
  if (TRANSIENT_HTTP_STATUSES.has(status)) return true;

  const message = [error?.message, error?.details, error?.hint, error?.cause?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\bhttp(?:\s+status|\s*error|\s*)?[:=]?\s*(?:408|425|429|500|502|503|504|520|521|522|523|524)\b/.test(message)
    || /connection timed out|statement timeout|fetch failed|econnreset|etimedout|socket hang up|network error|database system is not accepting connections|could not query the database for the schema cache/.test(message);
}
