import assert from 'node:assert/strict';
import { parseMigrationArgs } from '../scripts/release/apply-recovery-migration.mjs';
const file = '20260914010000_restore_scheduler_timeout_budgets.sql';
assert.equal(parseMigrationArgs([file]).apply, false);
assert.equal(parseMigrationArgs([file, '--apply']).apply, true);
assert.throws(() => parseMigrationArgs([file, '--apply', '--dry-run']));
assert.throws(() => parseMigrationArgs(['../' + file, '--apply']));
assert.throws(() => parseMigrationArgs([file, '--force']));
console.log('recovery migration CLI tests passed');
