import { createHash } from 'node:crypto';

export type OperationsStatus = 'HEALTHY' | 'DEGRADED' | 'FAILED';

interface SchedulerRow {
  job_name: string;
  health_status: string;
  last_success_at?: string | null;
  error_message?: string | null;
}

interface WorkerRow {
  component: string;
  status: string;
  observed_at: string;
}

interface BackupRow {
  status: string;
  completed_at: string;
}

interface CapacityStatus {
  used_bytes: number;
  captured_at: string;
  info_bytes?: number;
  warning_bytes: number;
  block_bytes: number;
}

interface EvaluateOperationsHealthInput {
  now?: Date;
  schedulerRows: SchedulerRow[];
  expectedSchedulerJobs: string[];
  workerRows: WorkerRow[];
  backupRows: BackupRow[];
  capacity: CapacityStatus | null;
  requiredWorkerComponents?: string[];
  workerStaleAfterSeconds?: number;
  backupStaleAfterSeconds?: number;
  capacityStaleAfterSeconds?: number;
}

const statusRank: Record<OperationsStatus, number> = {
  HEALTHY: 0,
  DEGRADED: 1,
  FAILED: 2,
};

function worstStatus(statuses: OperationsStatus[]): OperationsStatus {
  return statuses.reduce(
    (worst, status) => (statusRank[status] > statusRank[worst] ? status : worst),
    'HEALTHY' as OperationsStatus,
  );
}

