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
      async match(key) { return cache.get(String(key.url || key)) || undefined; },
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
      return response({ status: 'FAILED', fingerprint: 'incident-1' });
    },
    cache: {
      async match(key) { return cache.get(String(key.url || key)) || undefined; },
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
    MTN_ALERT_DEDUPE_SECONDS: '1800',
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

console.log('cloudflare health deadman tests passed');
