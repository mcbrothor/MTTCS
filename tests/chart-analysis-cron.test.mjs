import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const previousSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = 'test-cron-secret';
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { GET } = jiti('../app/api/cron/chart-analysis/route.ts');
const { POST: marketDataPost } = jiti('../app/api/market-data/route.ts');

{
  const response = await marketDataPost(new Request('http://localhost/api/market-data?ticker=AAPL&exchange=NAS', {
    method: 'POST',
  }));
  assert.equal(response.status, 401);
}

{
  const response = await GET(new Request('http://localhost/api/cron/chart-analysis?ticker=AAPL&exchange=NAS'));
  assert.equal(response.status, 401);
}

{
  const response = await GET(new Request('http://localhost/api/cron/chart-analysis', { headers: { authorization: 'Bearer test-cron-secret' } }));
  assert.equal(response.status, 400);
}

{
  const response = await GET(new Request('http://localhost/api/cron/chart-analysis?ticker=BAD%20TICKER&exchange=NAS', {
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.code, 'INVALID_TICKER');
}

if (previousSecret === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = previousSecret;
console.log('chart analysis cron tests passed');
