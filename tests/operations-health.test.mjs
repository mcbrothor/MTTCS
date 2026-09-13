import assert from 'node:assert/strict';
import { evaluateOperationsHealth } from '../lib/operations/health.ts';

const now = new Date('2026-08-02T03:00:00.000Z');

{
  const result = evaluateOperationsHealth({
    now,
    schedulerRows: [
      { job_name: 'daily', health_status: 'HEALTHY', last_success_at: '2026-08-02T02:55:00.000Z' },
    ],
    expectedSchedulerJobs: ['daily'],
    workerRows: [
      { component: 'local-analysis', status: 'IDLE', observed_at: '2026-08-02T02:58:00.000Z' },
      { component: 'codex-llm', status: 'IDLE', observed_at: '2026-08-02T02:58:00.000Z' },
    ],
    backupRows: [
      { status: 'SUCCESS', completed_at: '2026-08-01T16:30:00.000Z' },
    ],
    capacity: {
      used_bytes: 150_000_000,
      captured_at: '2026-08-02T02:50:00.000Z',
      warning_bytes: 350_000_000,
      block_bytes: 400_000_000,
    },
  });
  assert.equal(result.status, 'HEALTHY');
  assert.equal(result.checks.scheduler.failedCount, 0);
  assert.equal(result.checks.workers.staleComponents.length, 0);
  assert.equal(result.checks.backup.status, 'HEALTHY');
  assert.equal(result.checks.backup.reason, 'NORMAL');
  assert.equal(result.checks.capacity.status, 'HEALTHY');
}

{
  const MiB = 1024 * 1024;
  const base = {
    now,
    schedulerRows: [{ job_name: 'daily', health_status: 'HEALTHY' }],
    expectedSchedulerJobs: ['daily'],
    workerRows: [
      { component: 'local-analysis', status: 'IDLE', observed_at: '2026-08-02T02:58:00.000Z' },
      { component: 'codex-llm', status: 'IDLE', observed_at: '2026-08-02T02:58:00.000Z' },
    ],
    backupRows: [{ status: 'SUCCESS', completed_at: '2026-08-01T20:00:00.000Z' }],
    capacity: {
      used_bytes: 258 * MiB,
      captured_at: '2026-08-02T02:50:00.000Z',
      info_bytes: 250 * MiB,
      warning_bytes: 350 * MiB,
      block_bytes: 400 * MiB,
    },
  };
  const watch = evaluateOperationsHealth(base);
  assert.equal(watch.status, 'HEALTHY', '258/400 MiB is informational and must permit overall recovery');
  assert.equal(watch.checks.capacity.status, 'HEALTHY');
  assert.equal(watch.checks.capacity.reason, 'WATCH', 'capacity watch remains available as operator information');
  assert.equal(watch.checks.capacity.usedBytes, 258 * MiB);
  const warning = evaluateOperationsHealth({ ...base, capacity: { ...base.capacity, used_bytes: 350 * MiB } });
  assert.equal(warning.status, 'DEGRADED');
  assert.equal(warning.checks.capacity.reason, 'WARNING');
  const blocked = evaluateOperationsHealth({ ...base, capacity: { ...base.capacity, used_bytes: 400 * MiB } });
  assert.equal(blocked.status, 'FAILED');
  assert.equal(blocked.checks.capacity.reason, 'BLOCKED');
  const aging = evaluateOperationsHealth({ ...base, capacity: { ...base.capacity, captured_at: '2026-08-01T02:00:00Z' } });
  assert.equal(aging.checks.capacity.status, 'DEGRADED', '25h-old capacity data must retain its existing freshness warning');
  const stale = evaluateOperationsHealth({ ...base, capacity: { ...base.capacity, captured_at: '2026-08-01T00:00:00Z' } });
  assert.equal(stale.status, 'FAILED');
  assert.equal(stale.checks.capacity.reason, 'STALE');
  const staleBackup = evaluateOperationsHealth({ ...base, backupRows: [{ status: 'SUCCESS', completed_at: '2026-07-31T20:00:00Z' }] });
  assert.equal(staleBackup.checks.backup.status, 'FAILED');
  assert.equal(staleBackup.checks.backup.reason, 'STALE');
  const failedBackup = evaluateOperationsHealth({ ...base, backupRows: [{ status: 'FAILED', completed_at: '2026-08-02T02:50:00Z' }] });
  assert.equal(failedBackup.checks.backup.status, 'FAILED');
  assert.equal(failedBackup.checks.backup.reason, 'FAILED_RUN');
}

