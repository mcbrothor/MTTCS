import assert from 'node:assert/strict';
import { postBackupFailureEvidence } from '../scripts/lib/backup-failure-evidence.mjs';

const common = { url: 'https://example.test/rest/v1/operations_backup_runs', key: 'test-key', body: '[{"status":"FAILED"}]', retryMs: 0, attempts: 3, timeoutMs: 100 };
let calls = 0;
await postBackupFailureEvidence({ ...common, fetchFn: async (_url, options) => {
  calls += 1;
  assert.equal(options.body, common.body);
  assert.equal(options.headers.authorization, 'Bearer test-key');
  return new Response(null, { status: calls < 3 ? 522 : 201 });
} });
assert.equal(calls, 3, 'confirmed Cloudflare connection refusal must recover');
calls = 0;
await assert.rejects(postBackupFailureEvidence({ ...common, fetchFn: async () => {
  calls += 1;
  return new Response(null, { status: 522 });
} }), /HTTP 522/);
assert.equal(calls, 3, 'outage must stop after bounded retries');
for (const status of [400, 401, 500, 524]) {
  calls = 0;
  await assert.rejects(postBackupFailureEvidence({ ...common, fetchFn: async () => {
    calls += 1;
    return new Response(null, { status });
  } }), new RegExp(`HTTP ${status}`));
  assert.equal(calls, 1, 'other HTTP errors must not duplicate potentially accepted writes');
}
calls = 0;
await assert.rejects(postBackupFailureEvidence({ ...common, fetchFn: async () => {
  calls += 1;
  throw new Error('ambiguous socket failure');
} }), /ambiguous socket failure/);
assert.equal(calls, 1, 'uncertain transport failure must not replay non-idempotent ledger inserts');
await assert.rejects(postBackupFailureEvidence({ ...common, attempts: 0 }), /attempts/);
console.log('backup failure evidence tests passed');
