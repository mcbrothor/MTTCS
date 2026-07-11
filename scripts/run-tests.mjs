import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const testsDirectory = 'tests';
const tests = readdirSync(testsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
  .map((entry) => path.join(testsDirectory, entry.name))
  .sort((left, right) => left.localeCompare(right));

const jitiBin = path.join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'jiti.cmd' : 'jiti',
);

const failures = [];
const jitiAlias = JSON.stringify({ '@': process.cwd() });
for (const testFile of tests) {
  const result = spawnSync(jitiBin, [testFile], {
    stdio: 'inherit',
    env: { ...process.env, JITI_ALIAS: process.env.JITI_ALIAS || jitiAlias, NODE_NO_WARNINGS: '1' },
  });

  if (result.status !== 0) {
    failures.push({ testFile, status: result.status ?? 1, signal: result.signal });
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} of ${tests.length} test files failed:`);
  for (const failure of failures) {
    console.error(`- ${failure.testFile} (${failure.signal || `exit ${failure.status}`})`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nAll ${tests.length} test files passed.`);
}