function secondsSince(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function capacityIncidentReason(input: {
  capacity: CapacityStatus | null;
  ageSeconds: number | null;
  staleAfterSeconds: number;
}) {
  if (!input.capacity) return 'MISSING';
  if (!Number.isFinite(input.capacity.used_bytes)) return 'INVALID_USAGE';
  if (input.ageSeconds === null) return 'INVALID_CAPTURE';
  if (input.ageSeconds > input.staleAfterSeconds) return 'STALE';
  if (input.capacity.used_bytes >= input.capacity.block_bytes) return 'BLOCKED';
  if (input.capacity.used_bytes >= input.capacity.warning_bytes) return 'WARNING';
  return input.capacity.used_bytes >= (input.capacity.info_bytes ?? 250_000_000) ? 'WATCH' : 'NORMAL';
}

export function evaluateOperationsHealth(input: EvaluateOperationsHealthInput) {
  const now = input.now || new Date();
  const requiredWorkerComponents = input.requiredWorkerComponents || ['local-analysis', 'codex-llm'];
  // Free-tier Mac mini sleeps overnight; 15m was too strict and caused continuous FAILED.
  // Allow 2h grace, and treat stale as DEGRADED (alert still fires) instead of immediate FAILED.
  const workerStaleAfterSeconds = input.workerStaleAfterSeconds ?? 2 * 60 * 60;
  const workerHardStaleAfterSeconds = input.workerStaleAfterSeconds ?? 24 * 60 * 60;
  const backupStaleAfterSeconds = input.backupStaleAfterSeconds ?? 30 * 60 * 60;
  const capacityStaleAfterSeconds = input.capacityStaleAfterSeconds ?? 26 * 60 * 60;

  const expectedSchedulerJobs = [...new Set(input.expectedSchedulerJobs)].sort();
  const observedJobCounts = new Map<string, number>();
  for (const row of input.schedulerRows) {
    observedJobCounts.set(row.job_name, (observedJobCounts.get(row.job_name) || 0) + 1);
  }
  const observedJobNames = [...observedJobCounts.keys()].sort();
  const expectedJobSet = new Set(expectedSchedulerJobs);
  const missingJobs = expectedSchedulerJobs.filter((job) => !observedJobCounts.has(job));
  const unexpectedJobs = observedJobNames.filter((job) => !expectedJobSet.has(job));
  const duplicateJobs = observedJobNames.filter((job) => (observedJobCounts.get(job) || 0) > 1);
  const failedJobs = input.schedulerRows
    .filter((row) => ['FAILED', 'STALE'].includes(String(row.health_status).toUpperCase()))
    .map((row) => row.job_name)
    .sort();
  const pendingJobs = input.schedulerRows
    .filter((row) => ['PENDING', 'RUNNING'].includes(String(row.health_status).toUpperCase()))
    .map((row) => row.job_name)
    .sort();
  const invalidJobs = input.schedulerRows
    .filter((row) => !['HEALTHY', 'PENDING', 'RUNNING', 'FAILED', 'STALE'].includes(
      String(row.health_status).toUpperCase(),
    ))
    .map((row) => row.job_name)
    .sort();
  const schedulerStatus: OperationsStatus = expectedSchedulerJobs.length === 0
    || missingJobs.length > 0
    || unexpectedJobs.length > 0
    || duplicateJobs.length > 0
    || failedJobs.length > 0
    || invalidJobs.length > 0
    ? 'FAILED'
    : 'HEALTHY';

  const latestWorkerByComponent = new Map<string, WorkerRow>();
  for (const row of input.workerRows) {
    const previous = latestWorkerByComponent.get(row.component);
    if (!previous || Date.parse(row.observed_at) > Date.parse(previous.observed_at)) {
      latestWorkerByComponent.set(row.component, row);
    }
  }
  const missingComponents = requiredWorkerComponents.filter((component) => !latestWorkerByComponent.has(component));
  const staleComponents = requiredWorkerComponents.filter((component) => {
    const age = secondsSince(latestWorkerByComponent.get(component)?.observed_at, now);
    return age !== null && age > workerStaleAfterSeconds;
  });
  const hardStaleComponents = requiredWorkerComponents.filter((component) => {
    const age = secondsSince(latestWorkerByComponent.get(component)?.observed_at, now);
    return age !== null && age > workerHardStaleAfterSeconds;
  });
  const failedComponents = requiredWorkerComponents.filter((component) => {
    const status = String(latestWorkerByComponent.get(component)?.status || '').toUpperCase();
    return ['ERROR', 'FAILED', 'STOPPING'].includes(status);
  });
  const startingComponents = requiredWorkerComponents.filter((component) => (
    String(latestWorkerByComponent.get(component)?.status || '').toUpperCase() === 'STARTING'
  ));
  const workerStatus: OperationsStatus = missingComponents.length || hardStaleComponents.length || failedComponents.length
    ? 'FAILED'
    : staleComponents.length || startingComponents.length ? 'DEGRADED' : 'HEALTHY';

  const latestBackup = [...input.backupRows]
    .sort((left, right) => Date.parse(right.completed_at) - Date.parse(left.completed_at))[0] || null;
  const backupAgeSeconds = secondsSince(latestBackup?.completed_at, now);
  const backupStatus: OperationsStatus = !latestBackup
    || String(latestBackup.status).toUpperCase() !== 'SUCCESS'
    || backupAgeSeconds === null
    || backupAgeSeconds > backupStaleAfterSeconds
    ? 'FAILED'
    : backupAgeSeconds > 24 * 60 * 60 ? 'DEGRADED' : 'HEALTHY';

  const capacity = input.capacity;
  const capacityInfoBytes = capacity?.info_bytes ?? 250_000_000;
  const capacityAgeSeconds = secondsSince(capacity?.captured_at, now);
  const capacityStatus: OperationsStatus = !capacity
    || !Number.isFinite(capacity.used_bytes)
    || capacityAgeSeconds === null
    || capacityAgeSeconds > capacityStaleAfterSeconds
    || capacity.used_bytes >= capacity.block_bytes
    ? 'FAILED'
    : capacity.used_bytes >= capacity.warning_bytes
      ? 'DEGRADED'
      : capacityAgeSeconds > 24 * 60 * 60
        ? 'DEGRADED'
      : capacity.used_bytes >= capacityInfoBytes ? 'DEGRADED' : 'HEALTHY';

  const checks = {
    scheduler: {
      status: schedulerStatus,
      expectedCount: expectedSchedulerJobs.length,
      jobCount: input.schedulerRows.length,
      failedCount: failedJobs.length,
      failedJobs,
      pendingJobs,
      missingJobs,
      unexpectedJobs,
      duplicateJobs,
      invalidJobs,
    },
    workers: {
      status: workerStatus,
      requiredComponents: requiredWorkerComponents,
      missingComponents,
      staleComponents,
      hardStaleComponents,
      failedComponents,
      latest: Object.fromEntries(requiredWorkerComponents.map((component) => {
        const row = latestWorkerByComponent.get(component);
        return [component, row ? {
          status: row.status,
          observedAt: row.observed_at,
          ageSeconds: secondsSince(row.observed_at, now),
        } : null];
      })),
    },
    backup: {
      status: backupStatus,
      completedAt: latestBackup?.completed_at || null,
      ageSeconds: backupAgeSeconds,
    },
    capacity: {
      status: capacityStatus,
      usedBytes: capacity?.used_bytes ?? null,
      capturedAt: capacity?.captured_at ?? null,
      ageSeconds: capacityAgeSeconds,
      infoBytes: capacityInfoBytes,
      warningBytes: capacity?.warning_bytes ?? null,
      blockBytes: capacity?.block_bytes ?? null,
    },
  };
  const status = worstStatus([
    schedulerStatus,
    workerStatus,
    backupStatus,
    capacityStatus,
  ]);
  const incidentIdentity = {
    status,
    scheduler: {
      status: schedulerStatus,
      failedJobs,
      missingJobs,
      unexpectedJobs,
      duplicateJobs,
      invalidJobs,
    },
    workers: {
      status: workerStatus,
      missingComponents,
      staleComponents,
      hardStaleComponents,
      failedComponents,
      startingComponents,
    },
    backup: {
      status: backupStatus,
      reason: !latestBackup
        ? 'MISSING'
        : String(latestBackup.status).toUpperCase() !== 'SUCCESS'
          ? 'FAILED_RUN'
          : backupAgeSeconds === null
            ? 'INVALID_COMPLETION'
            : backupAgeSeconds > backupStaleAfterSeconds
              ? 'STALE'
              : backupAgeSeconds > 24 * 60 * 60 ? 'AGING' : 'NORMAL',
    },
    capacity: {
      status: capacityStatus,
      reason: capacityIncidentReason({
        capacity,
        ageSeconds: capacityAgeSeconds,
        staleAfterSeconds: capacityStaleAfterSeconds,
      }),
    },
  };

  return {
    status,
    checkedAt: now.toISOString(),
    checks,
    fingerprint: fingerprint(incidentIdentity),
  };
}
