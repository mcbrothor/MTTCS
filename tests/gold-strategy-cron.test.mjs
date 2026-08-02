import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';

const previousSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = 'gold-strategy-cron-test-secret';

// Supabase initializes a Realtime transport while its server module is loaded.
// These tests never open a socket; this only keeps Node 20 test runners importable.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = class TestWebSocket {};
}

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const { GET } = jiti('../app/api/cron/gold-strategy/route.ts');

{
  const response = await GET(
    new Request('http://localhost/api/cron/gold-strategy?dryRun=true'),
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
}

for (const value of ['1', 'yes', 'TRUE', '']) {
  const response = await GET(
    new Request(`http://localhost/api/cron/gold-strategy?dryRun=${value}`, {
      headers: {
        authorization: 'Bearer gold-strategy-cron-test-secret',
      },
    }),
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.code, 'INVALID_DRY_RUN');
}

{
  globalThis.__mtnGoldStrategyCronRunning = true;
  const response = await GET(
    new Request('http://localhost/api/cron/gold-strategy?dryRun=true', {
      headers: {
        authorization: 'Bearer gold-strategy-cron-test-secret',
      },
    }),
  );
  assert.equal(response.status, 409);
  assert.equal(
    (await response.json()).code,
    'GOLD_STRATEGY_ALREADY_RUNNING',
  );
  globalThis.__mtnGoldStrategyCronRunning = false;
}

const route = await readFile(
  new URL('../app/api/cron/gold-strategy/route.ts', import.meta.url),
  'utf8',
);
assert.match(route, /validateCronRequest\(request\)/);
assert.match(route, /buildGoldStrategyForOwner\(\{/);
assert.match(route, /ownerId: SYSTEM_ADMIN_ID/g);
assert.match(route, /quality === 'VALID' \? 'READY' : quality/);
assert.match(
  route,
  /upsertGoldStrategySnapshot\(\{[\s\S]*asOfDate,[\s\S]*coreProduct:[\s\S]*tacticalProduct:[\s\S]*inputHash:/,
);
assert.match(
  route,
  /onConflict|upsertGoldStrategySnapshot/,
);
assert.match(route, /from\('data_pipeline_runs'\)\.insert/);
assert.match(route, /status: 'FAILED'/);
assert.ok(
  route.indexOf('if (dryRun)') < route.indexOf('upsertGoldStrategySnapshot({'),
  'dry-run must return before the snapshot write',
);
assert.doesNotMatch(
  route,
  /placeOrder|executeOrder|sendOrder|trade_executions|brokerOrder/i,
);

const schedulerMigration = await readFile(
  new URL('../supabase/migrations/20260801133000_supabase_scheduler_control_plane.sql', import.meta.url),
  'utf8',
);
assert.match(
  schedulerMigration,
  /\('mtn-gold-strategy', '\/api\/cron\/gold-strategy\?dryRun=false', '30 23 \* \* \*'/,
);

if (previousSecret === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = previousSecret;

console.log('gold strategy cron tests passed');
