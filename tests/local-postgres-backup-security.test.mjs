import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/backup-local-postgres.sh', import.meta.url), 'utf8');

assert.match(script, /umask 077/, 'local backups must be owner-readable only');
assert.match(script, /chmod 700 "\$BACKUP_DIR"/, 'the local backup directory must be owner-accessible only');

console.log('local PostgreSQL backup security tests passed');
