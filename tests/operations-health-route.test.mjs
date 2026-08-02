import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateOperationsMonitorRequest } from '../lib/auth/operations-monitor.ts';

{
  const request = new Request('https://example.test/api/internal/operations-health', {
    headers: { authorization: 'Bearer expected-token' },
  });
  assert.equal(validateOperationsMonitorRequest(request, { MTN_HEALTH_MONITOR_TOKEN: 'expected-token' }), true);
  assert.equal(validateOperationsMonitorRequest(request, {}), false);
}

{
  const wrong = new Request('https://example.test/api/internal/operations-health', {
    headers: { authorization: 'Bearer wrong-token' },
  });
  assert.equal(validateOperationsMonitorRequest(wrong, { MTN_HEALTH_MONITOR_TOKEN: 'expected-token' }), false);
}

const routeSource = readFileSync(new URL('../app/api/internal/operations-health/route.ts', import.meta.url), 'utf8');
assert.match(routeSource, /validateOperationsMonitorRequest\(request\)/);
assert.match(routeSource, /cron_scheduler_health/);
assert.match(routeSource, /operations_component_heartbeats/);
assert.match(routeSource, /operations_backup_runs/);
assert.match(routeSource, /database_capacity_snapshots/);
assert.match(routeSource, /production-scheduler-manifest\.json/);
assert.match(routeSource, /expectedSchedulerJobs/);
assert.match(routeSource, /captured_at:\s*capacitySnapshot\.data\.captured_at/);

const migration = readFileSync(new URL('../supabase/migrations/20260802140000_operations_health_control_plane.sql', import.meta.url), 'utf8');
assert.match(migration, /create table if not exists public\.operations_component_heartbeats/);
assert.match(migration, /create table if not exists public\.operations_backup_runs/);
assert.doesNotMatch(migration, /grant[^;]+(?:anon|authenticated)/i);

console.log('operations health route tests passed');
