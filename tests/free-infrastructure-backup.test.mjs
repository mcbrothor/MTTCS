import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/db-backup.yml', import.meta.url), 'utf8');
const backupScript = readFileSync(new URL('../scripts/backup-supabase-encrypted.sh', import.meta.url), 'utf8');
const compatibilitySql = readFileSync(new URL('../scripts/restore-drill-supabase-compat.sql', import.meta.url), 'utf8');

assert.match(workflow, /MTN_BACKUP_AGE_RECIPIENT/);
assert.match(workflow, /postgresql-client-17/);
assert.match(workflow, /MTN_POSTGRES_BIN_DIR:\s*\/usr\/lib\/postgresql\/17\/bin/);
assert.match(workflow, /backup-supabase-encrypted\.sh/);
assert.match(workflow, /\.dump\.age/);
assert.match(workflow, /RESTORE_DRILL_DATABASE_URL/);
assert.match(workflow, /MTN_RESTORE_DRILL_CONFIRM:\s*EMPTY_TARGET_ONLY/);
assert.match(workflow, /operations_backup_runs/);
assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(workflow, /concurrency:/);
assert.match(workflow, /cancel-in-progress:\s*false/);
assert.match(workflow, /cron:\s*'30 4 \* \* \*'/);
assert.match(workflow, /cron:\s*'30 16 \* \* \*'/);
assert.match(workflow, /R2_ENDPOINT_URL/);
assert.match(workflow, /R2_BUCKET_NAME/);
assert.match(workflow, /R2_BACKUP_PREFIX/);
assert.match(workflow, /R2_ACCESS_KEY_ID/);
assert.match(workflow, /R2_SECRET_ACCESS_KEY/);
assert.match(workflow, /r2-backup-retention\.mjs retention --apply-retention/);
assert.match(workflow, /r2-backup-retention\.mjs plan-upload/);
assert.match(workflow, /r2-backup-retention\.mjs upload/);
assert.match(workflow, /storage_provider:\s*"R2"/);
assert.match(workflow, /github_artifact_upload\.outputs\.artifact-id/);
assert.match(workflow, /github_artifact_upload\.outputs\.artifact-digest/);
assert.match(workflow, /publication_query_count/);
assert.match(workflow, /lineage_query_count/);
assert.match(workflow, /trade_query_count/);
assert.match(workflow, /critical_query_count:3/);
assert.match(workflow, /previous_completed_at/);
assert.match(workflow, /rpo_measured/);
assert.match(workflow, /rpo_target_seconds:86400/);
assert.match(workflow, /rto_target_seconds:3600/);
assert.doesNotMatch(workflow, /rpo_seconds:86400/);
assert.match(workflow, /offsite_provider:"GITHUB_ARTIFACT"/);
assert.match(workflow, /\[\[ "\$GITHUB_ARTIFACT_DIGEST" =~ \^\(sha256:\)\?\[a-f0-9\]\{64\}\$ \]\]/);
assert.match(workflow, /if \[\[ "\$rpo_measured" != "true" \]\]; then[\s\S]{0,180}recovery_status="INCONCLUSIVE"/);
assert.match(workflow, /elif \[\[ "\$rpo_seconds" -gt 86400 \]\]; then[\s\S]{0,120}recovery_status="FAIL"/);
assert.match(workflow, /elif \[\[ "\$RESTORE_RTO_SECONDS" -gt 3600 \]\]; then[\s\S]{0,120}recovery_status="FAIL"/);
assert.match(workflow, /CRITICAL_QUERY_SMOKE[\s\S]{0,300}ROW_COUNT_RECONCILIATION/);
assert.match(workflow, /recovery_gate_passed:\$recovery_gate_passed/);
assert.match(workflow, /status:\$recovery_status/);
assert.match(workflow, /RECOVERY_DRILL:\$\{GITHUB_SHA\}:\$\{source_record_id\}:\$\{recovery_status\}/);
assert.match(workflow, /id:\s*assurance_evidence/);
assert.match(workflow, /echo "recorded=true" >> "\$GITHUB_OUTPUT"/);
assert.match(workflow, /ASSURANCE_EVIDENCE_RECORDED:\s*\$\{\{ steps\.assurance_evidence\.outputs\.recorded \}\}/);
assert.match(workflow, /if \[\[ "\$ASSURANCE_EVIDENCE_RECORDED" == "true" \]\]; then/);
assert.doesNotMatch(
  workflow,
  /control_key:"RECOVERY_DRILL",environment:"PRODUCTION",status:"PASS"[\s\S]{0,300}rpo_measured:\$rpo_measured/,
);
assert.match(workflow, /if:\s*failure\(\)/);
assert.match(workflow, /status:\s*"FAILED"/);
assert.doesNotMatch(workflow, /^\s+mtn\.dump\s*$/m);
assert.doesNotMatch(workflow, /^\s+mtn\.restore-list\.txt\s*$/m);

