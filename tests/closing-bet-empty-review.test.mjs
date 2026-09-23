import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://closing-review.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';

const originalFetch = globalThis.fetch;
const requests = [];
const snapshot = {
  id: 'empty-final', tradeDate: '2026-01-02', market: 'KOSPI200',
  mode: 'LIVE', phase: 'FINAL', picks: [], reviewCandidates: [], candidates: [],
};
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  requests.push(url.pathname);
  if (url.pathname === '/rest/v1/closing_bet_snapshots') {
    return Response.json([{ payload: snapshot }]);
  }
  throw new Error('Empty reviews must not request calendars, prices, or delivery');
};

try {
  const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
  const { reviewClosingBet } = jiti('../lib/closing-bet/service.ts');
  for (const dryRun of [true, false]) {
    assert.deepEqual(await reviewClosingBet('KOSPI200', dryRun), {
      evaluated: 0, reason: '평가할 추천 종목 없음', delivery: null,
    });
  }
  assert.deepEqual(requests, ['/rest/v1/closing_bet_snapshots', '/rest/v1/closing_bet_snapshots']);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('closing empty review tests passed');
