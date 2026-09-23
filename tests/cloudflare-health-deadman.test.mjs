import assert from 'node:assert/strict';
import { runHealthCheck } from '../infra/cloudflare/health-deadman/worker.mjs';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

{
  const calls = [];
  const result = await runHealthCheck({
    MTN_HEALTH_URL: 'https://example.test/api/internal/health',
    MTN_HEALTH_TOKEN: 'monitor-token',
    TELEGRAM_BOT_TOKEN: 'telegram-token',
    TELEGRAM_CHAT_ID: '123',
  }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ status: 'HEALTHY', fingerprint: 'healthy' });
    },
  });
  assert.equal(result.status, 'HEALTHY');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.authorization, 'Bearer monitor-token');
}

{
  const calls = [];
  const cache = new Map();
  let notificationText = '';
  const result = await runHealthCheck({
    MTN_HEALTH_URL: 'https://example.test/api/internal/health',
    MTN_HEALTH_TOKEN: 'monitor-token',
    TELEGRAM_BOT_TOKEN: 'telegram-token',
    TELEGRAM_CHAT_ID: '123',
  }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (String(url).includes('api.telegram.org')) {
        notificationText = JSON.parse(init.body).text;
        return response({ ok: true });
      }
      return response({
        status: 'FAILED',
        fingerprint: 'incident-1',
        checks: { scheduler: { failedJobs: ['daily'], missingJobs: ['weekly'], invalidJobs: ['disabled'] } },
      }, 503);
    },
    cache: {
      async match(key) { return cache.get(String(key.url || key))?.clone(); },
      async put(key, value) { cache.set(String(key.url || key), value); },
    },
  });
  assert.equal(result.status, 'FAILED');
  assert.deepEqual(result.checks.scheduler.failedJobs, ['daily']);
  assert.match(notificationText, /missing_job=weekly/);
  assert.match(notificationText, /invalid_job=disabled/);
  assert.equal(result.notified, true);
  assert.equal(calls.filter((call) => String(call.url).includes('api.telegram.org')).length, 1);

  const duplicate = await runHealthCheck({
    MTN_HEALTH_URL: 'https://example.test/api/internal/health',
    MTN_HEALTH_TOKEN: 'monitor-token',
    TELEGRAM_BOT_TOKEN: 'telegram-token',
    TELEGRAM_CHAT_ID: '123',
  }, {
    fetchImpl: async (url) => {
      if (String(url).includes('api.telegram.org')) throw new Error('duplicate notification');
      return response({
        status: 'FAILED', fingerprint: 'incident-1',
        checks: { scheduler: { failedJobs: ['daily'], missingJobs: ['weekly'], invalidJobs: ['disabled'] } },
      });
    },
    cache: {
      async match(key) { return cache.get(String(key.url || key))?.clone(); },
      async put(key, value) { cache.set(String(key.url || key), value); },
    },
  });
  assert.equal(duplicate.notified, false);
}

{
  let state = null;
  let telegramCalls = 0;
  const env = {
    MTN_HEALTH_URL: 'https://example.test/api/internal/health',
    MTN_HEALTH_TOKEN: 'monitor-token',
    TELEGRAM_BOT_TOKEN: 'telegram-token',
    TELEGRAM_CHAT_ID: '123',
    MTN_ALERT_REMINDER_SECONDS: '0',
  };
  const options = {
    fetchImpl: async (url) => {
      if (String(url).includes('api.telegram.org')) {
        telegramCalls += 1;
        return response({ ok: true });
      }
      return response({ status: 'FAILED', fingerprint: 'stable-incident' }, 503);
    },
    now: () => new Date('2026-08-02T03:00:00.000Z'),
    alertState: {
      async read() { return state; },
      async write(next) { state = next; },
    },
  };
  const first = await runHealthCheck(env, options);
  const duplicate = await runHealthCheck(env, options);
  assert.equal(first.notified, true);
  assert.equal(duplicate.notified, false, 'persistent runner state must dedupe the same incident');
  assert.equal(telegramCalls, 1);
}

