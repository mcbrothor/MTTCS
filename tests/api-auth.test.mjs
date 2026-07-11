import assert from 'node:assert/strict';
import { withAdminSession } from '../lib/auth/api.ts';

const previous = process.env.MTN_AUTH_ENABLED;
process.env.MTN_AUTH_ENABLED = 'true';

const guarded = withAdminSession(async (_request, _context, session) =>
  Response.json({ user: session.sub }),
);

const denied = await guarded(new Request('http://localhost/api/private'), undefined);
assert.equal(denied.status, 401);

process.env.MTN_AUTH_ENABLED = 'false';
const allowed = await guarded(new Request('http://localhost/api/private'), undefined);
assert.equal(allowed.status, 200);

if (previous === undefined) delete process.env.MTN_AUTH_ENABLED;
else process.env.MTN_AUTH_ENABLED = previous;

console.log('api auth wrapper tests passed');
