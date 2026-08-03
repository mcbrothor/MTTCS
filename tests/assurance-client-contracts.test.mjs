import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { isRecommendationDecisionAppendResponse } = jiti('../lib/assurance/client-contracts.ts');

function response(decisionCode = 'WATCH') {
  return {
    data: {
      action: 'RECORD_DECISION',
      result: {
        id: '90000000-0000-4000-8000-000000000003',
        decision_hash: 'f'.repeat(64),
        pick_id: 'pick-1',
        decision_code: decisionCode,
        decided_at: '2026-08-03T00:00:00.000Z',
      },
    },
    meta: {
      asOf: '2026-08-03T00:00:00.000Z',
      source: 'MTN assurance decision ledger',
      provider: 'Supabase',
      delay: 'REALTIME',
      fallbackUsed: false,
      warnings: [],
    },
  };
}

test('decision append response accepts the exact submitted decision contract', () => {
  assert.equal(isRecommendationDecisionAppendResponse(response(), 'pick-1', 'WATCH'), true);
});

test('decision append response rejects a valid but different decision code', () => {
  assert.equal(isRecommendationDecisionAppendResponse(response('ACCEPT'), 'pick-1', 'WATCH'), false);
});

test('decision append response rejects missing metadata and extra result fields', () => {
  const missingMeta = response();
  delete missingMeta.meta;
  assert.equal(isRecommendationDecisionAppendResponse(missingMeta, 'pick-1', 'WATCH'), false);
  assert.equal(isRecommendationDecisionAppendResponse({
    ...response(),
    data: {
      ...response().data,
      result: { ...response().data.result, capital_authorized: true },
    },
  }, 'pick-1', 'WATCH'), false);
});
