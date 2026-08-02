import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = '../supabase/migrations/20260802170000_recommendation_performance_retry_budget.sql';
const migration = readFileSync(new URL(migrationPath, import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(
  new URL('../infra/release/production-scheduler-manifest.json', import.meta.url),
  'utf8',
));

assert.match(migration, /create table if not exists mtn_internal\.recommendation_performance_retry_sweep_state/i);
assert.match(migration, /last_candidate_key text/i);
assert.match(migration, /last_slot_started_at timestamptz/i);
assert.match(migration, /pg_advisory_xact_lock/i);
assert.match(migration, /interval '10 minutes'/i);
assert.match(migration, /order by[\s\S]+candidate_key[\s\S]+limit 1/i);
assert.match(migration, /last_slot_started_at\s*=\s*sweep_slot_started_at/i);
assert.match(migration, /return case when queued_request_id is null then 0 else 1 end/i);
assert.doesNotMatch(migration, /for\s+shard_index\s+in\s+0\.\.3/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.cron_job_definitions/i);

assert.equal(
  [...migration.matchAll(/select\s+cron\.schedule\s*\(/gi)].length,
  1,
  'the repair must register exactly one 15-minute retry sweep',
);
assert.match(
  migration,
  /'mtn-recommendation-performance-retry-sweep'\s*,\s*'\*\/15 \* \* \* \*'/i,
);

assert.match(migration, /create or replace view public\.cron_scheduler_health/i);
assert.match(migration, /mtn-recommendation-performance-retry-%s-%s-\[0-9\]\{8\}/i);
assert.match(migration, /mtn-recommendation-performance-retry-finalize-%s-\[0-9\]\{8\}/i);
assert.match(migration, /order by run\.requested_at desc, run\.id desc/i);
assert.match(migration, /when latest\.status in \('FAILED', 'TIMED_OUT'\) then 'FAILED'/i);

assert.equal(manifest.expectedJobCount, 25);
assert.equal(manifest.jobs.length, 25);
assert.equal(new Set(manifest.jobs.map((job) => job.path)).size, 25);
assert.ok(
  manifest.requiredMigrations.includes(
    'supabase/migrations/20260802170000_recommendation_performance_retry_budget.sql',
  ),
  'release manifest must require the forward-only retry budget repair',
);

console.log('Recommendation performance retry budget contract tests passed');
