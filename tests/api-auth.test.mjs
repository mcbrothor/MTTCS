import assert from 'node:assert/strict';
import { withAdminSession } from '../lib/auth/api.ts';
import { createInternalRequest } from '../lib/auth/session.ts';

const previous = process.env.MTN_AUTH_ENABLED;
const previousSecret = process.env.MTN_AUTH_SECRET;
process.env.MTN_AUTH_ENABLED = 'true';
process.env.MTN_AUTH_SECRET = 'test-auth-secret';

const guarded = withAdminSession(async (_request, _context, session) =>
  Response.json({ user: session.sub }),
);

const denied = await guarded(new Request('http://localhost/api/private'), undefined);
assert.equal(denied.status, 401);

const internal = await guarded(await createInternalRequest('http://localhost/api/private'), undefined);
assert.equal(internal.status, 200);
assert.deepEqual(await internal.json(), { user: 'mtn-internal' });

process.env.MTN_AUTH_ENABLED = 'false';
const allowed = await guarded(new Request('http://localhost/api/private'), undefined);
assert.equal(allowed.status, 200);

if (previous === undefined) delete process.env.MTN_AUTH_ENABLED;
else process.env.MTN_AUTH_ENABLED = previous;
if (previousSecret === undefined) delete process.env.MTN_AUTH_SECRET;
else process.env.MTN_AUTH_SECRET = previousSecret;

console.log('api auth wrapper tests passed');
