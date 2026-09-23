#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { postBackupFailureEvidence } from './lib/backup-failure-evidence.mjs';

try {
  const table = process.argv[2];
  if (!['operations_backup_runs', 'assurance_control_evidence'].includes(table)) throw new Error('Unsupported backup evidence table.');
  if (process.env.DRY_RUN === 'true') {
    console.log(`DRY_RUN=true: record backup failure evidence in ${table}.`);
  } else {
    const baseUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !key) throw new Error('Backup evidence Supabase configuration is missing.');
    const body = readFileSync(0, 'utf8');
    if (!Array.isArray(JSON.parse(body))) throw new Error('Backup evidence must be a JSON array.');
    await postBackupFailureEvidence({
      url: `${baseUrl.replace(/\/$/, '')}/rest/v1/${table}`, key, body,
      prefer: table === 'assurance_control_evidence' ? 'resolution=ignore-duplicates,return=minimal' : 'return=minimal',
    });
  }
} catch (error) {
  console.error(`Backup failure evidence was not confirmed: ${error.message}`);
  process.exitCode = 1;
}