{
  const result = evaluateOperationsHealth({
    now,
    schedulerRows: [
      { job_name: 'daily', health_status: 'HEALTHY', last_success_at: '2026-08-02T02:55:00.000Z' },
      { job_name: 'weekly', health_status: 'PENDING', last_success_at: null },
      { job_name: 'collector', health_status: 'RUNNING', last_success_at: '2026-08-02T02:50:00.000Z' },
    ],
    expectedSchedulerJobs: ['daily', 'weekly', 'collector'],
    workerRows: [
      { component: 'local-analysis', status: 'IDLE', observed_at: '2026-08-02T02:58:00.000Z' },
      { component: 'codex-llm', status: 'IDLE', observed_at: '2026-08-02T02:58:00.000Z' },
    ],
    backupRows: [{ status: 'SUCCESS', completed_at: '2026-08-01T20:00:00.000Z' }],
    capacity: {
      used_bytes: 150_000_000,
      captured_at: '2026-08-02T02:50:00.000Z',
      warning_bytes: 350_000_000,
      block_bytes: 400_000_000,
    },
  });
  assert.equal(result.status, 'HEALTHY');
  assert.deepEqual(result.checks.scheduler.pendingJobs, ['collector', 'weekly']);
}

{
  const result = evaluateOperationsHealth({
    now,
    schedulerRows: [
      { job_name: 'daily', health_status: 'FAILED', last_success_at: '2026-08-01T02:00:00.000Z', error_message: 'HTTP 500' },
    ],
    expectedSchedulerJobs: ['daily'],
    workerRows: [
      { component: 'local-analysis', status: 'RUNNING', observed_at: '2026-08-02T02:30:00.000Z' },
    ],
    backupRows: [],
    capacity: {
      used_bytes: 405_000_000,
      captured_at: '2026-08-02T02:50:00.000Z',
      warning_bytes: 350_000_000,
      block_bytes: 400_000_000,
    },
  });
  assert.equal(result.status, 'FAILED');
  assert.deepEqual(result.checks.scheduler.failedJobs, ['daily']);
  assert.deepEqual(result.checks.workers.missingComponents, ['codex-llm']);
  assert.equal(result.checks.backup.status, 'FAILED');
  assert.equal(result.checks.capacity.status, 'FAILED');
  assert.ok(result.fingerprint.length >= 16);

  const later = evaluateOperationsHealth({
    now: new Date('2026-08-02T03:05:00.000Z'),
    schedulerRows: [
      { job_name: 'daily', health_status: 'FAILED', last_success_at: '2026-08-01T02:00:00.000Z', error_message: 'HTTP 500' },
    ],
    expectedSchedulerJobs: ['daily'],
    workerRows: [
      { component: 'local-analysis', status: 'RUNNING', observed_at: '2026-08-02T02:30:00.000Z' },
    ],
    backupRows: [],
    capacity: {
      used_bytes: 405_000_000,
      captured_at: '2026-08-02T02:50:00.000Z',
      warning_bytes: 350_000_000,
      block_bytes: 400_000_000,
    },
  });
  assert.equal(
    later.fingerprint,
    result.fingerprint,
    'incident identity must not change only because age counters advanced',
  );
}

{
  const result = evaluateOperationsHealth({
    now,
    schedulerRows: [],
    expectedSchedulerJobs: ['daily'],
    workerRows: [],
    backupRows: [{ status: 'SUCCESS', completed_at: '2026-08-01T20:00:00.000Z' }],
    capacity: null,
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.checks.scheduler.status, 'FAILED');
  assert.equal(result.checks.capacity.status, 'FAILED');
}

{
  const base = {
    now,
    expectedSchedulerJobs: ['daily', 'weekly'],
    workerRows: [
      { component: 'local-analysis', status: 'IDLE', observed_at: '2026-08-02T02:58:00.000Z' },
      { component: 'codex-llm', status: 'IDLE', observed_at: '2026-08-02T02:58:00.000Z' },
    ],
    backupRows: [{ status: 'SUCCESS', completed_at: '2026-08-01T20:00:00.000Z' }],
    capacity: {
      used_bytes: 150_000_000,
      captured_at: '2026-08-02T02:50:00.000Z',
      warning_bytes: 350_000_000,
      block_bytes: 400_000_000,
    },
  };

  const missing = evaluateOperationsHealth({
    ...base,
    schedulerRows: [{ job_name: 'daily', health_status: 'HEALTHY' }],
  });
  assert.equal(missing.status, 'FAILED');
  assert.deepEqual(missing.checks.scheduler.missingJobs, ['weekly']);

  for (const healthStatus of ['DISABLED', 'UNKNOWN']) {
    const invalid = evaluateOperationsHealth({
      ...base,
      schedulerRows: [
        { job_name: 'daily', health_status: healthStatus },
        { job_name: 'weekly', health_status: 'HEALTHY' },
      ],
    });
    assert.equal(invalid.status, 'FAILED');
    assert.deepEqual(invalid.checks.scheduler.invalidJobs, ['daily']);
  }

  const staleCapacity = evaluateOperationsHealth({
    ...base,
    schedulerRows: [
      { job_name: 'daily', health_status: 'HEALTHY' },
      { job_name: 'weekly', health_status: 'HEALTHY' },
    ],
    capacity: { ...base.capacity, captured_at: '2026-07-31T23:00:00.000Z' },
  });
  assert.equal(staleCapacity.status, 'FAILED');
  assert.ok(staleCapacity.checks.capacity.ageSeconds > 26 * 60 * 60);
}

console.log('operations health tests passed');
