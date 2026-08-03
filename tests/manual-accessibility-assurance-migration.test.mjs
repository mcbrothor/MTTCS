import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260803103000_harden_manual_accessibility_assurance.sql';
const migration = readFileSync(new URL(`../${migrationPath}`, import.meta.url), 'utf8');

assert.match(migration, /drop constraint if exists assurance_manual_accessibility_payload_check/i);
assert.match(migration, /schema_version' = 'mtn-a11y-manual-review-v1/i);
assert.match(migration, /reviewer_authentication' = 'INDEPENDENT_ASSURANCE_CREDENTIAL/i);
assert.match(migration, /source_record_id = payload ->> 'artifact_hash'/i);
assert.match(migration, /assistive_technology,name/i);
assert.match(migration, /jsonb_array_length\(payload -> 'routes_reviewed'\) = 4/i);
for (const route of ['/', '/portfolio', '/recommendations?view=metrics', '/scanner']) {
  assert.ok(migration.includes(`'["${route}"]'::jsonb`), `missing exact core route constraint for ${route}`);
}
assert.match(migration, /\(payload -> 'checks'\) \?& array\['screenReader'.*'mobile360'\]/i);
assert.match(migration, /assurance_jsonb_object_key_count\(payload -> 'checks'\) = 6/i);
assert.match(migration, /reviewer_attestation/i);

const manifest = JSON.parse(readFileSync(
  new URL('../infra/release/production-scheduler-manifest.json', import.meta.url),
  'utf8',
));
assert.ok(manifest.requiredMigrations.includes(migrationPath));

console.log('manual accessibility assurance migration contract tests passed');
