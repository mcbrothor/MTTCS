import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const script = new URL('../scripts/daily-screener-watchdog.mjs', import.meta.url);
const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(script.href)}); console.log('imported without execution');`], {
  env: { PATH: process.env.PATH, DRY_RUN: 'true' }, encoding: 'utf8', timeout: 10_000,
});
assert.equal(imported.status, 0, `import must not start watchdog: ${imported.stderr}`);
assert.equal(imported.stdout.trim(), 'imported without execution');

const { parseArgs } = await import(script);
assert.equal(parseArgs([], {}).dryRun, true, 'no flags must be read-only');
assert.equal(parseArgs(['--apply'], {}).dryRun, false);
assert.equal(parseArgs(['--apply', '--dry-run'], {}).dryRun, true);
assert.equal(parseArgs(['--dry-run', '--apply'], {}).dryRun, true);
assert.equal(parseArgs(['--apply'], { DRY_RUN: 'TRUE' }).dryRun, true);
assert.equal(parseArgs([], { DRY_RUN: 'false' }).dryRun, true);
assert.throws(() => parseArgs(['--aply'], {}), /Unknown argument/);
assert.throws(() => parseArgs(['--date=2026-02-30'], {}), /valid.*date/i);
assert.throws(() => parseArgs(['--apply', '--unexpected'], {}), /Unknown argument/);
assert.equal(parseArgs(['--date=2026-09-21'], {}).date, '2026-09-21');

const plist = readFileSync(new URL('../infra/launchd/com.mantori.mtn-daily-screener-watchdog.plist', import.meta.url), 'utf8');
assert.match(plist, /daily-screener-watchdog\.mjs<\/string>\s*<string>--apply<\/string>/);
console.log('Watchdog CLI safety tests passed');
