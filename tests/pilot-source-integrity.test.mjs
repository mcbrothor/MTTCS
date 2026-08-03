import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, route, manifestText] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260803110000_pilot_source_integrity.sql', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/trade-executions/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../infra/release/production-scheduler-manifest.json', import.meta.url), 'utf8'),
]);
const manifest = JSON.parse(manifestText);

assert.match(migration, /validate_pilot_execution_authorization/);
assert.match(migration, /risk_policy_hash is distinct from public\.assurance_stable_jsonb_hash/);
assert.match(migration, /MTN_PILOT_PLAN_RISK_UNDERSTATED/);
assert.match(migration, /MTN_PILOT_ASSURANCE_SNAPSHOT_STALE/);
assert.match(migration, /guard_pilot_trade_execution/);
assert.match(migration, /entry_shares > planned_shares/);
assert.match(migration, /executed_risk > authorized_risk/);
assert.match(migration, /MTN_PILOT_ENTRY_PREDATES_LINK/);
assert.match(migration, /MTN_VERIFIED_PILOT_SOURCE_IMMUTABLE/);
assert.match(migration, /verified_pilot_performance_guard/);
assert.match(migration, /verified_pilot_model_performance_guard/);
assert.match(migration, /MTN_PILOT_EXECUTION_SNAPSHOT_HASH_MISMATCH/);
assert.match(migration, /pilot_trade_source_fields_guard/);
assert.match(migration, /security definer[\s\S]*set search_path = ''/);
assert.match(migration, /revoke all on function public\.guard_pilot_trade_execution\(\)/);

assert.match(route, /validatePilotExecutionRisk/);
assert.match(route, /recommendation_pilot_links/);
assert.match(route, /PILOT_PLAN_SHARES_EXCEEDED/);
assert.match(route, /PILOT_EXECUTION_RISK_EXCEEDED/);
assert.match(route, /await validatePilotExecutionRisk\(trade, next\)/);
assert.match(route, /VERIFIED_PILOT_SOURCE_IMMUTABLE/);
assert.ok(
  manifest.requiredMigrations.includes('supabase/migrations/20260803110000_pilot_source_integrity.sql'),
  'pilot source-integrity migration must be release-gated',
);

console.log('pilot source integrity tests passed');
