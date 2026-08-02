import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const previousAuthEnabled = process.env.MTN_AUTH_ENABLED;
const previousAuthSecret = process.env.MTN_AUTH_SECRET;
process.env.MTN_AUTH_ENABLED = 'true';
process.env.MTN_AUTH_SECRET = 'gold-api-test-secret';

if (!globalThis.WebSocket) {
  globalThis.WebSocket = class TestWebSocket {};
}

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const strategy = jiti('../app/api/gold/strategy/route.ts');
const { parseGoldStrategyOverrides } = jiti(
  '../lib/gold/strategy-query.ts',
);
const history = jiti('../app/api/gold/history/route.ts');
const settings = jiti('../app/api/gold/settings/route.ts');
const snapshots = jiti('../app/api/gold/snapshots/route.ts');

{
  assert.deepEqual(
    parseGoldStrategyOverrides(
      'http://localhost/api/gold/strategy',
    ),
    {},
  );
  assert.deepEqual(
    parseGoldStrategyOverrides(
      'http://localhost/api/gold/strategy?coreProduct=GLD&baseCurrency=USD',
    ),
    { coreProduct: 'GLD', baseCurrency: 'USD' },
  );
}

for (const [route, url] of [
  [strategy, 'http://localhost/api/gold/strategy'],
  [history, 'http://localhost/api/gold/history?product=GLD'],
  [settings, 'http://localhost/api/gold/settings'],
  [snapshots, 'http://localhost/api/gold/snapshots'],
]) {
  const response = await route.GET(new Request(url));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
}

process.env.MTN_AUTH_ENABLED = 'false';

{
  const response = await strategy.GET(
    new Request('http://localhost/api/gold/strategy?coreProduct=XAUUSD'),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_INPUT');
}

{
  const response = await history.GET(
    new Request('http://localhost/api/gold/history?product=XAUUSD'),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_INPUT');
}

{
  const response = await snapshots.GET(
    new Request('http://localhost/api/gold/snapshots?product=XAUUSD'),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_INPUT');
}

{
  const response = await settings.PUT(
    new Request('http://localhost/api/gold/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        owner_id: 'attacker-owner',
        coreProduct: '411060',
      }),
    }),
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.code, 'INVALID_INPUT');
  assert.equal(payload.recoverable, true);
}

if (previousAuthEnabled === undefined) delete process.env.MTN_AUTH_ENABLED;
else process.env.MTN_AUTH_ENABLED = previousAuthEnabled;
if (previousAuthSecret === undefined) delete process.env.MTN_AUTH_SECRET;
else process.env.MTN_AUTH_SECRET = previousAuthSecret;

console.log('gold API auth and validation tests passed');
