import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveTestPostgresBin } from '../scripts/lib/test-postgres-bin.mjs';
import { migrationTimeouts } from '../scripts/release/apply-recovery-migration.mjs';

assert.deepEqual(migrationTimeouts({}), { lock: '3000ms', statement: '60000ms' });
for (const invalid of ['0', '-1', '1.5', '10ms', 'NaN', '60001']) {
  assert.throws(() => migrationTimeouts({ MTN_MIGRATION_LOCK_TIMEOUT_MS: invalid }));
}
assert.throws(() => migrationTimeouts({ MTN_MIGRATION_STATEMENT_TIMEOUT_MS: '600001' }));

const bin = resolveTestPostgresBin();
const directory = mkdtempSync(join(tmpdir(), 'mtn-migration-lock-'));
const dataDir = join(directory, 'data');
const fixtureRoot = join(directory, 'repo');
const port = 15000 + (process.pid % 30000);
let client;
let started = false;
try {
  execFileSync(join(bin, 'initdb'), ['-D', dataDir, '-A', 'trust', '--no-locale', '-U', 'postgres'], { stdio: 'pipe' });
  execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-l', join(directory, 'postgres.log'), '-o', `-p ${port} -k ${directory} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  client = new pg.Client({ host: directory, port, user: 'postgres', database: 'postgres' });
  await client.connect();
  await client.query(`
    create schema mtn_internal;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key, name text, statements text[]);
    create table public.migration_probe(value integer);
    create view public.locked_health_view as select 1 as health;
  `);
  mkdirSync(join(fixtureRoot, 'scripts/release'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'supabase/migrations'), { recursive: true });
  symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(fixtureRoot, 'node_modules'), 'dir');
  copyFileSync(new URL('../scripts/release/apply-recovery-migration.mjs', import.meta.url), join(fixtureRoot, 'scripts/release/apply-recovery-migration.mjs'));
  const version = '20990101000000';
  const migrationName = `${version}_lock_timeout_test.sql`;
  const fixtureMigration = join(fixtureRoot, 'supabase/migrations', migrationName);
  const fixtureSql = `
    insert into public.migration_probe values (1);
    create or replace view public.locked_health_view as select 2 as health;
  `;
  writeFileSync(fixtureMigration, fixtureSql);
  const connectionString = `postgresql://postgres@localhost:${port}/postgres?host=${encodeURIComponent(directory)}`;
  const run = (extraEnv = {}) => spawnSync(process.execPath, [realpathSync(join(fixtureRoot, 'scripts/release/apply-recovery-migration.mjs')), migrationName, '--apply'], {
    encoding: 'utf8', timeout: 2000,
    env: { ...process.env, DRY_RUN: 'false', SUPABASE_DB_URL: connectionString, MTN_MIGRATION_LOCK_TIMEOUT_MS: '100', MTN_MIGRATION_STATEMENT_TIMEOUT_MS: '1000', ...extraEnv },
  });

  // A backup holds ACCESS SHARE; replacing the view must fail promptly and undo
  // even statements completed before the blocked DDL. No production is touched.
  await client.query('begin; select * from public.locked_health_view');
  const blocked = run();
  await client.query('rollback');
  assert.equal(blocked.error, undefined, 'runner must reject the lock before the external process timeout');
  assert.equal(blocked.status, 1, JSON.stringify(blocked));
  assert.match(blocked.stderr, /lock timeout/);
  assert.equal((await client.query('select count(*) from public.migration_probe')).rows[0].count, '0', 'partial DML must roll back');
  assert.equal((await client.query('select count(*) from supabase_migrations.schema_migrations')).rows[0].count, '0', 'failed migration must not enter the ledger');
  assert.equal((await client.query('select health from public.locked_health_view')).rows[0].health, 1);

  writeFileSync(fixtureMigration, 'insert into public.migration_probe values (1); select pg_sleep(1);');
  const slow = run({ MTN_MIGRATION_STATEMENT_TIMEOUT_MS: '100' });
  assert.equal(slow.error, undefined);
  assert.equal(slow.status, 1);
  assert.match(slow.stderr, /statement timeout/);
  assert.equal((await client.query('select count(*) from public.migration_probe')).rows[0].count, '0');
  assert.equal((await client.query('select count(*) from supabase_migrations.schema_migrations')).rows[0].count, '0');
  writeFileSync(fixtureMigration, fixtureSql);

  const invalid = run({ MTN_MIGRATION_LOCK_TIMEOUT_MS: '0' });
  assert.equal(invalid.status, 1, 'zero must not disable the bounded lock timeout');
  assert.match(invalid.stderr, /MTN_MIGRATION_LOCK_TIMEOUT_MS/);
  const successful = run();
  assert.equal(successful.status, 0, successful.stderr);
  assert.equal((await client.query('select health from public.locked_health_view')).rows[0].health, 2);
  assert.equal((await client.query('select count(*) from public.migration_probe')).rows[0].count, '1');
  assert.equal((await client.query('select version from supabase_migrations.schema_migrations')).rows[0].version, version);
  assert.equal(run().status, 0, 'reapplying a recorded migration stays idempotent');
  assert.equal((await client.query('select count(*) from public.migration_probe')).rows[0].count, '1');
  console.log('Recovery migration bounded-lock PostgreSQL integration tests passed.');
} finally {
  if (client) await client.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
}
