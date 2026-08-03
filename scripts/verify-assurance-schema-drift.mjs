import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;

export const SCHEMA_CONTRACT_VERSION = 'mtn-conditional-90-schema-contract-v1';
export const MIGRATION_PATH = 'supabase/migrations/20260803100000_conditional_90_assurance.sql';
export const MIGRATION_PATHS = Object.freeze([
  MIGRATION_PATH,
  'supabase/migrations/20260803103000_harden_manual_accessibility_assurance.sql',
  'supabase/migrations/20260803110000_pilot_source_integrity.sql',
  'supabase/migrations/20260803120000_assurance_least_privilege.sql',
  'supabase/migrations/20260803121000_assurance_service_hash_execution.sql',
]);
export const MANIFEST_PATH = 'infra/release/conditional-90-schema-fingerprint.json';

export const CORE_FUNCTION_NAMES = Object.freeze([
  'assurance_canonical_jsonb',
  'assurance_jsonb_object_key_count',
  'assurance_stable_jsonb_hash',
  'guard_pilot_trade_execution',
  'guard_pilot_trade_source_fields',
  'guard_verified_pilot_model_performance',
  'guard_verified_pilot_performance',
  'prevent_recommendation_evidence_mutation',
  'validate_assurance_control_evidence_append',
  'validate_assurance_score_snapshot_append',
  'validate_pilot_execution_authorization',
  'validate_pilot_outcome_source_snapshot',
  'validate_recommendation_broker_evidence_review',
  'validate_recommendation_decision_event',
  'validate_recommendation_longitudinal_evaluation_append',
  'validate_recommendation_pilot_link',
  'validate_recommendation_pilot_outcome',
  'validate_recommendation_publication_assurance_contract',
]);

export const SERVICE_ROLE_EXECUTE_FUNCTION_NAMES = Object.freeze([
  'assurance_canonical_jsonb',
  'assurance_jsonb_object_key_count',
  'assurance_stable_jsonb_hash',
]);

export const CORE_TABLE_NAMES = Object.freeze([
  'assurance_control_evidence',
  'assurance_score_snapshots',
  'recommendation_broker_evidence_reviews',
  'recommendation_decision_events',
  'recommendation_longitudinal_evaluations',
  'recommendation_pilot_links',
  'recommendation_pilot_outcomes',
]);

export const CORE_TRIGGER_NAMES = Object.freeze([
  'assurance_control_evidence_immutable',
  'assurance_control_evidence_validate',
  'assurance_score_snapshot_validate',
  'assurance_score_snapshots_immutable',
  'pilot_trade_execution_guard',
  'pilot_trade_source_fields_guard',
  'recommendation_broker_evidence_review_validate',
  'recommendation_broker_evidence_reviews_immutable',
  'recommendation_decision_event_validate',
  'recommendation_decision_events_immutable',
  'recommendation_longitudinal_evaluation_validate',
  'recommendation_longitudinal_evaluations_immutable',
  'recommendation_pilot_execution_authorization_validate',
  'recommendation_pilot_link_validate',
  'recommendation_pilot_links_immutable',
  'recommendation_pilot_outcome_source_snapshot_validate',
  'recommendation_pilot_outcome_validate',
  'recommendation_pilot_outcomes_immutable',
  'recommendation_publication_assurance_contract_validate',
  'verified_pilot_model_performance_guard',
  'verified_pilot_performance_guard',
]);

export const CORE_REQUIRED_CONSTRAINT_NAMES = Object.freeze([
  'assurance_manual_accessibility_payload_check',
  'recommendation_publications_assurance_contract_pair_check',
]);

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Schema evidence contains a non-finite number.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
      value[key] === undefined ? [] : [[key, canonicalize(value[key])]]
    )));
  }
  throw new Error(`Unsupported schema evidence value: ${typeof value}`);
}

export function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function objectIdentity(row) {
  if (row.kind === 'function') return `${row.schema_name}.${row.object_name}(${row.identity_arguments})`;
  if (row.kind === 'column') return `${row.schema_name}.${row.table_name}.${row.column_name}`;
  return `${row.schema_name}.${row.table_name}.${row.object_name}`;
}