function monitorFixture(extraEnv = {}, initialState = null) {
  let state = initialState;
  let time = new Date('2026-09-14T00:00:00Z');
  let health;
  const messages = [];
  const env = {
    MTN_HEALTH_URL: 'https://example.test/health', MTN_HEALTH_TOKEN: 'monitor-token',
    TELEGRAM_BOT_TOKEN: 'telegram-token', TELEGRAM_CHAT_ID: '123', ...extraEnv,
  };
  const options = {
    fetchImpl: async (url, init) => {
      if (String(url).includes('api.telegram.org')) {
        messages.push(JSON.parse(init.body).text);
        return response({ ok: true });
      }
      return response(health, health.status === 'FAILED' ? 503 : 200);
    },
    now: () => time,
    alertState: { async read() { return state; }, async write(next) { state = next; } },
  };
  return {
    messages, env, options,
    state: () => state,
    async check(nextHealth, hours = 0) {
      health = nextHealth;
      time = new Date(time.getTime() + hours * 3_600_000);
      return runHealthCheck(env, options);
    },
  };
}

const outage = (failedJobs, fingerprint = failedJobs.join(',')) => ({
  status: 'FAILED', fingerprint,
  checks: { scheduler: { status: 'FAILED', failedJobs } },
});

{
  const monitor = monitorFixture();
  assert.equal((await monitor.check(outage(['daily', 'weekly']))).notificationReason, 'first_failure');
  assert.equal((await monitor.check(outage(['daily', 'weekly']), 0.5)).notified, false, 'the next 30m run must stay quiet');
  assert.equal((await monitor.check(outage(['daily', 'weekly']), 48)).notified, false, 'unchanged incidents have no default reminder');
  assert.equal((await monitor.check(outage(['daily'], 'one-job-recovered'))).notified, false, 'partial recovery is not a new failure');
  assert.equal((await monitor.check(outage(['daily', 'weekly']))).notificationReason, 'new_failure', 'a failed job that recovered can recur');
  assert.equal((await monitor.check(outage(['daily', 'weekly', 'backup-job']))).notificationReason, 'new_failure');
  assert.equal((await monitor.check({ status: 'HEALTHY', fingerprint: 'healthy' })).notificationReason, 'recovered');
  assert.match(monitor.messages.at(-1), /복구/);
  assert.equal((await monitor.check({ status: 'HEALTHY', fingerprint: 'healthy' })).notified, false);
  assert.equal((await monitor.check(outage(['daily', 'weekly', 'backup-job']))).notificationReason, 'new_failure', 'same incident after recovery must notify immediately');
}

{
  const monitor = monitorFixture({ MTN_ALERT_REMINDER_SECONDS: '43200' });
  await monitor.check(outage(['daily']));
  assert.equal((await monitor.check(outage(['daily']), 11.5)).notified, false);
  assert.equal((await monitor.check(outage(['daily']), 0.5)).notificationReason, 'reminder');
  assert.equal((await monitor.check(outage(['daily']), 0.5)).notified, false);
  assert.equal(monitor.messages.length, 2);
}

{
  const monitor = monitorFixture();
  const capacity = (status, usedBytes) => ({
    status: 'FAILED', fingerprint: `daily-capacity-${status}`,
    checks: { scheduler: { failedJobs: ['daily'] }, capacity: { status, usedBytes } },
  });
  await monitor.check(capacity('DEGRADED', 260));
  assert.equal((await monitor.check(capacity('DEGRADED', 261), 0.5)).notified, false, 'measurement drift must not trigger a new incident');
  assert.equal((await monitor.check(capacity('FAILED', 400))).notificationReason, 'new_failure', 'a component worsening must notify even while overall status is already FAILED');
  assert.equal((await monitor.check(capacity('DEGRADED', 300))).notified, false);
}

