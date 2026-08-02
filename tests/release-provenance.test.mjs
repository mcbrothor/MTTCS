import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': new URL('..', import.meta.url).pathname } });
const { GET } = jiti('../app/api/release/route.ts');
const previousReleaseSha = process.env.MTN_RELEASE_SHA;
const previousVercelSha = process.env.VERCEL_GIT_COMMIT_SHA;

try {
  delete process.env.MTN_RELEASE_SHA;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  const unavailable = await GET();
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'RELEASE_SHA_UNAVAILABLE');
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');

  process.env.VERCEL_GIT_COMMIT_SHA = 'A'.repeat(40);
  const vercel = await GET();
  assert.equal(vercel.status, 200);
  assert.equal((await vercel.json()).gitSha, 'a'.repeat(40));

  process.env.MTN_RELEASE_SHA = 'b'.repeat(40);
  const explicit = await GET();
  assert.equal(explicit.status, 200);
  assert.equal((await explicit.json()).gitSha, 'b'.repeat(40));

  console.log('Release provenance tests passed');
} finally {
  if (previousReleaseSha === undefined) delete process.env.MTN_RELEASE_SHA;
  else process.env.MTN_RELEASE_SHA = previousReleaseSha;
  if (previousVercelSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = previousVercelSha;
}
