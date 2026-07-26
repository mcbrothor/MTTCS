import assert from 'node:assert/strict';

import { isTradingSession } from '../scripts/lib/daily-recommendation-worker-utils.mjs';
import { evaluateDailyDeliveryHealth } from '../scripts/lib/daily-screener-watchdog-utils.mjs';
import {
  createRetryingSupabaseFetch,
  summarizeSupabaseError,
} from '../scripts/lib/supabase-request-utils.mjs';

const now = Date.parse('2026-07-23T10:15:00.000Z');

assert.deepEqual(evaluateDailyDeliveryHealth({ run: null, publications: [], now, deliveryOverdue: false }), {
  healthy: false,
  reason: 'daily run is missing',
  actions: ['enqueue', 'kick_worker'],
});

assert.deepEqual(evaluateDailyDeliveryHealth({ run: null, publications: [], now, deliveryOverdue: true }), {
  healthy: false,
  reason: 'daily run is missing',
  actions: ['enqueue', 'kick_worker', 'alert'],
});

assert.deepEqual(evaluateDailyDeliveryHealth({
  run: { status: 'processing', updated_at: '2026-07-23T09:00:00.000Z', telegram_sent_at: null },
  publications: [],
  now,
  staleAfterMs: 30 * 60_000,
}), {
  healthy: false,
  reason: 'daily run is stale in processing',
  actions: ['requeue', 'kick_worker', 'alert'],
});

assert.deepEqual(evaluateDailyDeliveryHealth({
  run: { status: 'processing', updated_at: '2026-07-23T10:00:00.000Z', telegram_sent_at: null },
  publications: [],
  now,
  deliveryOverdue: true,
}), {
  healthy: false,
  reason: 'daily run is still processing past delivery deadline',
  actions: ['alert'],
});

assert.deepEqual(evaluateDailyDeliveryHealth({
  run: { status: 'failed', scope: { watchdog_retry_count: 2 }, error_summary: 'original failure overwrote the marker' },
  publications: [],
  now,
}), {
  healthy: false,
  reason: 'daily run failed after 2 watchdog retries',
  actions: ['alert'],
});

assert.deepEqual(evaluateDailyDeliveryHealth({
  run: { status: 'completed', scope: { watchdog_retry_count: 2 }, updated_at: '2026-07-23T10:00:00.000Z' },
  publications: [{ category: 'NASDAQ100', telegram_status: 'SENT' }],
  expectedCategories: ['NASDAQ100', 'SP500'],
  now,
}), {
  healthy: false,
  reason: 'official publications remain incomplete after 2 watchdog retries (1/2)',
  actions: ['alert'],
});

assert.deepEqual(evaluateDailyDeliveryHealth({
  run: { status: 'completed', updated_at: '2026-07-23T10:00:00.000Z', telegram_sent_at: null },
  publications: [
    { category: 'NASDAQ100', telegram_status: 'SENT' },
    { category: 'SP500', telegram_status: 'PENDING' },
  ],
  now,
}), {
  healthy: false,
  reason: 'official telegram delivery is incomplete (1/2)',
  actions: ['kick_worker', 'alert'],
});

assert.deepEqual(evaluateDailyDeliveryHealth({
  run: { status: 'completed', updated_at: '2026-07-23T10:00:00.000Z', telegram_sent_at: '2026-07-23T10:05:00.000Z' },
  publications: [
    { category: 'NASDAQ100', telegram_status: 'SENT' },
    { category: 'SP500', telegram_status: 'SENT' },
  ],
  now,
}), {
  healthy: true,
  reason: 'official telegram delivery completed (2/2)',
  actions: [],
});

assert.deepEqual(evaluateDailyDeliveryHealth({
  run: { status: 'completed', updated_at: '2026-07-23T10:00:00.000Z', telegram_sent_at: null },
  publications: [
    { category: 'NASDAQ100', telegram_status: 'SENT' },
    { category: 'SP500', telegram_status: 'SENT' },
  ],
  expectedCategories: ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'],
  now,
}), {
  healthy: false,
  reason: 'official publications are incomplete (2/4)',
  actions: ['requeue', 'kick_worker', 'alert'],
});

