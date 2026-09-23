import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export function parseMigrationArgs(args) {
  const files = args.filter((arg) => /^\d{14}_[a-z0-9_]+\.sql$/.test(arg));
  if (files.length !== 1 || args.some((arg) => arg !== files[0] && !['--apply', '--dry-run'].includes(arg))) {
    throw new Error('Usage: apply-recovery-migration.mjs <14-digit_name.sql> [--apply | --dry-run]');
  }
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('Conflicting execution modes.');
  return { file: files[0], apply: args.includes('--apply') && process.env.DRY_RUN !== 'true' };
}

export function migrationTimeouts(env = process.env) {
  const milliseconds = (name, fallback, maximum) => {
    const raw = env[name] ?? String(fallback);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > maximum) {
      throw new Error(`${name} must be an integer between 1 and ${maximum} milliseconds.`);
    }
    return `${raw}ms`;
  };
  return {
    lock: milliseconds('MTN_MIGRATION_LOCK_TIMEOUT_MS', 3000, 60000),
    statement: milliseconds('MTN_MIGRATION_STATEMENT_TIMEOUT_MS', 60000, 600000),
  };
}

async function main() {
  const options = parseMigrationArgs(process.argv.slice(2));
  const timeouts = migrationTimeouts();
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const sql = await readFile(path.join(root, 'supabase/migrations', options.file), 'utf8');
  const version = options.file.slice(0, 14);
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  try {
    const existing = await client.query('select version from supabase_migrations.schema_migrations where version=$1', [version]);
    if (existing.rowCount) { console.log(JSON.stringify({ version, alreadyApplied: true })); return; }
    if (!options.apply) { console.log(JSON.stringify({ version, dryRun: true, bytes: Buffer.byteLength(sql) })); return; }
    const backupDir = path.join(root, 'tmp', 'migration-backups');
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const definitions = await client.query("select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mtn_internal' and p.prokind='f'");
    const ledger = await client.query('select * from supabase_migrations.schema_migrations order by version');
    const backupPath = path.join(backupDir, `${version}-${Date.now()}.json`);
    await writeFile(backupPath, JSON.stringify({ definitions: definitions.rows, migrations: ledger.rows }, null, 2), { flag: 'wx', mode: 0o600 });
    await client.query('begin');
    try {
      // Waiting DDL can block new readers behind a backup's existing read lock.
      // Bound this transaction, including its advisory lock, and roll back on timeout.
      await client.query("select set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)", [timeouts.lock, timeouts.statement]);
      await client.query("select pg_advisory_xact_lock(hashtext('mtn-recovery-migrations'))");
      const locked = await client.query('select version from supabase_migrations.schema_migrations where version=$1', [version]);
      if (locked.rowCount) { await client.query('rollback'); console.log(JSON.stringify({ version, alreadyApplied: true })); return; }
      await client.query(sql);
      await client.query('insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)', [version, options.file.slice(15, -4), [sql]]);
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    console.log(JSON.stringify({ version, applied: true, backupPath }));
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Migration failed: ${error.message}`); process.exitCode = 1; });
}
