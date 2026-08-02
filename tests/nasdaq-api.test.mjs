import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const previousEnabled = process.env.MTN_AUTH_ENABLED;
const previousSecret = process.env.MTN_AUTH_SECRET;
process.env.MTN_AUTH_ENABLED = 'true';
process.env.MTN_AUTH_SECRET = 'nasdaq-api-test-secret';
if (!globalThis.WebSocket) globalThis.WebSocket = class TestWebSocket {};

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const strategy = jiti('../app/api/nasdaq/strategy/route.ts');
const history = jiti('../app/api/nasdaq/history/route.ts');
const settings = jiti('../app/api/nasdaq/settings/route.ts');
const snapshots = jiti('../app/api/nasdaq/snapshots/route.ts');
const products = jiti('../app/api/admin/nasdaq/products/route.ts');
const { parseNasdaqStrategyOverrides } = jiti('../lib/nasdaq/strategy-query.ts');
const { validateNasdaqSettingsPatch } = jiti('../lib/nasdaq/settings.ts');

assert.deepEqual(parseNasdaqStrategyOverrides('http://localhost/api/nasdaq/strategy'), {});
assert.deepEqual(
  parseNasdaqStrategyOverrides(
    'http://localhost/api/nasdaq/strategy?tacticalProduct=TQQQ&baseCurrency=USD',
  ),
  { tacticalProduct: 'TQQQ', baseCurrency: 'USD' },
);

for (const [route, url] of [
  [strategy, 'http://localhost/api/nasdaq/strategy'],
  [history, 'http://localhost/api/nasdaq/history?product=QQQ'],
  [settings, 'http://localhost/api/nasdaq/settings'],
  [snapshots, 'http://localhost/api/nasdaq/snapshots'],
  [products, 'http://localhost/api/admin/nasdaq/products'],
]) {
  const response = await route.GET(new Request(url));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
}

process.env.MTN_AUTH_ENABLED = 'false';
{
  const response = await strategy.GET(
    new Request('http://localhost/api/nasdaq/strategy?tacticalProduct=QQQ'),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_INPUT');
}
{
  const response = await history.GET(
    new Request('http://localhost/api/nasdaq/history?product=SPY'),
  );
  assert.equal(response.status, 400);
}
assert.throws(
  () => validateNasdaqSettingsPatch({ owner_id: 'attacker', tacticalProduct: 'QLD' }),
  /소유자/,
);
assert.throws(
  () => validateNasdaqSettingsPatch({ tacticalProduct: 'QQQ' }),
  /QLD 또는 TQQQ/,
);
assert.equal(
  validateNasdaqSettingsPatch({ manualAccountValue: 100_000_000 }).manualAccountValue,
  100_000_000,
);
assert.equal(
  validateNasdaqSettingsPatch({ manualAccountValue: null }).manualAccountValue,
  null,
);
assert.throws(
  () => validateNasdaqSettingsPatch({ manualAccountValue: 0 }),
  /양수 또는 null/,
);

if (previousEnabled === undefined) delete process.env.MTN_AUTH_ENABLED;
else process.env.MTN_AUTH_ENABLED = previousEnabled;
if (previousSecret === undefined) delete process.env.MTN_AUTH_SECRET;
else process.env.MTN_AUTH_SECRET = previousSecret;

console.log('nasdaq API auth and validation tests passed');
