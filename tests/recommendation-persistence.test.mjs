import assert from 'node:assert/strict';
import { initialTelegramDelivery } from '../lib/recommendations/persistence.ts';

const sentAt = '2026-06-19T12:15:49.495Z';

assert.deepEqual(initialTelegramDelivery(sentAt), {
  telegram_status: 'SENT',
  telegram_sent_at: sentAt,
});

assert.deepEqual(initialTelegramDelivery(null), {
  telegram_status: 'PENDING',
  telegram_sent_at: null,
});

console.log('recommendation persistence tests passed');
