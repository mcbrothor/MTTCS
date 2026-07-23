import assert from 'node:assert/strict';

import { isTradingSession } from '../scripts/lib/daily-recommendation-worker-utils.mjs';
import { evaluateDailyDeliveryHealth } from '../scripts/lib/daily-screener-watchdog-utils.mjs';

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

console.log('daily screener watchdog tests passed');
