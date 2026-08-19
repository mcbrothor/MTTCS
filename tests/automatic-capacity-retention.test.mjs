import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = 'supabase/migrations/20260820001000_automatic_capacity_maintenance.sql';
const migration = await readFile(new URL(`../${migrationPath}`, import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(
  new URL('../infra/release/production-scheduler-manifest.json', import.meta.url),
  'utf8',
));

assert.match(migration, /automatic_capacity_retention_status/i);
assert.match(migration, /apply_automatic_capacity_retention/i);
assert.match(migration, /AUTO_CAPACITY_RETENTION/);
assert.match(migration, /pg_try_advisory_xact_lock/i);
assert.match(migration, /mtn:database-maintenance/);
assert.match(migration, /interval '24 hours'/i);
assert.match(migration, /backup\.encrypted/i);
assert.match(migration, /backup\.checksum_sha256/i);
assert.match(migration, /restore_drill/i);
assert.match(migration, /row_count_reconciliation/i);
assert.match(migration, /critical_query_smoke/i);
assert.match(migration, /offsite_verified/i);
assert.match(migration, /array\[\s*'cron_http_runs',[\s\S]*'daily_screener_candidates',[\s\S]*'recommendation_market_prices'/i);
assert.match(migration, /recommendation_evidence_manifests/i);
assert.match(migration, /limit 10000/i);
assert.match(migration, /13 \* \* \* \*/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.alert_events/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.operations_backup_runs/i);
assert.ok(manifest.requiredMigrations.includes(migrationPath));

console.log('automatic capacity retention migration tests passed');
