import assert from 'node:assert/strict';
import { initialTelegramDelivery, pickCandidateSnapshot } from '../lib/recommendations/persistence.ts';

const sentAt = '2026-06-19T12:15:49.495Z';

assert.deepEqual(initialTelegramDelivery(sentAt), {
  telegram_status: 'SENT',
  telegram_sent_at: sentAt,
});

assert.deepEqual(initialTelegramDelivery(null), {
  telegram_status: 'PENDING',
  telegram_sent_at: null,
});

const snapshot = pickCandidateSnapshot({
  rank: 1,
  market: 'KR',
  ticker: '005930',
  name: '삼성전자',
  universe: 'KOSPI200',
  score: 90,
  grade: 'A',
  source: 'mixed',
  reason: 'test',
  confidence: 0.8,
}, [{
  source: 'leader',
  universe: 'KOSPI200',
  ticker: '005930',
  exchange: 'KOSPI',
  name: '삼성전자',
  score: 90,
  grade: 'A',
  price: 80000,
  priceAsOf: '2026-06-22',
  reason: 'test',
  metrics: {},
  raw: {},
}], {
  investor_flow: { as_of_date: '2026-06-22', provider: 'KIS', quality: 'FULL' },
});
assert.equal(snapshot.snapshot.investor_flow.provider, 'KIS');
assert.equal(snapshot.snapshot.investor_flow.as_of_date, '2026-06-22');

console.log('recommendation persistence tests passed');
