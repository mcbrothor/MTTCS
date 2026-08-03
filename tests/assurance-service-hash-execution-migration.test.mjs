import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260803121000_assurance_service_hash_execution.sql', import.meta.url),
  'utf8',
);

for (const signature of [
  'assurance_canonical_jsonb\\(jsonb\\)',
  'assurance_jsonb_object_key_count\\(jsonb\\)',
  'assurance_stable_jsonb_hash\\(jsonb\\)',
]) {
  assert.match(
    migration,
    new RegExp(`grant execute on function public\\.${signature} to service_role`, 'i'),
  );
}

assert.doesNotMatch(migration, /validate_|guard_|prevent_/i);
assert.doesNotMatch(migration, /\bto\s+(?:anon|authenticated|public)\b/i);

console.log('assurance service hash execution migration tests passed');
