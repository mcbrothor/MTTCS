import { stableEvidenceHash } from '@/lib/recommendations/evidence-performance';

export type AssuranceControlKey =
  | 'RELEASE_CI'
  | 'BRANCH_PROTECTION'
  | 'SECRETS_LEAST_PRIVILEGE'
  | 'EXTERNAL_HEALTH'
  | 'BACKUP_RESTORE'
  | 'RECOVERY_DRILL'
  | 'ACCESSIBILITY_AUTOMATED'
  | 'ACCESSIBILITY_MANUAL';

export type AssuranceControlStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export function buildAssuranceControlEvidenceRow(input: {
  controlKey: AssuranceControlKey;
  status: AssuranceControlStatus;
  sourceKind: 'GITHUB_ACTIONS' | 'GITHUB_API' | 'OPERATIONS_MONITOR' | 'BACKUP_LEDGER' | 'MANUAL_REVIEW' | 'DEPLOYMENT';
  sourceRecordId: string;
  observedAt: string;
  validForSeconds: number;
  payload: Record<string, unknown>;
  environment?: 'PRODUCTION' | 'STAGING' | 'TEST';
  releaseSha?: string | null;
}) {
  const observedTime = Date.parse(input.observedAt);
  if (!Number.isFinite(observedTime)) throw new Error('Assurance control observedAt must be a valid timestamp.');
  if (!Number.isFinite(input.validForSeconds) || input.validForSeconds <= 0) {
    throw new Error('Assurance control validity must be positive.');
  }
  const releaseSha = input.releaseSha && /^[a-f0-9]{40}$/.test(input.releaseSha)
    ? input.releaseSha
    : null;
  const payloadHash = stableEvidenceHash(input.payload);
  const observedDate = new Date(observedTime);
  const identityBucket = input.controlKey === 'EXTERNAL_HEALTH'
    ? `${input.observedAt.slice(0, 10)}T${String(Math.floor(observedDate.getUTCHours() / 3) * 3).padStart(2, '0')}`
    : input.observedAt.slice(0, 10);
  const evidenceHash = stableEvidenceHash({
    controlKey: input.controlKey,
    status: input.status,
    environment: input.environment || 'PRODUCTION',
    identityBucket,
    releaseSha,
    sourceRecordId: input.sourceRecordId,
    payloadHash,
  });
  return {
    evidence_hash: evidenceHash,
    control_key: input.controlKey,
    environment: input.environment || 'PRODUCTION',
    status: input.status,
    source_kind: input.sourceKind,
    source_record_id: input.sourceRecordId,
    release_sha: releaseSha,
    observed_at: input.observedAt,
    valid_until: new Date(observedTime + input.validForSeconds * 1000).toISOString(),
    payload: input.payload,
    payload_hash: payloadHash,
  };
}
