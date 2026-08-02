import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('..', import.meta.url).pathname },
});
const { isApiSessionBypassPath } = jiti('../proxy.ts');

assert.equal(isApiSessionBypassPath('/api/release'), true);
assert.equal(isApiSessionBypassPath('/api/internal/operations-health'), true);

assert.equal(isApiSessionBypassPath('/api/release/private'), false);
assert.equal(isApiSessionBypassPath('/api/internal/operations-health/admin'), false);
assert.equal(isApiSessionBypassPath('/api/internal/operations-health-check'), false);
assert.equal(isApiSessionBypassPath('/api/portfolio'), false);
assert.equal(isApiSessionBypassPath('/api/authentic'), false);
assert.equal(isApiSessionBypassPath('/api/telegram-webhook-evil'), false);

assert.equal(isApiSessionBypassPath('/api/cron/check-alerts'), true);
assert.equal(isApiSessionBypassPath('/api/internal/kis-rate-limit'), true);

console.log('proxy monitor bypass tests passed');
