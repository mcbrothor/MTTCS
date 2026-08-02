import assert from 'node:assert/strict';
import { buildPgServiceArtifacts } from '../scripts/lib/pg-service-file.mjs';

const { serviceConfig: config, passfile } = buildPgServiceArtifacts(
  'postgresql://backup.user:p%40ss%27word%5Cvalue@example.supabase.co:6543/postgres?sslmode=verify-full',
);
assert.match(config, /^\[mtn_backup_source\]$/m);
assert.match(config, /^host=example\.supabase\.co$/m);
assert.match(config, /^port=6543$/m);
assert.match(config, /^dbname=postgres$/m);
assert.match(config, /^user=backup\.user$/m);
assert.match(config, /^sslmode=verify-full$/m);
assert.doesNotMatch(config, /password=/);
assert.doesNotMatch(config, /postgresql:\/\//);
assert.equal(passfile, "example.supabase.co:6543:postgres:backup.user:p@ss'word\\\\value\n");

assert.throws(() => buildPgServiceArtifacts('https://user:pass@example.com/postgres'), /only postgres/);
assert.throws(() => buildPgServiceArtifacts('postgresql://user@example.com/postgres'), /password are required/);
assert.throws(
  () => buildPgServiceArtifacts('postgresql://user:pass@example.com/postgres?sslmode=no-verify'),
  /sslmode is invalid/,
);
assert.throws(
  () => buildPgServiceArtifacts('postgresql://user:pass@example.com/postgres', '../unsafe'),
  /service name is invalid/,
);

console.log('PostgreSQL service file tests passed');
