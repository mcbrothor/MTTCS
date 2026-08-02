import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const maintenanceWorkflow = await readFile(
  new URL('../.github/workflows/db-maintenance.yml', import.meta.url),
  'utf8',
);
const e2eWorkflow = await readFile(
  new URL('../.github/workflows/e2e-tests.yml', import.meta.url),
  'utf8',
);

// Scheduled runs are observation-only. Deletion is reachable only from a
// manually dispatched, explicitly selected apply run with the exact phrase.
assert.match(maintenanceWorkflow, /postgresql-client-17/);
assert.match(maintenanceWorkflow, /mtn_internal\.apply_retention_policies\(true,\s*null\)/i);
assert.match(maintenanceWorkflow, /github\.event_name\s*==\s*['"]workflow_dispatch['"]/);
assert.match(maintenanceWorkflow, /inputs\.mode\s*==\s*['"]apply['"]/);
assert.match(maintenanceWorkflow, /inputs\.confirmation\s*==\s*['"]APPLY_RETENTION['"]/);
assert.match(
  maintenanceWorkflow,
  /mtn_internal\.apply_retention_policies\(false,\s*'APPLY_RETENTION'\)/i,
);
assert.doesNotMatch(maintenanceWorkflow, /maintain_stock_metrics_retention_v2/i);
assert.doesNotMatch(maintenanceWorkflow, /p_dry_run[^\n]*false/i);

// CI must audit route authentication and prove release structure from a clean
// clone of the exact checkout before build/deployment evidence can be trusted.
assert.match(e2eWorkflow, /npm run check:api-auth/);
assert.match(e2eWorkflow, /verify-release\.mjs\s+--verify-clean-clone/);
assert.match(e2eWorkflow, /--expected-sha=["']?\$GITHUB_SHA/);

console.log('CI and operations workflow contract tests passed');
