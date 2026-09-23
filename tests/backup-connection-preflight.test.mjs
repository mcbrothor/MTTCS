import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'mtn-backup-preflight-test-'));
try {
  const executable = join(directory, 'psql');
  const counter = join(directory, 'calls');
  writeFileSync(executable, `#!/bin/bash
count=$(cat "$TEST_COUNTER" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$TEST_COUNTER"
if [[ "$TEST_MODE" == "timeout" ]]; then exec sleep 5; fi
if [[ "$TEST_MODE" == "permanent" ]]; then echo 'FATAL: password authentication failed' >&2; exit 2; fi
if [[ "$count" -le "$TEST_FAILURES" ]]; then echo 'FATAL: (ECHECKOUTTIMEOUT) unable to check out connection' >&2; exit 2; fi
echo 1
`, { mode: 0o700 });
  function run(overrides = {}) {
    rmSync(counter, { force: true });
    const result = spawnSync(process.execPath, ['scripts/backup-connection-preflight.mjs', executable, 'service=test'], {
      encoding: 'utf8', timeout: 5_000,
      env: { ...process.env, TEST_FAILURES: '2', TEST_COUNTER: counter, MTN_BACKUP_CONNECT_ATTEMPTS: '3', MTN_BACKUP_CONNECT_RETRY_MS: '0', MTN_BACKUP_CONNECT_TIMEOUT_MS: '1000', ...overrides },
    });
    const calls = (() => { try { return Number(readFileSync(counter, 'utf8')); } catch { return 0; } })();
    return { ...result, calls };
  }
  const recovered = run();
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(recovered.calls, 3, 'transient pooler failure must retry and recover');
  const exhausted = run({ TEST_FAILURES: '9' });
  assert.equal(exhausted.status, 1);
  assert.equal(exhausted.calls, 3, 'unavailable source must fail after bounded attempts');
  const permanent = run({ TEST_MODE: 'permanent' });
  assert.equal(permanent.status, 1);
  assert.equal(permanent.calls, 1, 'invalid credentials must not loop');
  const timeout = run({ TEST_MODE: 'timeout', MTN_BACKUP_CONNECT_TIMEOUT_MS: '100' });
  assert.equal(timeout.status, 1);
  assert.equal(timeout.calls, 3, 'hung psql must be terminated and retried within deadline');
  const dryRun = run({ DRY_RUN: 'true' });
  assert.equal(dryRun.status, 0);
  assert.equal(dryRun.calls, 0);
  const invalid = run({ MTN_BACKUP_CONNECT_ATTEMPTS: '0' });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.calls, 0);
  console.log('backup connection preflight tests passed');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
