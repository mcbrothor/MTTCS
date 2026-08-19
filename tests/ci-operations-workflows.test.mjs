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
const backupWorkflow = await readFile(
  new URL('../.github/workflows/db-backup.yml', import.meta.url),
  'utf8',
);

// Scheduled runs may reclaim capacity only behind a fail-closed database and
// backup gate. Manual deletion still requires the explicit confirmation.
assert.match(maintenanceWorkflow, /postgresql-client-17/);
assert.match(maintenanceWorkflow, /cron:\s*['"]15 17 \* \* \*['"]/);
assert.match(maintenanceWorkflow, /mtn_internal\.apply_retention_policies\(true,\s*null\)/i);
assert.match(maintenanceWorkflow, /github\.event_name\s*==\s*['"]workflow_dispatch['"]/);
assert.match(maintenanceWorkflow, /inputs\.mode\s*==\s*['"]apply['"]/);
assert.match(maintenanceWorkflow, /inputs\.confirmation\s*==\s*['"]APPLY_RETENTION['"]/);
assert.match(maintenanceWorkflow, /id:\s*capacity_gate/i);
assert.match(maintenanceWorkflow, /WARNING_350\|BLOCK_NONCRITICAL/);
assert.match(maintenanceWorkflow, /interval '24 hours'/i);
assert.match(maintenanceWorkflow, /encrypted/i);
assert.match(maintenanceWorkflow, /checksum_sha256/i);
assert.match(maintenanceWorkflow, /metadata->>'restore_drill'/i);
assert.match(maintenanceWorkflow, /metadata->>'row_count_reconciliation'/i);
assert.match(maintenanceWorkflow, /metadata->>'critical_query_smoke'/i);
assert.match(maintenanceWorkflow, /metadata->>'offsite_verified'/i);
assert.match(maintenanceWorkflow, /github\.event_name\s*==\s*['"]schedule['"]/);
assert.match(maintenanceWorkflow, /steps\.capacity_gate\.outputs\.auto_apply\s*==\s*['"]true['"]/);
assert.match(maintenanceWorkflow, /apply_automatic_capacity_retention\(false,\s*'AUTO_CAPACITY_RETENTION'\)/i);
assert.match(maintenanceWorkflow, /if:\s*\$\{\{\s*always\(\)\s*\}\}/i);
assert.match(maintenanceWorkflow, /capacity_level.*BLOCK_NONCRITICAL/is);
assert.match(maintenanceWorkflow, /group:\s*mtn-database-exclusive-io/);
assert.match(backupWorkflow, /group:\s*mtn-database-exclusive-io/);
assert.match(
  maintenanceWorkflow,
  /mtn_internal\.apply_retention_policies\(false,\s*'APPLY_RETENTION'\)/i,
);
assert.match(maintenanceWorkflow, /apply_recommendation_evidence_retention\(true,\s*null\)/i);
assert.match(
  maintenanceWorkflow,
  /apply_recommendation_evidence_retention\(false,\s*'APPLY_RETENTION'\)/i,
);
for (const table of [
  'daily_screener_candidates',
  'recommendation_market_prices',
  'recommendation_evidence_manifests',
]) {
  assert.match(maintenanceWorkflow, new RegExp(`vacuumdb[^\\n]+${table}`, 'i'));
}
assert.match(maintenanceWorkflow, /capture_database_capacity\(\)/i);
assert.doesNotMatch(maintenanceWorkflow, /maintain_stock_metrics_retention_v2/i);
assert.doesNotMatch(maintenanceWorkflow, /p_dry_run[^\n]*false/i);

// CI must audit route authentication and prove release structure from a clean
// clone of the exact checkout before build/deployment evidence can be trusted.
assert.match(e2eWorkflow, /npm run check:api-auth/);
assert.match(e2eWorkflow, /verify-release\.mjs\s+--verify-clean-clone/);
assert.match(e2eWorkflow, /--expected-sha=["']?\$GITHUB_SHA/);

console.log('CI and operations workflow contract tests passed');
