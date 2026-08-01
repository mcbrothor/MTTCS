import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';

const migrationNames = await readdir(new URL('../supabase/migrations/', import.meta.url));
const migrationName = migrationNames.find((name) => name.endsWith('_kis_rate_limit_coordinator.sql'));

assert.ok(migrationName, 'KIS 공유 제한기 migration이 필요합니다.');

const migration = await readFile(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  'utf8'
);
assert.match(migration, /create table(?: if not exists)? public\.provider_rate_limit_slots/i);
assert.match(migration, /create or replace function public\.reserve_provider_rate_limit_slot/i);
assert.match(migration, /on conflict \(limiter_key\)[\s\S]*do update/i);
assert.doesNotMatch(migration, /for update/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on function[\s\S]*from public/i);
assert.match(migration, /grant execute on function[\s\S]*to service_role/i);

const limiter = await readFile(
  new URL('../lib/finance/providers/kis-rate-limit.ts', import.meta.url),
  'utf8'
);
assert.match(limiter, /reserve_provider_rate_limit_slot/);
assert.match(limiter, /createHash\(['"]sha256['"]\)/);
assert.match(limiter, /KIS_DISTRIBUTED_RATE_LIMIT_RETRY_MS/);
assert.match(limiter, /distributedOnly/);

const route = await readFile(
  new URL('../app/api/internal/kis-rate-limit/route.ts', import.meta.url),
  'utf8'
);
assert.match(route, /validateKisCoordinatorRequest/);
assert.match(route, /KIS_RATE_LIMIT_COORDINATOR_SECRET/);
assert.match(route, /scope !== 'rest'[\s\S]*scope !== 'token'/);
assert.match(route, /distributedOnly:\s*true/);

const coordinatorAuth = await readFile(
  new URL('../lib/auth/kis-coordinator.ts', import.meta.url),
  'utf8'
);
assert.match(coordinatorAuth, /secretsMatch/);

process.env.NEXT_PHASE = 'phase-production-build';
process.env.KIS_APP_KEY = 'test-app-key';
process.env.KIS_APP_SECRET = 'test-app-secret';
process.env.KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
process.env.KIS_DISTRIBUTED_RATE_LIMIT_ENABLED = 'false';
process.env.KIS_REQUEST_INTERVAL_MS = '120';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const rateLimiter = jiti('../lib/finance/providers/kis-rate-limit.ts');
const key = rateLimiter.kisRateLimiterKey('rest', process.env.KIS_BASE_URL, 'test-app-key');
assert.match(key, /^kis:rest:[0-9a-f]{64}$/);
assert.equal(key.includes('test-app-key'), false);

const first = await rateLimiter.reserveKisRequestSlot('rest');
const second = await rateLimiter.reserveKisRequestSlot('rest');
assert.equal(first.mode, 'local');
assert.equal(second.mode, 'local');
assert.ok(second.reservedAt >= first.reservedAt + 120);

process.env.KIS_RATE_LIMIT_COORDINATOR_SECRET = 'expected-secret';
const coordinatorRoute = jiti('../app/api/internal/kis-rate-limit/route.ts');
const unauthorized = await coordinatorRoute.POST(new Request('http://localhost/api/internal/kis-rate-limit', {
  method: 'POST',
  headers: { authorization: 'Bearer wrong-secret', 'content-type': 'application/json' },
  body: JSON.stringify({ scope: 'rest' }),
}));
assert.equal(unauthorized.status, 401);
