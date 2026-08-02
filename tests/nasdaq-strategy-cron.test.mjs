import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const previousSecret = process.env.CRON_SECRET;
delete process.env.CRON_SECRET;
if (!globalThis.WebSocket) globalThis.WebSocket = class TestWebSocket {};
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const cron = jiti('../app/api/cron/nasdaq-strategy/route.ts');

{
  const response = await cron.GET(
    new Request('http://localhost/api/cron/nasdaq-strategy?dryRun=true'),
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
}

process.env.CRON_SECRET = 'nasdaq-cron-test';
{
  const response = await cron.GET(
    new Request('http://localhost/api/cron/nasdaq-strategy?dryRun=maybe', {
      headers: { authorization: 'Bearer nasdaq-cron-test' },
    }),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_DRY_RUN');
}

if (previousSecret === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = previousSecret;

console.log('nasdaq cron auth tests passed');
