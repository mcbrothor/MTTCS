import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { resolveTestPostgresBin } from '../scripts/lib/test-postgres-bin.mjs';

const bin = resolveTestPostgresBin();
const directory = mkdtempSync(join(tmpdir(), 'mtn-health-history-'));
const dataDir = join(directory, 'data');
const port = 15000 + (process.pid % 30000);
const migration = readFileSync(new URL('../supabase/migrations/20260923040000_bound_scheduler_health_history.sql', import.meta.url), 'utf8');
let client;
let started = false;
function nodes(plan) { return [plan, ...(plan.Plans || []).flatMap(nodes)]; }
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
    insert into public.cron_job_definitions values
      ('mtn-closing-many','/api/cron/closing-bet?phase=final','* * * * *',93600,true,now()),
      ('mtn-recommendation-performance-kr-0','/api/cron/recommendation-performance','* * * * *',93600,true,now()),
      ('mtn-null-success','/api/cron/other','* * * * *',93600,true,now()),
      ('mtn-no-runs','/api/cron/other','* * * * *',93600,true,now());
    insert into public.cron_http_runs(job_name,path,status,business_status,requested_at,completed_at)
      select 'mtn-closing-many', '/api/cron/closing-bet?phase=final', 'SUCCESS', 'SKIPPED',
        now()-n * interval '1 second', now()-n * interval '1 second'
      from generate_series(1,50000) n;
    insert into public.cron_http_runs(job_name,path,status,business_status,requested_at,completed_at)
      select case when n % 2 = 0 then 'mtn-recommendation-performance-kr-0'
        else 'mtn-recommendation-performance-retry-kr-0-20260923' end,
        '/api/cron/recommendation-performance', 'SUCCESS', 'SUCCESS',
        now()-n * interval '1 second', now()-n * interval '1 second'
      from generate_series(1,50000) n;
    insert into public.cron_http_runs(job_name,path,status,business_status,requested_at,completed_at,error_message) values
      ('mtn-closing-many','/api/cron/closing-bet?phase=final','SUCCESS','HELD',now()-interval '50003 seconds',now()-interval '50003 seconds',null),
      ('mtn-closing-many','/api/cron/closing-bet?phase=final','FAILED','FAILED',now()-interval '50002 seconds',now()-interval '50002 seconds','old failure'),
      ('mtn-recommendation-performance-retry-finalize-kr-20260923','/api/cron/recommendation-performance','SUCCESS','SUCCESS',now()-interval '2 minutes',now()+interval '1 minute',null),
      ('mtn-null-success','/api/cron/other','SUCCESS','SUCCESS',now(),null,null);
  `);
  await client.query(readFileSync(new URL('../supabase/migrations/20260923030000_index_scheduler_retry_health.sql', import.meta.url), 'utf8'));
  await client.query('analyze public.cron_http_runs; analyze public.cron_job_definitions');
  const healthQuery = 'select * from public.cron_scheduler_health order by job_name';
  const previous = (await client.query(healthQuery)).rows;
  const oldPlan = (await client.query(`explain (analyze, format json) ${healthQuery}`)).rows[0]['QUERY PLAN'][0];
  const oldScans = nodes(oldPlan.Plan).filter((node) => node['Relation Name'] === 'cron_http_runs');
  assert.ok(oldScans.some((node) => ((node['Rows Removed by Filter'] || 0) + node['Actual Rows']) * node['Actual Loops'] >= 50000), 'regression fixture reproduces the unbounded registered-job history scan');
  await client.query(migration);
  await client.query('set role service_role');
  assert.deepEqual((await client.query(healthQuery)).rows, previous, 'bounded lookups preserve every health output and NULL success semantics');
  const explanation = (await client.query(`explain (analyze, format json) ${healthQuery}`)).rows[0]['QUERY PLAN'][0];
  const scans = nodes(explanation.Plan).filter((node) => node['Relation Name'] === 'cron_http_runs');
  assert.equal(scans.length, 3);
  assert.deepEqual(new Set(scans.map((node) => node['Index Name'])), new Set([
    'cron_http_runs_health_job_requested_idx', 'cron_http_runs_health_outcome_idx', 'cron_http_runs_health_success_idx',
  ]));
  for (const scan of scans) {
    assert.ok(scan['Actual Rows'] <= 1, 'each job lookup returns at most one history row');
    assert.equal(scan['Rows Removed by Filter'] || 0, 0, 'partial indexes eliminate scans through historical skips and invalid successes');
  }
  const byJob = new Map(previous.map((row) => [row.job_name, row]));
  assert.equal(byJob.get('mtn-closing-many').health_status, 'FAILED');
  assert.equal(byJob.get('mtn-closing-many').error_message, 'old failure');
  assert.equal(byJob.get('mtn-closing-many').latest_business_status, 'SKIPPED');
  assert.equal(byJob.get('mtn-recommendation-performance-kr-0').health_status, 'HEALTHY');
  assert.ok(byJob.get('mtn-recommendation-performance-kr-0').last_success_at > byJob.get('mtn-recommendation-performance-kr-0').last_completed_at, 'last success follows completion time, not request time');
  assert.equal(byJob.get('mtn-null-success').last_success_at, null);
  assert.equal(byJob.get('mtn-no-runs').last_success_at, null);
  await client.query('reset role');
  await client.query(migration);
  assert.deepEqual((await client.query(healthQuery)).rows, previous, 'forward migration is safe to reapply');
  console.log(`Scheduler bounded-history PostgreSQL tests passed (50k same-job skips + 50k same-job successes: ${oldPlan['Execution Time']}ms -> ${explanation['Execution Time']}ms)`);
} finally {
  if (client) await client.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
}
