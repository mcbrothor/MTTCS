import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const {
  canPromoteShadowPublication,
  canReplaceIncompleteOfficial,
  initialTelegramDelivery,
  preservedTelegramDelivery,
  shouldPreservePublishedPublication,
  shouldPreserveSentPublication,
  pickCandidateSnapshot,
} = jiti('../lib/recommendations/persistence.ts');

const sentAt = '2026-06-19T12:15:49.495Z';

assert.deepEqual(initialTelegramDelivery(sentAt), {
  telegram_status: 'SENT',
  telegram_sent_at: sentAt,
});

assert.deepEqual(initialTelegramDelivery(null), {
  telegram_status: 'PENDING',
  telegram_sent_at: null,
});

assert.deepEqual(preservedTelegramDelivery('SENT', sentAt), {
  telegram_status: 'SENT',
  telegram_sent_at: sentAt,
});

assert.deepEqual(preservedTelegramDelivery('FAILED', null), {
  telegram_status: 'PENDING',
  telegram_sent_at: null,
});

assert.equal(shouldPreserveSentPublication(true, 'SENT'), true);
assert.equal(shouldPreserveSentPublication(false, 'SENT'), false);
assert.equal(shouldPreserveSentPublication(true, 'FAILED'), false);
assert.equal(shouldPreservePublishedPublication(true, 'PUBLISHED'), true);
assert.equal(shouldPreservePublishedPublication(true, 'FAILED'), false);
assert.equal(shouldPreservePublishedPublication(false, 'SHADOW'), true);
assert.equal(shouldPreservePublishedPublication(false, 'PUBLISHED'), false);
assert.equal(canPromoteShadowPublication(false, true, 'SHADOW'), true);
assert.equal(canPromoteShadowPublication(false, true, 'FAILED'), false);
assert.equal(canPromoteShadowPublication(true, false, 'PUBLISHED'), false);
assert.equal(canReplaceIncompleteOfficial('FAILED'), true);
assert.equal(canReplaceIncompleteOfficial('DRAFT'), true);
assert.equal(canReplaceIncompleteOfficial('PUBLISHED'), false);

const snapshot = pickCandidateSnapshot({
  rank: 1,
  category: 'KOSPI200',
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
