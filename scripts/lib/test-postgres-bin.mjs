import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { isAbsolute, join } from 'node:path';

function executable(file) {
  try { accessSync(file, constants.X_OK); return true; }
  catch { return false; }
}

export function resolveTestPostgresBin({
  env = process.env,
  platform = process.platform,
  run = execFileSync,
  isExecutable = executable,
} = {}) {
  const valid = (directory) => isAbsolute(directory) && ['initdb', 'pg_ctl', 'postgres'].every((name) => isExecutable(join(directory, name)));
  const explicit = env.MTN_TEST_POSTGRES_BIN?.trim();
  if (explicit) {
    if (!valid(explicit)) throw new Error(`MTN_TEST_POSTGRES_BIN must contain executable initdb, pg_ctl, and postgres: ${explicit}`);
    return explicit;
  }
  try {
    const directory = String(run('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
    if (valid(directory)) return directory;
  } catch {
    // Some macOS PostgreSQL installations are intentionally absent from PATH.
  }
  if (platform === 'darwin') {
    for (const prefix of ['/opt/homebrew', '/usr/local']) {
      for (const formula of ['postgresql@17', 'postgresql@16', 'postgresql@18', 'postgresql']) {
        const directory = join(prefix, 'opt', formula, 'bin');
        if (valid(directory)) return directory;
      }
    }
  }
  throw new Error('PostgreSQL integration tests require server binaries. Install PostgreSQL with pg_config on PATH, or set MTN_TEST_POSTGRES_BIN to its bin directory. Tests were not skipped.');
}