const recoveryGateMatch = workflow.match(
  /(recovery_status="PASS"[\s\S]*?)\n\s+if \[\[ "\$recovery_status" == "PASS" \]\]; then/,
);
assert.ok(recoveryGateMatch, 'recovery evidence status gate must be extractable');
const recoveryGateSource = recoveryGateMatch[1].replace(/^\s{10}/gm, '');
function evaluateRecoveryGate(overrides = {}) {
  const result = spawnSync('bash', ['-c', `${recoveryGateSource}\nprintf '%s|%s' "$recovery_status" "$recovery_reason"`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      rpo_measured: 'true',
      rpo_seconds: '86400',
      RESTORE_RTO_SECONDS: '3600',
      CRITICAL_QUERY_SMOKE: 'true',
      CRITICAL_QUERY_COUNT: '3',
      ROW_COUNT_RECONCILIATION: 'true',
      GITHUB_ARTIFACT_ID: '123',
      GITHUB_ARTIFACT_DIGEST: 'a'.repeat(64),
      ...overrides,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

assert.equal(evaluateRecoveryGate(), 'PASS|ALL_RECOVERY_OBJECTIVES_VERIFIED');
assert.equal(
  evaluateRecoveryGate({ GITHUB_ARTIFACT_DIGEST: `sha256:${'a'.repeat(64)}` }),
  'PASS|ALL_RECOVERY_OBJECTIVES_VERIFIED',
);
assert.equal(
  evaluateRecoveryGate({ rpo_measured: 'false', rpo_seconds: '2147483647' }),
  'INCONCLUSIVE|RPO_BASELINE_NOT_YET_MEASURED',
);
assert.equal(evaluateRecoveryGate({ rpo_seconds: '86401' }), 'FAIL|RPO_TARGET_BREACHED');
assert.equal(evaluateRecoveryGate({ RESTORE_RTO_SECONDS: '3601' }), 'FAIL|RTO_TARGET_BREACHED');
assert.equal(evaluateRecoveryGate({ CRITICAL_QUERY_SMOKE: 'false' }), 'FAIL|RESTORE_INTEGRITY_GATE_FAILED');
assert.equal(evaluateRecoveryGate({ ROW_COUNT_RECONCILIATION: 'false' }), 'FAIL|RESTORE_INTEGRITY_GATE_FAILED');
assert.equal(evaluateRecoveryGate({ GITHUB_ARTIFACT_DIGEST: 'not-a-digest' }), 'FAIL|OFFSITE_ARTIFACT_NOT_VERIFIED');

assert.match(backupScript, /mktemp -d/);
assert.match(backupScript, /MTN_POSTGRES_BIN_DIR/);
assert.match(backupScript, /pg_dump/);
assert.match(backupScript, /write-pg-service-file\.mjs/);
assert.match(backupScript, /PGSERVICEFILE/);
assert.match(backupScript, /PGPASSFILE/);
assert.match(backupScript, /SOURCE_DB_SERVICE='service=mtn_backup_source'/);
assert.match(backupScript, /unset DATABASE_URL/);
assert.doesNotMatch(backupScript, /"\$PG_DUMP_BIN" "\$DATABASE_URL"/);
assert.doesNotMatch(backupScript, /"\$PSQL_BIN" "\$DATABASE_URL"/);
assert.match(backupScript, /PG_RESTORE_BIN[^\n]*--list/);
assert.match(backupScript, /PG_RESTORE_BIN[\s\S]{0,120}--exit-on-error/);
assert.match(backupScript, /pg_export_snapshot/);
assert.match(backupScript, /set local statement_timeout = 0/i);
assert.match(backupScript, /--snapshot=/);
assert.match(backupScript, /--schema=public/);
assert.match(backupScript, /--schema=mtn_internal/);
assert.match(backupScript, /transaction isolation level repeatable read read only/i);
assert.match(backupScript, /collect_public_row_counts/);
assert.match(backupScript, /relation\.relkind in \('r', 'p'\)/);
assert.match(backupScript, /cmp -s "\$SOURCE_ROWS_PATH" "\$RESTORED_ROWS_PATH"/);
assert.match(backupScript, /Restore drill row-count reconciliation failed/);
assert.match(backupScript, /mtn_restore_drill/);
assert.match(backupScript, /--clean/);
assert.match(backupScript, /--if-exists/);
assert.match(backupScript, /--section=pre-data/);
assert.match(backupScript, /--section=data/);
assert.match(backupScript, /--section=post-data/);
assert.match(backupScript, /age[^\n]*--recipient/);
assert.match(backupScript, /DRY_RUN/);
assert.match(backupScript, /\.dump\.age/);
assert.doesNotMatch(backupScript, /echo[^\n]*DATABASE_URL/);

assert.match(compatibilitySql, /create schema if not exists extensions/i);
assert.match(compatibilitySql, /create extension if not exists "uuid-ossp"/i);
assert.match(compatibilitySql, /create table if not exists auth\.users/i);
assert.match(compatibilitySql, /create role authenticated/i);
assert.match(compatibilitySql, /create role service_role/i);
assert.match(compatibilitySql, /column_name = 'user_id'/i);

console.log('free infrastructure backup tests passed');
