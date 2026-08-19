import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = '../supabase/migrations/20260802160000_recommendation_performance_scheduler_barrier.sql';
const migration = readFileSync(new URL(migrationPath, import.meta.url), 'utf8');
const route = readFileSync(
  new URL('../app/api/cron/recommendation-performance/route.ts', import.meta.url),
  'utf8',
);
const jobs = readFileSync(new URL('../lib/recommendations/jobs.ts', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(
  new URL('../infra/release/production-scheduler-manifest.json', import.meta.url),
  'utf8',
));

assert.match(route, /export const maxDuration = 270\s*;/);
assert.match(route, /batchDate/i);
assert.match(route, /shards\s*!==\s*4/);

assert.match(migration, /timeout_milliseconds\s*:=\s*280000/i);
assert.match(migration, /interval '290 seconds'/i);
assert.match(migration, /create table if not exists public\.recommendation_performance_batch_shards/i);
assert.match(migration, /create table if not exists public\.recommendation_performance_batches/i);
assert.match(migration, /primary key \(batch_date, market, shard\)/i);
assert.match(migration, /check \(shard_count = 4\)/i);
assert.match(migration, /pg_advisory_xact_lock/i);
assert.match(migration, /create or replace function public\.claim_recommendation_performance_shard/i);
assert.match(migration, /create or replace function public\.complete_recommendation_performance_shard/i);
assert.match(migration, /create or replace function public\.claim_recommendation_performance_finalization/i);
assert.match(migration, /create or replace function public\.complete_recommendation_performance_finalization/i);
assert.match(migration, /create or replace function mtn_internal\.retry_recommendation_performance_batches/i);
assert.match(migration, /mtn-recommendation-performance-retry-sweep/i);
assert.match(migration, /batchDate=/i);
assert.match(
  migration,
  /mtn-recommendation-performance-retry-%s-%s-%s[\s\S]+to_char\(batch_run\.batch_date,\s*'YYYYMMDD'\)/i,
  'retry ledger identity must include batchDate so older batches cannot consume the current batch slot',
);
assert.doesNotMatch(
  migration,
  /insert\s+into\s+public\.cron_job_definitions/i,
  'retry sweep must not add an HTTP registry job',
);

assert.match(jobs, /finalizeRecommendationPerformanceBatchIfReady/);
assert.match(jobs, /batch_date:\s*batchDate/);
assert.match(jobs, /barrier_status:/);
assert.doesNotMatch(
  jobs,
  /shard\s*===\s*shards\s*-\s*1[\s\S]{0,200}refreshRecommendationDiagnostics/,
  'the last-arriving shard must not bypass the 4\/4 success barrier',
);

assert.equal(manifest.expectedJobCount, 34);
assert.equal(manifest.jobs.length, 34);
assert.equal(new Set(manifest.jobs.map((job) => job.path)).size, 34);
assert.ok(
  manifest.requiredMigrations.includes(
    'supabase/migrations/20260802160000_recommendation_performance_scheduler_barrier.sql',
  ),
  'release manifest must require the forward-only barrier migration',
);

console.log('Recommendation performance scheduler barrier contract tests passed');
