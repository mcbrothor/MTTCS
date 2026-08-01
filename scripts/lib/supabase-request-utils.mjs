import { lookup as dnsLookup } from 'node:dns/promises';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_DNS_MAX_ATTEMPTS = 8;
const DEFAULT_DNS_RETRY_DELAY_MS = 2_000;
const DEFAULT_DNS_MAX_RETRY_DELAY_MS = 15_000;
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const RETRYABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'EAI_FAIL',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(error) {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current.code === 'string' && current.code) return current.code;
    current = current.cause;
  }
  return '';
}

function requestHostname(input) {
  try {
    const raw = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
    return new URL(raw).hostname || 'Supabase';
  } catch {
    return 'Supabase';
  }
}

function createNetworkFailure(error, { attempts, elapsedMs, hostname, timedOut = false }) {
  const code = errorCode(error);
  const dnsFailure = ['EAI_AGAIN', 'EAI_FAIL', 'ENOTFOUND'].includes(code);
  const label = dnsFailure
    ? 'DNS lookup failed'
    : timedOut
      ? 'request timed out'
      : 'network request failed';
  const failure = new Error(
    `Supabase ${label}${code ? ` (${code})` : ''} for ${hostname} after ${attempts} attempts over ${elapsedMs}ms.`,
    { cause: error },
  );
  failure.name = 'SupabaseNetworkError';
  failure.code = code;
  failure.attempts = attempts;
  failure.elapsedMs = elapsedMs;
  failure.hostname = hostname;
  return failure;
}

export async function waitForSupabaseDns(supabaseUrl, {
  lookupImpl = dnsLookup,
  maxAttempts = DEFAULT_DNS_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_DNS_RETRY_DELAY_MS,
  maxRetryDelayMs = DEFAULT_DNS_MAX_RETRY_DELAY_MS,
  sleepImpl = sleep,
  randomImpl = Math.random,
  nowImpl = Date.now,
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('maxAttempts must be a positive integer.');
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) throw new Error('retryDelayMs must be a non-negative number.');
  if (!Number.isFinite(maxRetryDelayMs) || maxRetryDelayMs < 0) throw new Error('maxRetryDelayMs must be a non-negative number.');

  const hostname = new URL(supabaseUrl).hostname;
  if (!hostname) throw new Error('Supabase URL must include a hostname.');
  const startedAt = nowImpl();
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await lookupImpl(hostname, { all: true, verbatim: true });
      const addresses = Array.isArray(result) ? result : result ? [result] : [];
      if (addresses.length === 0) {
        const error = new Error(`DNS returned no addresses for ${hostname}.`);
        error.code = 'ENOTFOUND';
        throw error;
      }
      return {
        hostname,
        attempts: attempt,
        elapsedMs: Math.max(0, nowImpl() - startedAt),
      };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const baseDelayMs = Math.min(maxRetryDelayMs, retryDelayMs * (2 ** (attempt - 1)));
      const jitterFactor = 0.75 + (Math.max(0, Math.min(1, randomImpl())) * 0.5);
      await sleepImpl(Math.round(baseDelayMs * jitterFactor));
    }
  }

  throw createNetworkFailure(lastError, {
    attempts: maxAttempts,
    elapsedMs: Math.max(0, nowImpl() - startedAt),
    hostname,
  });
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
    const startedAt = Date.now();
    const hostname = requestHostname(input);

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
        const retryable = isRetryableFetchError(error, timedOut);
        if (
          !retryable
          || callerSignal?.aborted
          || !RETRYABLE_METHODS.has(method)
        ) {
          throw error;
        }
        if (retryCount >= maxRetries) {
          throw createNetworkFailure(error, {
            attempts: retryCount + 1,
            elapsedMs: Math.max(0, Date.now() - startedAt),
            hostname,
            timedOut,
          });
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
  const details = error && typeof error === 'object' && 'details' in error
    ? String(error.details || '')
    : '';

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

  const normalized = raw.replace(/\s+/g, ' ').trim();
  const cause = details.match(/Caused by:\s*([^\n]+)/i)?.[1]
    ?.replace(/\s+/g, ' ')
    .trim();
  if (cause && /fetch failed|network request failed|timed out/i.test(normalized)) {
    return `${normalized}; caused by ${cause}`.slice(0, 500);
  }

  return normalized.slice(0, 500) || 'unknown Supabase error';
}
