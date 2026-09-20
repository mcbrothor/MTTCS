import assert from 'node:assert/strict';
import { resolveTestPostgresBin } from '../scripts/lib/test-postgres-bin.mjs';

const binarySet = (directory) => new Set(['initdb', 'pg_ctl', 'postgres'].map((name) => `${directory}/${name}`));
{
  const available = binarySet('/usr/lib/postgresql/16/bin');
  const calls = [];
  assert.equal(resolveTestPostgresBin({ env: {}, platform: 'linux', isExecutable: (file) => available.has(file), run: (command, args) => {
    calls.push([command, args]); return '/usr/lib/postgresql/16/bin\n';
  } }), '/usr/lib/postgresql/16/bin', 'Ubuntu pg_config selects installed version without a Homebrew dependency');
  assert.deepEqual(calls, [['pg_config', ['--bindir']]]);
}
{
  const available = binarySet('/custom/postgres/bin');
  assert.equal(resolveTestPostgresBin({ env: { MTN_TEST_POSTGRES_BIN: '/custom/postgres/bin' }, platform: 'linux', isExecutable: (file) => available.has(file), run: () => { assert.fail('explicit configuration must take precedence'); } }), '/custom/postgres/bin');
  assert.throws(() => resolveTestPostgresBin({ env: { MTN_TEST_POSTGRES_BIN: '/missing/bin' }, isExecutable: () => false, run: () => { assert.fail('invalid explicit config must not silently fall back'); } }), /must contain executable/);
}
{
  const available = binarySet('/opt/homebrew/opt/postgresql@17/bin');
  assert.equal(resolveTestPostgresBin({ env: {}, platform: 'darwin', isExecutable: (file) => available.has(file), run: () => { throw new Error('ENOENT'); } }), '/opt/homebrew/opt/postgresql@17/bin');
  assert.throws(() => resolveTestPostgresBin({ env: {}, platform: 'linux', isExecutable: (file) => available.has(file), run: () => { throw new Error('ENOENT'); } }), /Tests were not skipped/);
}
{
  assert.throws(() => resolveTestPostgresBin({ env: {}, platform: 'linux', isExecutable: (file) => file.endsWith('/pg_ctl'), run: () => '/usr/bin' }), /require server binaries/, 'client-only installations must fail clearly');
}
console.log('PostgreSQL test binary discovery portability tests passed');
