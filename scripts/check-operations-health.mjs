#!/usr/bin/env node

import { runHealthCheck } from '../infra/cloudflare/health-deadman/worker.mjs';

try {
  const result = await runHealthCheck(process.env);
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
