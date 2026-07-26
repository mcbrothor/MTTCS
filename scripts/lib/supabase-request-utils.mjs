const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const RETRYABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestMethod(input, init) {
  if (init?.method) return String(init.method).toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function isRetryableFetchError(error, timedOut) {
  if (timedOut) return true;
  const code = error?.cause?.code || error?.code;
  if (RETRYABLE_NETWORK_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof TypeError && /^fetch failed\b/i.test(message.trim());
}

export function createRetryingSupabaseFetch({
  fetchImpl = globalThis.fetch,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('maxRetries must be a non-negative integer.');
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) throw new Error('retryDelayMs must be a non-negative number.');
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw new Error('requestTimeoutMs must be a positive number.');

  return async function retryingSupabaseFetch(input, init) {
    const method = requestMethod(input, init);
    let retryCount = 0;

    while (true) {
      const callerSignal = init?.signal
        ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
      if (callerSignal?.aborted) throw callerSignal.reason;

      const controller = new AbortController();
      const abortFromCaller = () => controller.abort(callerSignal.reason);
      callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        const timeoutError = new Error(`Supabase request timed out after ${requestTimeoutMs}ms.`);
        timeoutError.name = 'AbortError';
        controller.abort(timeoutError);
      }, requestTimeoutMs);

      let response;
      try {
        response = await fetchImpl(input, { ...init, signal: controller.signal });
      } catch (error) {
        if (
          !isRetryableFetchError(error, timedOut)
          || callerSignal?.aborted
          || !RETRYABLE_METHODS.has(method)
          || retryCount >= maxRetries
        ) {
          throw error;
        }
        await sleep(retryDelayMs * (2 ** retryCount));
        retryCount += 1;
        continue;
      } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', abortFromCaller);
      }

      if (
        !RETRYABLE_STATUSES.has(response.status)
        || !RETRYABLE_METHODS.has(method)
        || retryCount >= maxRetries
      ) {
        return response;
      }

      if (response.body) await response.body.cancel();
      await sleep(retryDelayMs * (2 ** retryCount));
      retryCount += 1;
    }
  };
}

export function summarizeSupabaseError(error) {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error);

  if (/\b522\b/i.test(raw) && /connection timed out/i.test(raw)) {
    return 'Supabase HTTP 522 (connection timed out)';
  }

  if (/<(?:!doctype|html|head|body)\b/i.test(raw)) {
    const title = raw.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return `Supabase returned an HTML error${title ? ` (${title.slice(0, 200)})` : ''}`;
  }

  return raw.replace(/\s+/g, ' ').trim().slice(0, 500) || 'unknown Supabase error';
}
