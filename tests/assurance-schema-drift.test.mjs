import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertFunctionPrivilegeBoundary,
  assertPrivilegeBoundary,
  assertSnapshotMatchesManifest,
  buildSchemaSnapshot,
  CORE_FUNCTION_NAMES,
  CORE_TABLE_NAMES,
  fileSha256,
  MIGRATION_PATHS,
  SCHEMA_CONTRACT_VERSION,
  SERVICE_ROLE_EXECUTE_FUNCTION_NAMES,
} from '../scripts/verify-assurance-schema-drift.mjs';

const migrationSha256s = Object.fromEntries(MIGRATION_PATHS.map((path, index) => [
  path,
  String(index + 1).repeat(64),
]));
const definitions = {
  functions: [{ kind: 'function', schema_name: 'public', object_name: 'f', identity_arguments: '', source: 'return 1' }],
  triggers: [{ kind: 'trigger', schema_name: 'public', table_name: 't', object_name: 't_validate', trigger_type: 7 }],
  constraints: [{ kind: 'constraint', schema_name: 'public', table_name: 't', object_name: 't_check', definition: 'CHECK (x > 0)' }],
  tables: [{ kind: 'table', schema_name: 'public', table_name: 't', object_name: 't', rls_enabled: true }],
  columns: [{ kind: 'column', schema_name: 'public', table_name: 't', column_name: 'id', data_type: 'uuid' }],
  policies: [{ kind: 'policy', schema_name: 'public', table_name: 't', object_name: 'service_append' }],
  privileges: [{ kind: 'privilege', schema_name: 'public', table_name: 't', object_name: 't' }],
};
const snapshot = buildSchemaSnapshot({ migrationSha256s, ...definitions });

assert.equal(snapshot.schema_version, SCHEMA_CONTRACT_VERSION);
assert.deepEqual(snapshot.migration_paths, MIGRATION_PATHS);
assert.deepEqual(snapshot.migration_sha256s, migrationSha256s);
assert.match(snapshot.migration_sha256, /^[a-f0-9]{64}$/);
assert.equal(snapshot.object_counts.functions, 1);
assert.equal(snapshot.object_counts.triggers, 1);
assert.equal(snapshot.object_counts.constraints, 1);
assert.equal(snapshot.object_counts.columns, 1);
assert.equal(snapshot.object_counts.policies, 1);
assert.equal(snapshot.object_counts.privileges, 1);
assert.equal(assertSnapshotMatchesManifest(snapshot, structuredClone(snapshot)).schema_drift_verified, true);

for (const mutate of [
  (value) => { value.migration_sha256 = 'b'.repeat(64); },
  (value) => { value.migration_sha256s[MIGRATION_PATHS[1]] = 'b'.repeat(64); },
  (value) => { value.definition_fingerprints.functions = 'b'.repeat(64); },
  (value) => { value.deployed_definition_fingerprint = 'b'.repeat(64); },
  (value) => { value.object_counts.triggers = 0; },
  (value) => { value.object_identities.constraints = []; },
  (value) => { value.object_identities.columns = []; },
  (value) => { value.object_identities.policies = []; },
  (value) => { value.object_identities.privileges = []; },
]) {
  const changed = structuredClone(snapshot);
  mutate(changed);
  assert.throws(
    () => assertSnapshotMatchesManifest(snapshot, changed),
    /schema drift detected/,
  );
}

const passingPrivileges = CORE_TABLE_NAMES.map((tableName) => ({
  table_name: tableName,
  rls_enabled: true,
  anon_select: false,
  anon_insert: false,
  anon_update: false,
  anon_delete: false,
  authenticated_select: false,
  authenticated_insert: false,
  authenticated_update: false,
  authenticated_delete: false,
  service_role_select: true,
  service_role_insert: true,
  service_role_update: false,
  service_role_delete: false,
}));
assert.equal(assertPrivilegeBoundary(passingPrivileges), true);
for (const [field, value] of [
  ['rls_enabled', false],
  ['anon_insert', true],
  ['authenticated_update', true],
  ['service_role_insert', false],
  ['service_role_delete', true],
]) {
  const changed = structuredClone(passingPrivileges);
  changed[0][field] = value;
  assert.throws(() => assertPrivilegeBoundary(changed), /not fail-closed/);
}
assert.throws(() => assertPrivilegeBoundary(passingPrivileges.slice(1)), /missing/);

const passingFunctionPrivileges = CORE_FUNCTION_NAMES.map((objectName) => ({
    object_name: objectName,
    identity_arguments: '',
    anon_execute: false,
    authenticated_execute: false,
    service_role_execute: SERVICE_ROLE_EXECUTE_FUNCTION_NAMES.includes(objectName),
  }));
assert.equal(assertFunctionPrivilegeBoundary(passingFunctionPrivileges), true);
for (const role of ['anon', 'authenticated']) {
  const changed = structuredClone(passingFunctionPrivileges);
  changed[0][`${role}_execute`] = true;
  assert.throws(() => assertFunctionPrivilegeBoundary(changed), /not fail-closed/);
}
{
  const changed = structuredClone(passingFunctionPrivileges);
  const helperIndex = changed.findIndex((row) => SERVICE_ROLE_EXECUTE_FUNCTION_NAMES.includes(row.object_name));
  changed[helperIndex].service_role_execute = false;
  assert.throws(() => assertFunctionPrivilegeBoundary(changed), /not fail-closed/);
}
{
  const changed = structuredClone(passingFunctionPrivileges);
  const validatorIndex = changed.findIndex((row) => !SERVICE_ROLE_EXECUTE_FUNCTION_NAMES.includes(row.object_name));
  changed[validatorIndex].service_role_execute = true;
  assert.throws(() => assertFunctionPrivilegeBoundary(changed), /not fail-closed/);
}
assert.throws(
  () => assertFunctionPrivilegeBoundary(passingFunctionPrivileges.slice(1)),
  /missing/,
);

const repoRoot = new URL('..', import.meta.url);
for (const migrationPath of MIGRATION_PATHS) {
  assert.match(fileSha256(new URL(migrationPath, repoRoot)), /^[a-f0-9]{64}$/);
}

const workflow = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../scripts/verify-assurance-schema-drift.mjs', import.meta.url), 'utf8');
assert.match(workflow, /verify-assurance-schema-drift\.mjs/);
assert.match(workflow, /schema_drift_verified/);
assert.match(workflow, /migration_sha256/);
assert.match(workflow, /migration_sha256s/);
assert.match(workflow, /deployed_definition_fingerprint/);
assert.match(verifier, /guard_pilot_trade_execution/);
assert.match(verifier, /validate_pilot_execution_authorization/);
assert.match(verifier, /validate_pilot_outcome_source_snapshot/);
assert.match(verifier, /assurance_manual_accessibility_payload_check/);
assert.match(verifier, /pg_catalog\.format_type/);
assert.match(verifier, /relrowsecurity/);
assert.match(verifier, /pg_catalog\.pg_policy/);
assert.match(verifier, /has_table_privilege\('anon'/);
assert.match(verifier, /has_table_privilege\('authenticated'/);
assert.match(verifier, /has_table_privilege\('service_role'/);
assert.match(verifier, /has_function_privilege\('anon'/);
assert.match(verifier, /has_function_privilege\('authenticated'/);
assert.match(verifier, /has_function_privilege\('service_role'/);

console.log('assurance schema drift tests passed');