export function assertPrivilegeBoundary(privileges) {
  const byTable = new Map(privileges.map((row) => [row.table_name, row]));
  const missing = CORE_TABLE_NAMES.filter((tableName) => !byTable.has(tableName));
  const violations = [];
  for (const tableName of CORE_TABLE_NAMES) {
    const row = byTable.get(tableName);
    if (!row) continue;
    if (row.rls_enabled !== true) violations.push(`${tableName}:rls_disabled`);
    for (const role of ['anon', 'authenticated']) {
      for (const operation of ['select', 'insert', 'update', 'delete']) {
        if (row[`${role}_${operation}`] !== false) violations.push(`${tableName}:${role}_${operation}`);
      }
    }
    if (row.service_role_select !== true || row.service_role_insert !== true) {
      violations.push(`${tableName}:service_role_read_append_missing`);
    }
    if (row.service_role_update !== false || row.service_role_delete !== false) {
      violations.push(`${tableName}:service_role_mutation_allowed`);
    }
  }
  if (missing.length > 0 || violations.length > 0) {
    throw new Error(
      `Deployed assurance privilege boundary is not fail-closed: `
      + [...missing.map((tableName) => `${tableName}:missing`), ...violations].join(', '),
    );
  }
  return true;
}

export function assertFunctionPrivilegeBoundary(functions) {
  const identities = new Set(functions.map((row) => `${row.object_name}(${row.identity_arguments})`));
  const missing = CORE_FUNCTION_NAMES.filter((functionName) => (
    ![...identities].some((identity) => identity.startsWith(`${functionName}(`))
  ));
  const violations = [];
  for (const row of functions) {
    for (const role of ['anon', 'authenticated']) {
      if (row[`${role}_execute`] !== false) {
        violations.push(`${row.object_name}(${row.identity_arguments}):${role}_execute`);
      }
    }
    const expectedServiceRoleExecute = SERVICE_ROLE_EXECUTE_FUNCTION_NAMES.includes(row.object_name);
    if (row.service_role_execute !== expectedServiceRoleExecute) {
      violations.push(`${row.object_name}(${row.identity_arguments}):service_role_execute`);
    }
  }
  if (missing.length > 0 || violations.length > 0) {
    throw new Error(
      `Deployed assurance function privilege boundary is not fail-closed: `
      + [...missing.map((functionName) => `${functionName}:missing`), ...violations].join(', '),
    );
  }
  return true;
}

export function buildSchemaSnapshot({
  migrationSha256,
  migrationSha256s,
  functions,
  triggers,
  constraints,
  tables = [],
  columns = [],
  policies = [],
  privileges = [],
}) {
  const migrationHashes = migrationSha256s || { [MIGRATION_PATH]: migrationSha256 };
  const definitionGroups = { functions, triggers, constraints, tables, columns, policies, privileges };
  const ordered = Object.fromEntries(Object.entries(definitionGroups).map(([name, rows]) => [
    name,
    [...rows].sort((left, right) => objectIdentity(left).localeCompare(objectIdentity(right))),
  ]));
  const definitionFingerprints = Object.fromEntries(Object.entries(ordered).map(([name, rows]) => [
    name,
    stableHash(rows),
  ]));
  definitionFingerprints.combined = stableHash(definitionFingerprints);
  const migrationSetSha256 = stableHash(migrationHashes);

  return {
    schema_version: SCHEMA_CONTRACT_VERSION,
    migration_paths: MIGRATION_PATHS,
    migration_sha256: migrationSetSha256,
    migration_sha256s: migrationHashes,
    deployed_definition_fingerprint: definitionFingerprints.combined,
    definition_fingerprints: definitionFingerprints,
    object_counts: Object.fromEntries(Object.entries(ordered).map(([name, rows]) => [name, rows.length])),
    object_identities: Object.fromEntries(Object.entries(ordered).map(([name, rows]) => [
      name,
      rows.map(objectIdentity),
    ])),
  };
}

