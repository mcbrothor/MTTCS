import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260803120000_assurance_least_privilege.sql', import.meta.url),
  'utf8',
);

for (const table of [
  'recommendation_longitudinal_evaluations',
  'recommendation_decision_events',
  'recommendation_pilot_links',
  'recommendation_broker_evidence_reviews',
  'recommendation_pilot_outcomes',
  'assurance_control_evidence',
  'assurance_score_snapshots',
]) {
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from service_role`, 'i'));
  assert.match(migration, new RegExp(`grant select, insert on table public\\.${table} to service_role`, 'i'));
}

for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
  assert.match(
    migration,
    new RegExp(`revoke all on function[\\s\\S]+from [^;]*${role}`, 'i'),
    `function execution must be revoked from ${role}`,
  );
}

assert.doesNotMatch(migration, /for all to service_role/i);
assert.match(migration, /for select to service_role using \(true\)/i);
assert.match(migration, /for insert to service_role with check \(true\)/i);

console.log('assurance least-privilege migration tests passed');
