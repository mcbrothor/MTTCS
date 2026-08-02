import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';

const previousAuthEnabled = process.env.MTN_AUTH_ENABLED;
const previousAuthSecret = process.env.MTN_AUTH_SECRET;
process.env.MTN_AUTH_ENABLED = 'true';
process.env.MTN_AUTH_SECRET = 'gold-macro-admin-test-secret';

// Supabase 2.110 initializes its Realtime transport while the server module is
// imported. The repository calls exercised here never open a socket, but Node
// 20 needs a constructor present at import time (Node 22 provides one).
if (!globalThis.WebSocket) {
  globalThis.WebSocket = class TestWebSocket {};
}

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const route = jiti('../app/api/admin/gold/macro-inputs/route.ts');
const { validateGoldMacroInput } = jiti('../lib/gold/admin-input.ts');

{
  const response = await route.GET(
    new Request('http://localhost/api/admin/gold/macro-inputs'),
  );
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.code, 'AUTH_REQUIRED');
}

{
  const valid = validateGoldMacroInput({
    period: '2026-06',
    etfFlowUsdBillion: -8.9,
    holdingsChangeTonnes: -74,
    sourceUrl:
      'https://www.gold.org/goldhub/research/gold-etfs-holdings-and-flows/2026/07',
    centralBankDemandWeakening: false,
    note: 'Approved monthly aggregates only.',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.observationMonth, '2026-06-01');
  assert.equal(valid.value.etfNetFlowUsd, -8_900_000_000);
  assert.equal(valid.value.centralBankDemandStatus, 'STABLE');
}

for (const body of [
  {
    period: '2026-13',
    etfFlowUsdBillion: 1,
    holdingsChangeTonnes: 1,
    sourceUrl: 'https://www.gold.org/research',
    centralBankDemandWeakening: false,
  },
  {
    period: '2026-06',
    etfFlowUsdBillion: Number.POSITIVE_INFINITY,
    holdingsChangeTonnes: 1,
    sourceUrl: 'https://www.gold.org/research',
    centralBankDemandWeakening: false,
  },
  {
    period: '2026-06',
    etfFlowUsdBillion: 1,
    holdingsChangeTonnes: Number.NaN,
    sourceUrl: 'https://www.gold.org/research',
    centralBankDemandWeakening: false,
  },
  {
    period: '2026-06',
    etfFlowUsdBillion: 1,
    holdingsChangeTonnes: 1,
    sourceUrl: 'https://gold.org.example.com/research',
    centralBankDemandWeakening: false,
  },
  {
    period: '2026-06',
    etfFlowUsdBillion: 1,
    holdingsChangeTonnes: 1,
    sourceUrl: 'https://www.gold.org/research',
    centralBankDemandWeakening: false,
    user_id: 'attacker-controlled-owner',
  },
]) {
  assert.equal(validateGoldMacroInput(body).ok, false);
}

process.env.MTN_AUTH_ENABLED = 'false';

{
  const response = await route.PUT(
    new Request('http://localhost/api/admin/gold/macro-inputs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        period: 'bad-period',
        etfFlowUsdBillion: 1,
        holdingsChangeTonnes: 1,
        sourceUrl: 'https://www.gold.org/research',
        centralBankDemandWeakening: false,
      }),
    }),
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.code, 'INVALID_GOLD_MACRO_INPUT');
  assert.equal(payload.recoverable, true);
}

const routeSource = await readFile(
  new URL('../app/api/admin/gold/macro-inputs/route.ts', import.meta.url),
  'utf8',
);
assert.match(routeSource, /const session = await getRequestSession\(request\)/g);
assert.match(routeSource, /ownerId: session\.systemId/g);
assert.doesNotMatch(routeSource, /ownerId:\s*(?:body|input)\./);
assert.match(routeSource, /apiSuccess\(observation,/);
assert.match(routeSource, /apiError\(/);

const panelSource = await readFile(
  new URL('../components/admin/GoldMacroInputPanel.tsx', import.meta.url),
  'utf8',
);
assert.match(panelSource, /재배포 제한/);
assert.match(panelSource, /집계치/);
assert.match(panelSource, /maxLength=\{600\}/);

const adminPage = await readFile(
  new URL('../app/admin/page.tsx', import.meta.url),
  'utf8',
);
assert.match(adminPage, /import GoldMacroInputPanel/);
assert.match(adminPage, /<GoldMacroInputPanel \/>/);

if (previousAuthEnabled === undefined) delete process.env.MTN_AUTH_ENABLED;
else process.env.MTN_AUTH_ENABLED = previousAuthEnabled;
if (previousAuthSecret === undefined) delete process.env.MTN_AUTH_SECRET;
else process.env.MTN_AUTH_SECRET = previousAuthSecret;

console.log('gold macro admin tests passed');