export function assertSnapshotMatchesManifest(snapshot, manifest) {
  const requiredComparisons = [
    ['schema_version', snapshot.schema_version, manifest.schema_version],
    ['migration_paths', snapshot.migration_paths, manifest.migration_paths],
    ['migration_sha256', snapshot.migration_sha256, manifest.migration_sha256],
    ['migration_sha256s', snapshot.migration_sha256s, manifest.migration_sha256s],
    [
      'deployed_definition_fingerprint',
      snapshot.deployed_definition_fingerprint,
      manifest.deployed_definition_fingerprint,
    ],
    ['definition_fingerprints', snapshot.definition_fingerprints, manifest.definition_fingerprints],
    ['object_counts', snapshot.object_counts, manifest.object_counts],
    ['object_identities', snapshot.object_identities, manifest.object_identities],
  ];
  const mismatches = requiredComparisons
    .filter(([, actual, expected]) => stableHash(actual) !== stableHash(expected))
    .map(([field]) => field);
  if (mismatches.length > 0) {
    throw new Error(`Deployed assurance schema drift detected: ${mismatches.join(', ')}.`);
  }
  return {
    ...snapshot,
    schema_drift_verified: true,
  };
}

async function readDeployedDefinitions(client) {
  const functionResult = await client.query(`
    select
      'function'::text as kind,
      namespace.nspname as schema_name,
      procedure.proname as object_name,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
      language.lanname as language,
      procedure.prosecdef as security_definer,
      procedure.provolatile as volatility,
      procedure.proisstrict as is_strict,
      coalesce(pg_catalog.to_jsonb(procedure.proconfig), '[]'::jsonb) as configuration,
      pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
      pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
      pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute,
      procedure.prosrc as source
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    join pg_catalog.pg_language as language on language.oid = procedure.prolang
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname = any($1::text[])
    order by procedure.proname, pg_catalog.pg_get_function_identity_arguments(procedure.oid)
  `, [CORE_FUNCTION_NAMES]);

  const triggerResult = await client.query(`
    select
      'trigger'::text as kind,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      trigger.tgname as object_name,
      trigger.tgenabled as enabled,
      trigger.tgtype::integer as trigger_type,
      pg_catalog.encode(trigger.tgargs, 'hex') as arguments_hex,
      coalesce(pg_catalog.pg_get_expr(trigger.tgqual, trigger.tgrelid), '') as predicate,
      procedure_namespace.nspname as function_schema,
      procedure.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as function_identity_arguments
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    join pg_catalog.pg_proc as procedure on procedure.oid = trigger.tgfoid
    join pg_catalog.pg_namespace as procedure_namespace on procedure_namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and trigger.tgname = any($1::text[])
      and trigger.tgisinternal = false
    order by relation.relname, trigger.tgname
  `, [CORE_TRIGGER_NAMES]);

  const constraintResult = await client.query(`
    select
      'constraint'::text as kind,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      constraint_record.conname as object_name,
      constraint_record.contype as constraint_type,
      constraint_record.condeferrable as deferrable,
      constraint_record.condeferred as initially_deferred,
      constraint_record.convalidated as validated,
      pg_catalog.pg_get_constraintdef(constraint_record.oid, true) as definition
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_class as relation on relation.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and (
        relation.relname = any($1::text[])
        or constraint_record.conname = any($2::text[])
      )
    order by relation.relname, constraint_record.conname
  `, [CORE_TABLE_NAMES, CORE_REQUIRED_CONSTRAINT_NAMES]);

  const tableResult = await client.query(`
    select
      'table'::text as kind,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      relation.relname as object_name,
      relation.relrowsecurity as rls_enabled,
      relation.relforcerowsecurity as rls_forced,
      relation.relpersistence as persistence
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relname = any($1::text[])
    order by relation.relname
  `, [CORE_TABLE_NAMES]);

  const columnResult = await client.query(`
    select
      'column'::text as kind,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name,
      attribute.attnum::integer as ordinal_position,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
      attribute.attnotnull as not_null,
      attribute.attidentity as identity_kind,
      attribute.attgenerated as generated_kind,
      coalesce(pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid), '') as default_expression
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    left join pg_catalog.pg_attrdef as default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
    where namespace.nspname = 'public'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and (
        relation.relname = any($1::text[])
        or (
          relation.relname = 'recommendation_publications'
          and attribute.attname in ('assurance_contract_hash', 'assurance_contract')
        )
      )
    order by relation.relname, attribute.attnum
  `, [CORE_TABLE_NAMES]);

  const policyResult = await client.query(`
    select
      'policy'::text as kind,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      policy.polname as object_name,
      policy.polpermissive as permissive,
      policy.polcmd as command,
      coalesce((
        select pg_catalog.jsonb_agg(role_record.rolname order by role_record.rolname)
        from pg_catalog.unnest(policy.polroles) as policy_role(role_oid)
        join pg_catalog.pg_roles as role_record on role_record.oid = policy_role.role_oid
      ), '[]'::jsonb) as roles,
      coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '') as using_expression,
      coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '') as check_expression
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any($1::text[])
    order by relation.relname, policy.polname
  `, [CORE_TABLE_NAMES]);

  const privilegeResult = await client.query(`
    select
      'privilege'::text as kind,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      relation.relname as object_name,
      relation.relrowsecurity as rls_enabled,
      pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT') as anon_select,
      pg_catalog.has_table_privilege('anon', relation.oid, 'INSERT') as anon_insert,
      pg_catalog.has_table_privilege('anon', relation.oid, 'UPDATE') as anon_update,
      pg_catalog.has_table_privilege('anon', relation.oid, 'DELETE') as anon_delete,
      pg_catalog.has_table_privilege('authenticated', relation.oid, 'SELECT') as authenticated_select,
      pg_catalog.has_table_privilege('authenticated', relation.oid, 'INSERT') as authenticated_insert,
      pg_catalog.has_table_privilege('authenticated', relation.oid, 'UPDATE') as authenticated_update,
      pg_catalog.has_table_privilege('authenticated', relation.oid, 'DELETE') as authenticated_delete,
      pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT') as service_role_select,
      pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT') as service_role_insert,
      pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE') as service_role_update,
      pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE') as service_role_delete
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relname = any($1::text[])
    order by relation.relname
  `, [CORE_TABLE_NAMES]);

  assertPrivilegeBoundary(privilegeResult.rows);
  assertFunctionPrivilegeBoundary(functionResult.rows);

  return {
    functions: functionResult.rows,
    triggers: triggerResult.rows,
    constraints: constraintResult.rows,
    tables: tableResult.rows,
    columns: columnResult.rows,
    policies: policyResult.rows,
    privileges: privilegeResult.rows,
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

export async function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const manifestPath = resolve(repoRoot, argumentValue('--manifest') || MANIFEST_PATH);
  const snapshotOnly = process.argv.includes('--snapshot');
  const databaseUrlEnvironment = argumentValue('--database-url-env') || 'SUPABASE_DATABASE_URL';
  const connectionString = process.env[databaseUrlEnvironment] || '';
  const localConnection = process.env.MTN_ASSURANCE_SCHEMA_LOCAL === '1';
  if (!connectionString && !localConnection) {
    throw new Error(`${databaseUrlEnvironment} is required.`);
  }

  const client = new Client(connectionString
    ? {
      connectionString,
      ssl: process.env.MTN_ASSURANCE_SCHEMA_SSL === 'disable'
        ? false
        : { rejectUnauthorized: false },
    }
    : {});
  await client.connect();
  try {
    const definitions = await readDeployedDefinitions(client);
    const migrationSha256s = Object.fromEntries(MIGRATION_PATHS.map((migrationPath) => [
      migrationPath,
      fileSha256(resolve(repoRoot, migrationPath)),
    ]));
    const snapshot = buildSchemaSnapshot({
      migrationSha256s,
      ...definitions,
    });
    const result = snapshotOnly
      ? snapshot
      : assertSnapshotMatchesManifest(snapshot, JSON.parse(readFileSync(manifestPath, 'utf8')));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
