import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const previousSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = 'test-cron-secret';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { GET } = jiti('../app/api/cron/daily-screeners/route.ts');

{
  const response = await GET(new Request('http://localhost/api/cron/daily-screeners?dryRun=true'));
  assert.equal(response.status, 401);
}

{
  const response = await GET(new Request('http://localhost/api/cron/daily-screeners?dryRun=true&date=2026-06-12', {
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.dry_run, true);
  assert.equal(payload.queued, false);
  assert.equal(payload.run_date, '2026-06-12');
  assert.deepEqual(payload.scope.sources, ['minervini', 'canslim', 'leader', 'momentum', 'qullamaggie']);
  assert.deepEqual(payload.scope.universes, ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150']);
  assert.equal(payload.scope.max_per_universe, 40);
}

{
  const response = await GET(new Request('http://localhost/api/cron/daily-screeners?dryRun=true&date=bad-date', {
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
  assert.equal(response.status, 400);
}

{
  const response = await GET(new Request('http://localhost/api/cron/daily-screeners?dryRun=true&sources=momentum&universes=KOSDAQ150&force=true&date=2026-06-12', {
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.scope.sources, ['momentum']);
  assert.deepEqual(payload.scope.universes, ['KOSDAQ150']);
  assert.equal(payload.scope.force, true);
  assert.equal(payload.scope.max_per_universe, 40);
}

{
  const response = await GET(new Request('http://localhost/api/cron/daily-screeners?dryRun=true&maxPerUniverse=ALL&date=2026-06-12', {
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.scope.max_per_universe, null);
}

if (previousSecret === undefined) {
  delete process.env.CRON_SECRET;
} else {
  process.env.CRON_SECRET = previousSecret;
}

console.log('daily screener cron tests passed');
