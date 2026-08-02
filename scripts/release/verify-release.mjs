#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  runCleanClonePreflight,
  runReleasePreflight,
} from './preflight-lib.mjs';

function parseArgs(argv) {
  const options = {
    repoRoot: process.cwd(),
    allowDirty: false,
    verifyCleanClone: false,
  };
  for (const raw of argv) {
    if (raw === '--allow-dirty') options.allowDirty = true;
    else if (raw === '--verify-clean-clone') options.verifyCleanClone = true;
    else if (raw.startsWith('--repo-root=')) options.repoRoot = raw.slice('--repo-root='.length);
    else if (raw.startsWith('--expected-sha=')) options.expectedSha = raw.slice('--expected-sha='.length);
    else if (raw.startsWith('--base-url=')) options.baseUrl = raw.slice('--base-url='.length);
    else if (raw.startsWith('--output=')) options.output = raw.slice('--output='.length);
    else if (raw.startsWith('--timeout-ms=')) options.timeoutMs = Number(raw.slice('--timeout-ms='.length));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (options.allowDirty && options.verifyCleanClone) {
    throw new Error('--allow-dirty cannot be combined with --verify-clean-clone.');
  }
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000)) {
    throw new Error('--timeout-ms must be an integer of at least 1000.');
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = options.verifyCleanClone
    ? await runCleanClonePreflight(options)
    : await runReleasePreflight(options);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, { flag: 'wx' });
  }
  process.stdout.write(serialized);
  if (!result.releaseEligible) {
    process.stderr.write('Release preflight completed in development-only mode; the worktree is not release eligible.\n');
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exitCode = 1;
});
