#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

function boundedSetting(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

try {
  if (process.env.DRY_RUN === 'true') {
    console.log('DRY_RUN=true: check backup source with bounded read-only connection retries.');
  } else {
    const [psql, service] = process.argv.slice(2);
    if (!psql || !/^service=[a-z][a-z0-9_]+$/.test(service || '')) {
      throw new Error('Usage: backup-connection-preflight.mjs PSQL_BIN service=SERVICE_NAME');
    }
    const attempts = boundedSetting('MTN_BACKUP_CONNECT_ATTEMPTS', 5, 1, 10);
    const retryMs = boundedSetting('MTN_BACKUP_CONNECT_RETRY_MS', 15_000, 0, 60_000);
    const timeoutMs = boundedSetting('MTN_BACKUP_CONNECT_TIMEOUT_MS', 35_000, 100, 60_000);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = spawnSync(psql, [service, '--no-psqlrc', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', 'select 1;'], {
        encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024,
      });
      if (result.status === 0 && result.stdout.trim() === '1') {
        console.log(`Backup source connection ready (attempt ${attempt}/${attempts}).`);
        break;
      }
      const transient = result.error?.code === 'ETIMEDOUT'
        || /ECHECKOUTTIMEOUT|timeout|timed out|connection refused|could not (?:connect|translate host name)|server closed the connection|database system is (?:starting up|in recovery)/i.test(result.stderr || '');
      // Keep connection strings and server error bodies out of CI diagnostics.
      console.error(`Backup source connection failed (${attempt}/${attempts}, ${transient ? 'transient' : 'non-transient'}).`);
      if (!transient || attempt === attempts) throw new Error('Backup source connection preflight failed; no dump or restore was started.');
      await sleep(retryMs);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
