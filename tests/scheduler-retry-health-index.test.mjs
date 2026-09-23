import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { resolveTestPostgresBin } from '../scripts/lib/test-postgres-bin.mjs';

const bin = resolveTestPostgresBin();
const directory = mkdtempSync(join(tmpdir(), 'mtn-health-index-'));
const dataDir = join(directory, 'data');
const port = 15000 + (process.pid % 30000);
let client;
let started = false;
const migration = readFileSync(new URL('../supabase/migrations/20260923030000_index_scheduler_retry_health.sql', import.meta.url), 'utf8');
try {
  execFileSync(join(bin, 'initdb'), ['-D', dataDir, '-A', 'trust', '--no-locale', '-U', 'postgres'], { stdio: 'pipe' });
  execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-l', join(directory, 'postgres.log'), '-o', `-F -p ${port} -k ${directory} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  client = new pg.Client({ host: directory, port, user: 'postgres', database: 'postgres' });
  await client.connect();
  await client.query(`
    create schema mtn_internal;
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.cron_http_runs (
      id bigint generated always as identity primary key, job_name text, path text, status text,
      http_status integer, requested_at timestamptz default now(), completed_at timestamptz,
      error_message text, business_status text, business_reason text
    );
    create table public.cron_job_definitions (
      job_name text primary key, path text, schedule text, expected_delay_seconds integer,
      enabled boolean, updated_at timestamptz
    );
    grant select on public.cron_http_runs, public.cron_job_definitions to service_role;
    insert into public.cron_job_definitions
      select 'mtn-recommendation-performance-' || market || '-' || shard,
        '/api/cron/recommendation-performance', '* * * * *', 93600, true, now()
      from unnest(array['kr','us']) market cross join generate_series(0,3) shard;
    insert into public.cron_job_definitions values
      ('mtn-closing-test','/api/cron/closing-bet?phase=final','* * * * *',93600,true,now());
    insert into public.cron_job_definitions
      select 'mtn-closing-' || business_status, '/api/cron/closing-bet?phase=final','* * * * *',93600,true,now()
      from unnest(array['HELD','DATA_BLOCKED','DELIVERY_FAILED','PENDING','UNKNOWN']) business_status;
    insert into public.cron_http_runs(job_name,path,status,business_status,requested_at,completed_at,error_message)
      select job_name,path,'FAILED','FAILED',now()-interval '5 minutes',now()-interval '5 minutes','original failure'
      from public.cron_job_definitions;
    insert into public.cron_http_runs(job_name,path,status,business_status,requested_at,completed_at) values
      ('mtn-recommendation-performance-retry-kr-0-20260923','/api/cron/recommendation-performance','SUCCESS','SUCCESS',now()-interval '4 minutes',now()-interval '4 minutes'),
      ('mtn-recommendation-performance-retry-us-2-20260923','/api/cron/recommendation-performance','SUCCESS','SUCCESS',now()-interval '4 minutes',now()-interval '4 minutes'),
      ('mtn-recommendation-performance-retry-us-1-20260923-extra','/api/cron/recommendation-performance','SUCCESS','SUCCESS',now()-interval '4 minutes',now()-interval '4 minutes'),
      ('mtn-closing-test','/api/cron/closing-bet?phase=final','SUCCESS','SKIPPED',now()-interval '4 minutes',now()-interval '4 minutes');
    insert into public.cron_http_runs(job_name,path,status,business_status,requested_at,completed_at,error_message) values
      ('mtn-recommendation-performance-retry-finalize-kr-20260923','/api/cron/recommendation-performance','FAILED','FAILED',now()-interval '3 minutes',now()-interval '3 minutes','finalization failed');
    insert into public.cron_http_runs(job_name,path,status,business_status,requested_at,completed_at,business_reason)
      select 'mtn-closing-' || business_status, '/api/cron/closing-bet?phase=final','SUCCESS',business_status,
        now()-interval '2 minutes',now()-interval '2 minutes',business_status || ' reason'
      from unnest(array['HELD','DATA_BLOCKED','DELIVERY_FAILED','PENDING','UNKNOWN']) business_status;
  `);
  await client.query(readFileSync(new URL('../supabase/migrations/20260923020000_restore_retry_business_health.sql', import.meta.url), 'utf8'));
  const healthQuery = 'select * from public.cron_scheduler_health order by job_name';
  const previous = (await client.query(healthQuery)).rows;
  await client.query(migration);
  assert.deepEqual((await client.query(healthQuery)).rows, previous, 'indexed view preserves every business-health output');
  const byJob = new Map(previous.map((row) => [row.job_name, row]));
  assert.equal(byJob.get('mtn-recommendation-performance-kr-0').error_message, 'finalization failed');
  assert.equal(byJob.get('mtn-recommendation-performance-us-2').health_status, 'HEALTHY');
  assert.equal(byJob.get('mtn-recommendation-performance-us-1').health_status, 'FAILED', 'malformed retry name cannot recover a job');
  assert.equal(byJob.get('mtn-closing-test').health_status, 'FAILED', 'off-window skips cannot recover closing failures');
  assert.equal(byJob.get('mtn-closing-HELD').health_status, 'HEALTHY', 'delivered no-trade decision remains successful');
  for (const status of ['DATA_BLOCKED', 'DELIVERY_FAILED']) {
    assert.equal(byJob.get(`mtn-closing-${status}`).health_status, 'FAILED');
    assert.equal(byJob.get(`mtn-closing-${status}`).error_message, `${status} reason`);
  }
  for (const status of ['PENDING', 'UNKNOWN']) {
    assert.equal(byJob.get(`mtn-closing-${status}`).error_message, 'original failure', 'incomplete work preserves previous failure');
  }

  const mappings = [
    ['mtn-recommendation-performance-retry-kr-3-20260923', 'mtn-recommendation-performance-kr-3'],
    ['mtn-recommendation-performance-retry-finalize-us-20260923', 'mtn-recommendation-performance-us-0'],
    ['mtn-recommendation-performance-retry-kr-4-20260923', 'mtn-recommendation-performance-retry-kr-4-20260923'],
    ['mtn-recommendation-performance-kr-0', 'mtn-recommendation-performance-kr-0'],
    ['mtn-closing-kospi-final', 'mtn-closing-kospi-final'],
    [null, null],
  ];
  for (const [input, expected] of mappings) {
    assert.equal((await client.query('select mtn_internal.cron_health_job_name($1) as name', [input])).rows[0].name, expected);
  }
  await client.query(`
    insert into public.cron_http_runs(job_name,path,status,business_status,requested_at,completed_at)
      select 'unrelated-' || (n % 500), '/api/cron/other', 'SUCCESS', 'SUCCESS',
        now() - n * interval '1 second', now() - n * interval '1 second'
      from generate_series(1,50000) n;
    analyze public.cron_http_runs;
    analyze public.cron_job_definitions;
    set role service_role;
  `);
  assert.deepEqual((await client.query(healthQuery)).rows, previous, 'service_role can read security-invoker views and the mapping function');
  const explanation = (await client.query(`explain (analyze, format json) ${healthQuery}`)).rows[0]['QUERY PLAN'][0];
  function nodes(plan) { return [plan, ...(plan.Plans || []).flatMap(nodes)]; }
  const runScans = nodes(explanation.Plan).filter((node) => node['Relation Name'] === 'cron_http_runs');
  assert.equal(runScans.length, 3, 'latest, business outcome, and last-success lookups are planned');
  assert.ok(runScans.every((node) => node['Node Type'] !== 'Seq Scan'), 'no full run-history scans for any health lookup');
  assert.equal(nodes(explanation.Plan).filter((node) => node['Index Name'] === 'cron_http_runs_health_job_requested_idx').length, 3);
  await client.query('reset role');
  assert.equal((await client.query(`select has_function_privilege('anon','mtn_internal.cron_health_job_name(text)','execute') as allowed`)).rows[0].allowed, false);
  await client.query(migration);
  assert.deepEqual((await client.query(healthQuery)).rows, previous, 'migration can be reapplied safely');
  console.log(`Scheduler retry health index PostgreSQL tests passed (50,000 unrelated runs, ${explanation['Execution Time']}ms)`);
} finally {
  if (client) await client.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
}
