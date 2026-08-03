import { NextResponse } from 'next/server';
import { validateOperationsMonitorRequest } from '@/lib/auth/operations-monitor';
import { evaluateOperationsHealth } from '@/lib/operations/health';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import schedulerManifest from '@/infra/release/production-scheduler-manifest.json';
import { buildAssuranceControlEvidenceRow } from '@/lib/assurance/control-evidence';

export const dynamic = 'force-dynamic';

const expectedSchedulerJobs = schedulerManifest.jobs.map((job) => job.name);

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}

export async function GET(request: Request) {
  if (!process.env.MTN_HEALTH_MONITOR_TOKEN?.trim()) {
    return response({ error: 'Operations monitor is not configured.' }, 503);
  }
  if (!validateOperationsMonitorRequest(request)) {
    return response({ error: 'Unauthorized' }, 401);
  }

  const db = getSupabaseAdmin();
  const [scheduler, workers, backups, capacitySnapshot] = await Promise.all([
    db
      .from('cron_scheduler_health')
      .select('job_name, health_status, last_success_at, error_message'),
    db
      .from('operations_component_heartbeats')
      .select('component, status, observed_at')
      .order('observed_at', { ascending: false }),
    db
      .from('operations_backup_runs')
      .select('status, completed_at')
      .order('completed_at', { ascending: false })
      .limit(1),
    db
      .from('database_capacity_snapshots')
      .select('database_bytes, captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const dependencyErrors = [
    ['scheduler', scheduler.error],
    ['workers', workers.error],
    ['backups', backups.error],
    ['capacity', capacitySnapshot.error],
  ].filter((entry) => entry[1]).map(([dependency, error]) => ({
    dependency,
    error: error instanceof Error ? error.message : String((error as { message?: string })?.message || error),
  }));

  const capacity = capacitySnapshot.data && !capacitySnapshot.error
    ? {
        used_bytes: Number(capacitySnapshot.data.database_bytes),
        captured_at: capacitySnapshot.data.captured_at,
        info_bytes: 250 * 1024 * 1024,
        warning_bytes: 350 * 1024 * 1024,
        block_bytes: 400 * 1024 * 1024,
      }
    : null;
  const health = evaluateOperationsHealth({
    schedulerRows: scheduler.error ? [] : scheduler.data || [],
    expectedSchedulerJobs,
    workerRows: workers.error ? [] : workers.data || [],
    backupRows: backups.error ? [] : backups.data || [],
    capacity,
  });
  const assuranceRow = buildAssuranceControlEvidenceRow({
    controlKey: 'EXTERNAL_HEALTH',
    status: health.status === 'HEALTHY' ? 'PASS' : 'FAIL',
    sourceKind: 'OPERATIONS_MONITOR',
    sourceRecordId: health.fingerprint,
    observedAt: health.checkedAt,
    validForSeconds: 4 * 60 * 60,
    releaseSha: process.env.MTN_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
    payload: {
      healthStatus: health.status,
      fingerprint: health.fingerprint,
      schedulerStatus: health.checks.scheduler.status,
      workerStatus: health.checks.workers.status,
      backupStatus: health.checks.backup.status,
      capacityStatus: health.checks.capacity.status,
    },
  });
  const { error: assuranceError } = await db
    .from('assurance_control_evidence')
    .upsert(assuranceRow, { onConflict: 'evidence_hash', ignoreDuplicates: true });
  const allDependencyErrors = assuranceError
    ? [...dependencyErrors, {
        dependency: 'assurance-control-evidence',
        error: assuranceError instanceof Error
          ? assuranceError.message
          : String((assuranceError as { message?: string })?.message || assuranceError),
      }]
    : dependencyErrors;
  const body = {
    ...health,
    status: assuranceError ? 'FAILED' : health.status,
    dependencyErrors: allDependencyErrors,
  };
  return response(body, health.status === 'FAILED' || assuranceError ? 503 : 200);
}
