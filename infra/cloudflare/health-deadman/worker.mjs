const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_REMINDER_SECONDS = 0;
const STATE_CACHE_SECONDS = 30 * 24 * 60 * 60;
const STATE_CACHE_URL = 'https://mtn-health-deadman.invalid/notification-state';
const STATUS_RANK = { HEALTHY: 0, DEGRADED: 1, FAILED: 2 };

function requireValue(env, name) {
  const value = String(env?.[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function compactFailure(health, reason) {
  const scheduler = health?.checks?.scheduler?.failedJobs || [];
  const missingJobs = health?.checks?.scheduler?.missingJobs || [];
  const invalidJobs = health?.checks?.scheduler?.invalidJobs || [];
  const unexpectedJobs = health?.checks?.scheduler?.unexpectedJobs || [];
  const missingWorkers = health?.checks?.workers?.missingComponents || [];
  const staleWorkers = health?.checks?.workers?.staleComponents || [];
  const failedWorkers = health?.checks?.workers?.failedComponents || [];
  const capacity = health?.checks?.capacity;
  const capacityUsedMiB = Number.isFinite(capacity?.usedBytes)
    ? (capacity.usedBytes / 1024 / 1024).toFixed(1)
    : null;
  const capacityBlockMiB = Number.isFinite(capacity?.blockBytes)
    ? (capacity.blockBytes / 1024 / 1024).toFixed(0)
    : null;
  return [
    `MTN infrastructure ${health?.status || 'FAILED'}`,
    reason === 'recovered' ? '복구: 감시 중인 모든 항목이 정상입니다.' : null,
    reason === 'reminder' ? '지속 장애 재알림: 이전 알림 이후 같은 장애가 유지 중입니다.' : null,
    scheduler.length ? `scheduler=${scheduler.join(',')}` : null,
    missingJobs.length ? `missing_job=${missingJobs.join(',')}` : null,
    invalidJobs.length ? `invalid_job=${invalidJobs.join(',')}` : null,
    unexpectedJobs.length ? `unexpected_job=${unexpectedJobs.join(',')}` : null,
    missingWorkers.length ? `missing_worker=${missingWorkers.join(',')}` : null,
    staleWorkers.length ? `stale_worker=${staleWorkers.join(',')}` : null,
    failedWorkers.length ? `failed_worker=${failedWorkers.join(',')}` : null,
    health?.checks?.endpoint ? `health_endpoint=${health.checks.endpoint.httpStatus || 'unreachable'}` : null,
    health?.dependencyErrors?.length
      ? `dependency=${health.dependencyErrors.map((entry) => entry.dependency).join(',')}` : null,
    health?.checks?.backup?.status && health.checks.backup.status !== 'HEALTHY'
      ? `backup=${health.checks.backup.status}${health.checks.backup.reason ? ` reason=${health.checks.backup.reason}` : ''}` : null,
    capacity?.status && capacity.status !== 'HEALTHY'
      ? `capacity=${capacity.status}${capacityUsedMiB ? ` used_mib=${capacityUsedMiB}` : ''}${capacityBlockMiB ? ` block_mib=${capacityBlockMiB}` : ''}${capacity.reason ? ` reason=${capacity.reason}` : ''}${capacity.capturedAt ? ` captured_at=${capacity.capturedAt}` : ''}`
      : null,
    `checked_at=${health?.checkedAt || new Date().toISOString()}`,
  ].filter(Boolean).join('\n').slice(0, 3500);
}

function problemLevels(health) {
  const problems = {};
  const checks = health.checks || {};
  const add = (prefix, values, severity) => {
    for (const value of values || []) problems[`${prefix}:${value}`] = Math.max(problems[`${prefix}:${value}`] || 0, severity);
  };
  for (const field of ['failedJobs', 'missingJobs', 'invalidJobs', 'unexpectedJobs', 'duplicateJobs']) {
    add(`scheduler:${field}`, checks.scheduler?.[field], 2);
  }
  for (const field of ['missingComponents', 'failedComponents', 'hardStaleComponents']) {
    add('worker', checks.workers?.[field], 2);
  }
  add('worker', checks.workers?.staleComponents, 1);
  for (const [component, value] of Object.entries(checks.workers?.latest || {})) {
    if (value?.status === 'STARTING') add('worker', [component], 1);
  }
  for (const key of ['backup', 'capacity', 'endpoint']) {
    const severity = STATUS_RANK[checks[key]?.status] || 0;
    if (severity) problems[checks[key]?.reason ? `${key}:${checks[key].reason}` : key] = severity;
  }
  add('dependency', health.dependencyErrors?.map((entry) => entry.dependency), 2);
  if (health.status !== 'HEALTHY' && !Object.keys(problems).length) {
    problems[`incident:${health.fingerprint || 'unknown'}`] = STATUS_RANK[health.status] || 2;
  }
  return problems;
}

function notificationReason(health, previous, problems, now, reminderSeconds) {
  if (health.status === 'HEALTHY') {
    return previous?.status && previous.status !== 'HEALTHY' ? 'recovered' : null;
  }
  if (!previous) return 'first_failure';
  if (previous.status === 'HEALTHY') return 'new_failure';
  // Migrate the old fingerprint-only ledger without repeating an unchanged incident.
  const legacyUnchanged = !previous.problems && previous.fingerprint === String(health.fingerprint || 'unknown');
  const previousProblems = { ...previous.problems };
  // Older ledgers stored only component severity. Baseline the newly available reason
  // once; severity escalation still alerts, and later reason changes remain distinct.
  for (const component of ['backup', 'capacity', 'endpoint']) {
    if (previousProblems[component] === undefined) continue;
    for (const key of Object.keys(problems)) {
      if (key.startsWith(`${component}:`)) previousProblems[key] = previousProblems[component];
    }
  }
  if (!legacyUnchanged && (STATUS_RANK[health.status] > (STATUS_RANK[previous.status] || 0)
    || Object.entries(problems).some(([key, severity]) => severity > (previousProblems[key] || 0)))) {
    return 'new_failure';
  }
  const previousAt = Date.parse(String(previous.notifiedAt || ''));
  if (reminderSeconds > 0 && Number.isFinite(previousAt) && now.getTime() - previousAt >= reminderSeconds * 1000) {
    return 'reminder';
  }
  return null;
}

function alertStateStore(env, options, cache) {
  if (options.alertState) return options.alertState;
  if (env.MTN_ALERT_STATE) {
    return {
      read: () => env.MTN_ALERT_STATE.get('notification-state', 'json'),
      write: (value) => env.MTN_ALERT_STATE.put('notification-state', JSON.stringify(value)),
    };
  }
  if (!cache) return null;
  const key = new Request(STATE_CACHE_URL);
  return {
    async read() {
      const saved = await cache.match(key);
      return saved ? saved.json() : null;
    },
    async write(value) {
      await cache.put(key, new Response(JSON.stringify(value), {
        headers: { 'cache-control': `public, max-age=${STATE_CACHE_SECONDS}`, 'content-type': 'application/json' },
      }));
    },
  };
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

async function sendTelegram(env, fetchImpl, health, reason, timeoutMs) {
  const botToken = requireValue(env, 'TELEGRAM_BOT_TOKEN');
  const chatId = requireValue(env, 'TELEGRAM_CHAT_ID');
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: compactFailure(health, reason) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) throw new Error(`Telegram notification failed with HTTP ${response.status}.`);
}

export async function runHealthCheck(env, options = {}) {
  const healthUrl = requireValue(env, 'MTN_HEALTH_URL');
  const healthToken = requireValue(env, 'MTN_HEALTH_TOKEN');
  const fetchImpl = options.fetchImpl || fetch;
  const cache = options.cache || globalThis.caches?.default;
  const configuredTimeout = Number(env.MTN_HEALTH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_TIMEOUT_MS;
  const configuredReminder = Number(env.MTN_ALERT_REMINDER_SECONDS ?? DEFAULT_REMINDER_SECONDS);
  const reminderSeconds = Number.isFinite(configuredReminder) && configuredReminder > 0
    ? Math.max(300, configuredReminder) : DEFAULT_REMINDER_SECONDS;
  const signal = typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
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

  const now = options.now ? options.now() : new Date();
  const notifiedAt = now instanceof Date ? now : new Date(now);
  const state = alertStateStore(env, options, cache);
  const previous = state ? await state.read() : null;
  const problems = problemLevels(health);
  const reason = notificationReason(health, previous, problems, notifiedAt, reminderSeconds);
  if (reason) await sendTelegram(env, fetchImpl, health, reason, timeoutMs);
  await state?.write({
    fingerprint: String(health.fingerprint || 'unknown'),
    status: health.status,
    problems,
    notifiedAt: reason ? notifiedAt.toISOString() : previous?.notifiedAt || null,
    observedAt: notifiedAt.toISOString(),
  });
  return { ...health, notified: Boolean(reason), notificationReason: reason };
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
