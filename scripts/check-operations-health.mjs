#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runHealthCheck } from '../infra/cloudflare/health-deadman/worker.mjs';

function fileAlertState(path) {
  if (!path) return undefined;
  return {
    async read() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        return null;
      }
    },
    async write(value) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(value)}\n`, 'utf8');
    },
  };
}

try {
  const result = await runHealthCheck(process.env, {
    alertState: fileAlertState(process.env.MTN_ALERT_STATE_PATH),
  });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    checkedAt: result.checkedAt,
    fingerprint: result.fingerprint,
    notified: result.notified,
  })}\n`);
  if (result.status !== 'HEALTHY') process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Operations health monitor failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