assert.equal(isTradingSession(['2026-07-21', '2026-07-22'], '2026-07-22'), true);
assert.equal(isTradingSession(['2026-07-21', '2026-07-22'], '2026-07-23'), false);

{
  const statuses = [522, 200];
  const attempts = [];
  const retryingFetch = createRetryingSupabaseFetch({
    fetchImpl: async (_input, init) => {
      attempts.push(init?.method || 'GET');
      const status = statuses.shift();
      return new Response(status === 200 ? '{"data":true}' : '<title>supabase.co | 522: Connection timed out</title>', { status });
    },
    retryDelayMs: 0,
  });

  const response = await retryingFetch('https://example.supabase.co/rest/v1/runs', { method: 'GET' });
  assert.equal(response.status, 200);
  assert.deepEqual(attempts, ['GET', 'GET']);
}

{
  let attempts = 0;
  const retryingFetch = createRetryingSupabaseFetch({
    fetchImpl: async () => {
      attempts += 1;
      return new Response('bad request', { status: 400 });
    },
    retryDelayMs: 0,
  });

  const response = await retryingFetch('https://example.supabase.co/rest/v1/runs', { method: 'GET' });
  assert.equal(response.status, 400);
  assert.equal(attempts, 1);
}

{
  let attempts = 0;
  const retryingFetch = createRetryingSupabaseFetch({
    fetchImpl: async (_input, init) => {
      attempts += 1;
      if (attempts > 1) return new Response('{"data":true}', { status: 200 });
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    },
    maxRetries: 1,
    retryDelayMs: 0,
    requestTimeoutMs: 5,
  });

  const response = await retryingFetch('https://example.supabase.co/rest/v1/runs', { method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
}

{
  let attempts = 0;
  const retryingFetch = createRetryingSupabaseFetch({
    fetchImpl: async () => {
      attempts += 1;
      if (attempts > 1) return new Response('{"data":true}', { status: 200 });
      const error = new TypeError('fetch failed');
      error.cause = { code: 'ECONNRESET' };
      throw error;
    },
    maxRetries: 1,
    retryDelayMs: 0,
  });

  const response = await retryingFetch('https://example.supabase.co/rest/v1/runs', { method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
}

{
  const statuses = [503, 200];
  let attempts = 0;
  const retryingFetch = createRetryingSupabaseFetch({
    fetchImpl: async () => {
      attempts += 1;
      return new Response('temporary', { status: statuses.shift() });
    },
    maxRetries: 1,
    retryDelayMs: 0,
  });

  const response = await retryingFetch('https://example.supabase.co/rest/v1/runs', { method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
}

{
  let attempts = 0;
  const retryingFetch = createRetryingSupabaseFetch({
    fetchImpl: async () => {
      attempts += 1;
      throw new TypeError('Invalid URL');
    },
    maxRetries: 3,
    retryDelayMs: 0,
  });

  await assert.rejects(
    retryingFetch('not-a-url', { method: 'GET' }),
    /Invalid URL/,
  );
  assert.equal(attempts, 1);
}

{
  let attempts = 0;
  const controller = new AbortController();
  controller.abort(new Error('caller cancelled'));
  const request = new Request('https://example.supabase.co/rest/v1/runs', {
    method: 'GET',
    signal: controller.signal,
  });
  const retryingFetch = createRetryingSupabaseFetch({
    fetchImpl: async () => {
      attempts += 1;
      return new Response('unexpected', { status: 200 });
    },
    retryDelayMs: 0,
  });

  await assert.rejects(retryingFetch(request), /caller cancelled/);
  assert.equal(attempts, 0);
}

assert.equal(
  summarizeSupabaseError({
    message: '<!DOCTYPE html><html><head><title>supabase.co | 522: Connection timed out</title></head></html>',
  }),
  'Supabase HTTP 522 (connection timed out)',
);

console.log('daily screener watchdog tests passed');