{
  const monitor = monitorFixture({}, { fingerprint: 'daily', notifiedAt: '2026-09-13T23:00:00Z' });
  assert.equal((await monitor.check(outage(['daily']))).notified, false, 'old dedupe files migrate without repeating an unchanged failure');
  assert.equal(monitor.state().status, 'FAILED');
  assert.deepEqual(monitor.state().problems, { 'scheduler:failedJobs:daily': 2 });
}

{
  const monitor = monitorFixture();
  monitor.options.alertState.read = async () => { throw new Error('state storage unavailable'); };
  await assert.rejects(monitor.check(outage(['daily'])), /state storage unavailable/);
  assert.equal(monitor.messages.length, 0, 'unreadable state must not turn every run into a first incident');
}

{
  const monitor = monitorFixture();
  const fetchHealth = monitor.options.fetchImpl;
  monitor.options.fetchImpl = async (url, init) => String(url).includes('api.telegram.org')
    ? response({ ok: false, description: 'rejected' }) : fetchHealth(url, init);
  await assert.rejects(monitor.check(outage(['daily'])), /Telegram notification failed/);
  assert.equal(monitor.state(), null, 'an unsuccessful Telegram response must not mark the incident as notified');
}

{
  const monitor = monitorFixture();
  const values = new Map();
  delete monitor.options.alertState;
  monitor.env.MTN_ALERT_STATE = {
    async get(key) { return values.has(key) ? JSON.parse(values.get(key)) : null; },
    async put(key, value) { values.set(key, value); },
  };
  await monitor.check(outage(['daily']));
  assert.equal((await monitor.check(outage(['daily']), 24)).notified, false, 'KV state supports scheduled workers across cache lifetimes');
  assert.equal((await monitor.check({ status: 'HEALTHY', fingerprint: 'healthy' })).notificationReason, 'recovered');
}

for (const [component, firstReason, nextReason] of [
  ['capacity', 'STALE', 'BLOCKED'],
  ['backup', 'STALE', 'FAILED_RUN'],
]) {
  const monitor = monitorFixture();
  const failure = (reason, ageSeconds = 1, usedBytes = 1) => ({
    status: 'FAILED', fingerprint: `${component}-${reason}`,
    checks: { [component]: { status: 'FAILED', reason, ageSeconds, usedBytes } },
  });
  await monitor.check(failure(firstReason));
  assert.equal((await monitor.check(failure(firstReason, 3600, 2), 0.5)).notified, false, `${component} age and usage changes stay quiet`);
  assert.equal((await monitor.check(failure(nextReason))).notificationReason, 'new_failure', `${component} cause changes must alert at the same severity`);
  assert.match(monitor.messages.at(-1), new RegExp(`reason=${nextReason}`));
  assert.equal((await monitor.check(failure(nextReason, 7200, 3), 0.5)).notified, false);
  const legacy = monitorFixture({}, {
    status: 'FAILED', fingerprint: 'legacy', problems: { [component]: 2 }, notifiedAt: '2026-09-13T23:00:00Z',
  });
  assert.equal((await legacy.check(failure(firstReason))).notified, false, 'adding reason detail to a legacy state must not repeat an unchanged component failure');
  assert.equal((await legacy.check(failure(nextReason))).notificationReason, 'new_failure');
}

{
  const monitor = monitorFixture({}, {
    status: 'FAILED', fingerprint: 'legacy', problems: { capacity: 1 }, notifiedAt: '2026-09-13T23:00:00Z',
  });
  const result = await monitor.check({ status: 'FAILED', fingerprint: 'blocked', checks: { capacity: { status: 'FAILED', reason: 'BLOCKED' } } });
  assert.equal(result.notificationReason, 'new_failure', 'legacy reason migration must preserve severity escalation');
}

console.log('cloudflare health deadman tests passed');
