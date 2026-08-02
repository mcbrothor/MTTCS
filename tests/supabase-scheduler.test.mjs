import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260801133000_supabase_scheduler_control_plane.sql', import.meta.url),
  'utf8',
);
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const legacyCleanup = readFileSync(
  new URL('../supabase/migrations/20260801135500_remove_legacy_cron_invoker.sql', import.meta.url),
  'utf8',
);

const expectedJobs = {
  'mtn-snapshot-macro': ['/api/cron/snapshot-market-state?type=macro', '0 21 * * *', 1, 93600],
  'mtn-snapshot-master-us': ['/api/cron/snapshot-market-state?market=US&type=master-filter', '5 21 * * *', 1, 93600],
  'mtn-snapshot-master-kr': ['/api/cron/snapshot-market-state?market=KR&type=master-filter', '10 07 * * *', 1, 93600],
  'mtn-contest-review-us': ['/api/cron/contest-review-us', '0 04 * * *', 1, 93600],
  'mtn-contest-review-kr': ['/api/cron/contest-review-kr', '0 08 * * *', 1, 93600],
  'mtn-daily-screeners': ['/api/cron/daily-screeners', '0 09 * * *', 1, 93600],
  'mtn-recommendation-performance-us-0': ['/api/cron/recommendation-performance?market=US&shard=0&shards=4', '30 06 * * *', 1, 93600],
  'mtn-recommendation-performance-us-1': ['/api/cron/recommendation-performance?market=US&shard=1&shards=4', '35 06 * * *', 1, 93600],
  'mtn-recommendation-performance-us-2': ['/api/cron/recommendation-performance?market=US&shard=2&shards=4', '40 06 * * *', 1, 93600],
  'mtn-recommendation-performance-us-3': ['/api/cron/recommendation-performance?market=US&shard=3&shards=4', '45 06 * * *', 1, 93600],
  'mtn-recommendation-performance-kr-0': ['/api/cron/recommendation-performance?market=KR&shard=0&shards=4', '10 08 * * *', 1, 93600],
  'mtn-recommendation-performance-kr-1': ['/api/cron/recommendation-performance?market=KR&shard=1&shards=4', '15 08 * * *', 1, 93600],
  'mtn-recommendation-performance-kr-2': ['/api/cron/recommendation-performance?market=KR&shard=2&shards=4', '20 08 * * *', 1, 93600],
  'mtn-recommendation-performance-kr-3': ['/api/cron/recommendation-performance?market=KR&shard=3&shards=4', '25 08 * * *', 1, 93600],
  'mtn-recommendation-weekly': ['/api/cron/recommendation-weekly', '0 07 * * 6', 1, 691200],
  'mtn-rs-metrics-us': ['/api/cron/rs-metrics?market=US', '15 21 * * 1-5', 1, 352800],
  'mtn-risk-barometer': ['/api/cron/risk-barometer?dryRun=false', '30 22 * * 1-5', 1, 352800],
  'mtn-rs-metrics-kr': ['/api/cron/rs-metrics?market=KR', '15 07 * * 1-5', 1, 352800],
  'mtn-edgar-backfill-a': ['/api/cron/edgar-backfill?wave=A&size=80', '30 02 * * *', 1, 93600],
  'mtn-edgar-backfill-b': ['/api/cron/edgar-backfill?wave=B&size=80', '0 03 * * *', 1, 93600],
  'mtn-gold-strategy': ['/api/cron/gold-strategy?dryRun=false', '30 23 * * *', 1, 93600],
  'mtn-nasdaq-strategy': ['/api/cron/nasdaq-strategy?dryRun=false', '45 23 * * 1-5', 1, 352800],
  'mtn-market-intelligence-feeds': ['/api/cron/market-intelligence?mode=feeds', '*/30 * * * *', 30, 2700],
  'mtn-market-intelligence-indicators': ['/api/cron/market-intelligence?mode=indicators', '35,45,55 12,13 * * *', 10, 93600],
};

const actualJobs = {};
const rowPattern = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*(\d+),\s*true,\s*now\(\)\)/g;
for (const match of migration.matchAll(rowPattern)) {
  actualJobs[match[1]] = [match[2], match[3], Number(match[4]), Number(match[5])];
}

assert.deepEqual(actualJobs, expectedJobs, 'Supabase must own the complete reviewed schedule registry');
assert.equal(Object.hasOwn(vercel, 'crons'), false, 'Vercel must not retain a second scheduler');

assert.match(migration, /unique \(job_name, slot_started_at\)/i);
assert.match(
  migration,
  /on conflict on constraint cron_http_runs_job_name_slot_started_at_key do nothing/i,
);
assert.match(migration, /from net\._http_response/i);
assert.match(migration, /create view public\.cron_scheduler_alerts/i);
assert.match(migration, /where health_status in \('FAILED', 'STALE'\)/i);
assert.match(migration, /alter table public\.cron_http_runs enable row level security/i);
assert.match(migration, /revoke all on table public\.cron_http_runs from public, anon, authenticated/i);
assert.match(migration, /grant select on table public\.cron_http_runs to service_role/i);
assert.match(migration, /security definer[\s\S]+set search_path = ''/i);
assert.doesNotMatch(migration, /https:\/\/mttcs\.vercel\.app/i, 'production origins belong in Vault');
assert.match(legacyCleanup, /drop function if exists mtn_internal\.invoke_cron\(text\)/i);

console.log('Supabase scheduler tests passed');
