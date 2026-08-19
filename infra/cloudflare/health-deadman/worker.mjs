const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DEDUPE_SECONDS = 30 * 60;

function requireValue(env, name) {
  const value = String(env?.[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function compactFailure(health) {
  const scheduler = health?.checks?.scheduler?.failedJobs || [];
  const missingJobs = health?.checks?.scheduler?.missingJobs || [];
  const invalidJobs = health?.checks?.scheduler?.invalidJobs || [];
  const unexpectedJobs = health?.checks?.scheduler?.unexpectedJobs || [];
  const missingWorkers = health?.checks?.workers?.missingComponents || [];
  const staleWorkers = health?.checks?.workers?.staleComponents || [];
  const capacity = health?.checks?.capacity;
  const capacityUsedMiB = Number.isFinite(capacity?.usedBytes)
    ? (capacity.usedBytes / 1024 / 1024).toFixed(1)
    : null;
  const capacityBlockMiB = Number.isFinite(capacity?.blockBytes)
    ? (capacity.blockBytes / 1024 / 1024).toFixed(0)
    : null;
  return [
    `MTN infrastructure ${health?.status || 'FAILED'}`,
    scheduler.length ? `scheduler=${scheduler.join(',')}` : null,
    missingJobs.length ? `missing_job=${missingJobs.join(',')}` : null,
    invalidJobs.length ? `invalid_job=${invalidJobs.join(',')}` : null,
    unexpectedJobs.length ? `unexpected_job=${unexpectedJobs.join(',')}` : null,
    missingWorkers.length ? `missing_worker=${missingWorkers.join(',')}` : null,
    staleWorkers.length ? `stale_worker=${staleWorkers.join(',')}` : null,
    health?.checks?.backup?.status && health.checks.backup.status !== 'HEALTHY'
      ? `backup=${health.checks.backup.status}` : null,
    capacity?.status && capacity.status !== 'HEALTHY'
      ? `capacity=${capacity.status}${capacityUsedMiB ? ` used_mib=${capacityUsedMiB}` : ''}${capacityBlockMiB ? ` block_mib=${capacityBlockMiB}` : ''}${capacity.capturedAt ? ` captured_at=${capacity.capturedAt}` : ''}`
      : null,
    `checked_at=${health?.checkedAt || new Date().toISOString()}`,
  ].filter(Boolean).join('\n').slice(0, 3500);
}

async function parseHealthResponse(response) {
  const body = await response.json().catch(() => null);
  if (!body || typeof body.status !== 'string') {
    return {
      status: 'FAILED',
      fingerprint: `health-http-${response.status}`,
      checkedAt: new Date().toISOString(),
      checks: { endpoint: { status: 'FAILED', httpStatus: response.status } },
    };
  }
  return body;
}

async function sendTelegram(env, fetchImpl, health) {
  const botToken = requireValue(env, 'TELEGRAM_BOT_TOKEN');
  const chatId = requireValue(env, 'TELEGRAM_CHAT_ID');
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: compactFailure(health) }),
  });
  if (!response.ok) throw new Error(`Telegram notification failed with HTTP ${response.status}.`);
}

export async function runHealthCheck(env, options = {}) {
  const healthUrl = requireValue(env, 'MTN_HEALTH_URL');
  const healthToken = requireValue(env, 'MTN_HEALTH_TOKEN');
  const fetchImpl = options.fetchImpl || fetch;
  const cache = options.cache || globalThis.caches?.default;
  const timeoutMs = Number(env.MTN_HEALTH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const dedupeSeconds = Math.max(300, Number(env.MTN_ALERT_DEDUPE_SECONDS || DEFAULT_DEDUPE_SECONDS));
  const signal = typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS)
    : undefined;
  let health;
  try {
    const response = await fetchImpl(healthUrl, {
      headers: { authorization: `Bearer ${healthToken}`, accept: 'application/json' },
      signal,
    });
    health = await parseHealthResponse(response);
  } catch (error) {
    health = {
      status: 'FAILED',
      fingerprint: 'health-endpoint-unreachable',
      checkedAt: new Date().toISOString(),
      checks: { endpoint: { status: 'FAILED', error: error instanceof Error ? error.message : String(error) } },
    };
  }

  if (health.status === 'HEALTHY') return { ...health, notified: false };

  const alertFingerprint = encodeURIComponent(String(health.fingerprint || 'unknown'));
  const cacheKey = new Request(`https://mtn-health-deadman.invalid/incidents/${alertFingerprint}`);
  if (cache && await cache.match(cacheKey)) return { ...health, notified: false };
  const now = options.now ? options.now() : new Date();
  const notifiedAt = now instanceof Date ? now : new Date(now);
  if (options.alertState) {
    const previous = await options.alertState.read().catch(() => null);
    const previousAt = Date.parse(String(previous?.notifiedAt || ''));
    if (previous?.fingerprint === String(health.fingerprint || 'unknown')
      && Number.isFinite(previousAt)
      && notifiedAt.getTime() - previousAt < dedupeSeconds * 1000) {
      return { ...health, notified: false };
    }
  }

  await sendTelegram(env, fetchImpl, health);
  if (cache) {
    await cache.put(cacheKey, new Response('sent', {
      headers: { 'cache-control': `public, max-age=${dedupeSeconds}` },
    }));
  }
  if (options.alertState) {
    await options.alertState.write({
      fingerprint: String(health.fingerprint || 'unknown'),
      notifiedAt: notifiedAt.toISOString(),
    });
  }
  return { ...health, notified: true };
}

const worker = {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runHealthCheck(env));
  },
  async fetch(_request, env) {
    const result = await runHealthCheck(env);
    return Response.json(result, { status: result.status === 'HEALTHY' ? 200 : 503 });
  },
};

export default worker;
