import { NextResponse } from 'next/server';
import { validateOperationsMonitorRequest } from '@/lib/auth/operations-monitor';
import { evaluateOperationsHealth } from '@/lib/operations/health';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import schedulerManifest from '@/infra/release/production-scheduler-manifest.json';

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
  const body = { ...health, dependencyErrors };
  return response(body, health.status === 'FAILED' ? 503 : 200);
}
