import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';

const previousAuthEnabled = process.env.MTN_AUTH_ENABLED;
const previousAuthSecret = process.env.MTN_AUTH_SECRET;
const previousCronSecret = process.env.CRON_SECRET;
process.env.MTN_AUTH_ENABLED = 'true';
process.env.MTN_AUTH_SECRET = 'risk-barometer-api-test-secret';
process.env.CRON_SECRET = 'risk-barometer-cron-test-secret';
if (!globalThis.WebSocket) globalThis.WebSocket = class TestWebSocket {};

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const current = jiti('../app/api/risk-barometer/route.ts');
const history = jiti('../app/api/risk-barometer/history/route.ts');
const admin = jiti('../app/api/admin/risk-barometer/observations/route.ts');
const cron = jiti('../app/api/cron/risk-barometer/route.ts');
const { parseManualRiskObservation } = jiti('../lib/risk-barometer/admin-input.ts');

for (const [route, url] of [
  [current, 'http://localhost/api/risk-barometer?market=US'],
  [history, 'http://localhost/api/risk-barometer/history?days=30'],
  [admin, 'http://localhost/api/admin/risk-barometer/observations'],
]) {
  const response = await route.GET(new Request(url));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
}

{
  const response = await cron.GET(
    new Request('http://localhost/api/cron/risk-barometer?dryRun=true'),
  );
  assert.equal(response.status, 401);
}

for (const url of [
  'http://localhost/api/cron/risk-barometer?dryRun=yes',
  'http://localhost/api/cron/risk-barometer?dryRun=true&calcDate=2026-99-99',
]) {
  const response = await cron.GET(new Request(url, {
    headers: { authorization: 'Bearer risk-barometer-cron-test-secret' },
  }));
  assert.equal(response.status, 400);
}

{
  globalThis.__mtnRiskBarometerCronRunning = true;
  const response = await cron.GET(new Request(
    'http://localhost/api/cron/risk-barometer?dryRun=true&calcDate=2026-07-28',
    { headers: { authorization: 'Bearer risk-barometer-cron-test-secret' } },
  ));
  assert.equal(response.status, 409);
  globalThis.__mtnRiskBarometerCronRunning = false;
}

{
  const session = {
    sub: 'admin',
    exp: Number.MAX_SAFE_INTEGER,
    systemId: '00000000-0000-0000-0000-000000000000',
  };
  const parsed = parseManualRiskObservation({
    key: 'capital_market_frenzy',
    period: '2026-07-28',
    value: 0.8,
    unit: '%',
    sourceUrl: 'https://www.sifma.org/research/statistics',
    observedAt: '2026-07-28T00:00:00Z',
    note: 'Approved aggregate.',
  }, session);
  assert.equal(parsed.key, 'capital_market_frenzy');
  assert.equal(parsed.approvedBy, session.systemId);
  assert.throws(() => parseManualRiskObservation({
    ...parsed,
    sourceUrl: 'http://example.com',
  }, session), /https/);
  assert.throws(() => parseManualRiskObservation({
    ...parsed,
    note: 'x'.repeat(601),
  }, session), /600/);
  assert.throws(() => parseManualRiskObservation({
    ...parsed,
    sourceUrl: 'https://sifma.org.example.com/research',
  }, session), /도메인/);
}

const cronSource = await readFile(
  new URL('../app/api/cron/risk-barometer/route.ts', import.meta.url),
  'utf8',
);
assert.match(cronSource, /validateCronRequest\(request\)/);
assert.match(cronSource, /buildRiskBarometerSnapshot\(\{ client, calcDate \}\)/);
assert.match(cronSource, /const snapshot = dryRun[\s\S]*\? null[\s\S]*: await persistRiskBarometerSnapshot/);
assert.match(cronSource, /if \(!dryRun\) \{[\s\S]*recordPipelineRun/);
assert.doesNotMatch(cronSource, /placeOrder|executeOrder|sendOrder|trade_executions/i);

const schedulerMigration = await readFile(
  new URL('../supabase/migrations/20260801133000_supabase_scheduler_control_plane.sql', import.meta.url),
  'utf8',
);
assert.match(
  schedulerMigration,
  /\('mtn-risk-barometer', '\/api\/cron\/risk-barometer\?dryRun=false', '30 22 \* \* 1-5'/,
);

if (previousAuthEnabled === undefined) delete process.env.MTN_AUTH_ENABLED;
else process.env.MTN_AUTH_ENABLED = previousAuthEnabled;
if (previousAuthSecret === undefined) delete process.env.MTN_AUTH_SECRET;
else process.env.MTN_AUTH_SECRET = previousAuthSecret;
if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = previousCronSecret;

console.log('risk barometer API tests passed');
