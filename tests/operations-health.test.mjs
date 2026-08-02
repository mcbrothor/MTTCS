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
  assert.equal(result.checks.capacity.status, 'HEALTHY');
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
