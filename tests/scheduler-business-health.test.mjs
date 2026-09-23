import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { resolveTestPostgresBin } from '../scripts/lib/test-postgres-bin.mjs';

const bin = resolveTestPostgresBin();
const directory = mkdtempSync(join(tmpdir(), 'mtn-scheduler-test-'));
const dataDir = join(directory, 'data');
const port = 15000 + (process.pid % 30000);
let client;
let started = false;
try {
  execFileSync(join(bin, 'initdb'), ['-D', dataDir, '-A', 'trust', '--no-locale', '-U', 'postgres'], { stdio: 'pipe' });
  execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-l', join(directory, 'postgres.log'), '-o', `-F -p ${port} -k ${directory} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  client = new pg.Client({ host: directory, port, user: 'postgres', database: 'postgres' });
  await client.connect();
  await client.query(`
    create schema mtn_internal;
    create schema net;
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.cron_http_runs (
      id bigint generated always as identity primary key, job_name text, path text, request_id bigint,
      status text, http_status integer, requested_at timestamptz default now(), completed_at timestamptz,
      error_message text, response_excerpt text
    );
    create table public.cron_job_definitions (
      job_name text primary key, path text, schedule text, expected_delay_seconds integer,
      enabled boolean, updated_at timestamptz
    );
    create table net._http_response (
      id bigint primary key, timed_out boolean, error_msg text, status_code integer, content text, created timestamptz
    );
  `);
  const original = readFileSync(new URL('../supabase/migrations/20260801133000_supabase_scheduler_control_plane.sql', import.meta.url), 'utf8');
  const budget = readFileSync(new URL('../supabase/migrations/20260914010000_restore_scheduler_timeout_budgets.sql', import.meta.url), 'utf8');
  await client.query(original.match(/create view public\.cron_scheduler_health[\s\S]*?\) as success on true;/i)[0]);
  await client.query(budget.match(/create or replace function mtn_internal\.collect_cron_http_responses\(\)[\s\S]*?\$\$;/i)[0]);
  const migration = new URL('../supabase/migrations/20260921010000_scheduler_business_health.sql', import.meta.url);
  if (existsSync(migration)) await client.query(readFileSync(migration, 'utf8'));

  await client.query(`
    insert into public.cron_job_definitions values
      ('mtn-closing-test', '/api/cron/closing-bet?market=KOSDAQ150&phase=final', '* * * * *', 352800, true, now());
    insert into public.cron_http_runs(job_name,path,request_id,status,requested_at,completed_at,error_message)
      values ('mtn-closing-test', '/api/cron/closing-bet?market=KOSDAQ150&phase=final', 1, 'FAILED', now()-interval '2 minutes', now()-interval '1 minute', 'KIS unavailable');
    insert into public.cron_http_runs(job_name,path,request_id,status,requested_at)
      values ('mtn-closing-test', '/api/cron/closing-bet?market=KOSDAQ150&phase=final', 2, 'QUEUED', now());
    insert into net._http_response values (2,false,null,200,'{"data":{"skipped":true,"reason":"outside window"}}',now());
    select mtn_internal.collect_cron_http_responses();
  `);
  let health = (await client.query('select * from public.cron_scheduler_health')).rows[0];
  assert.equal(health.health_status, 'FAILED', 'HTTP 200 skipped must not clear previous closing-bet failure');
  assert.equal(health.last_success_at, null, 'skip must not update business last success');
  assert.equal(health.error_message, 'KIS unavailable');

  const completed = {
    skipped: false,
    snapshot: {
      phase: 'FINAL', status: 'READY', regime: 'GREEN',
      coverage: { collected: 200, total: 200, failed: 0 },
      universe: { count: 200, expectedCount: 200 }, picks: [{ ticker: '005930' }], warnings: [],
    },
    delivery: { sent: 1, skipped: 0, failed: 0 },
  };
  async function classify(data) {
    return (await client.query(`select mtn_internal.cron_business_status('/api/cron/closing-bet?phase=final', $1) as status`, [JSON.stringify({ data })])).rows[0].status;
  }
  assert.equal(await classify({}), 'UNKNOWN', 'empty body cannot recover a failure');
  assert.equal(await classify(completed), 'SUCCESS');
  assert.equal(await classify({ ...completed, snapshot: { ...completed.snapshot, phase: 'WATCH' } }), 'UNKNOWN');
  assert.equal(await classify({ ...completed, snapshot: { ...completed.snapshot, status: 'BLOCKED', coverage: { collected: 11, total: 200 } } }), 'DATA_BLOCKED');
  assert.equal(await classify({ ...completed, snapshot: { ...completed.snapshot, universe: { count: 11, expectedCount: 200 } } }), 'DATA_BLOCKED');
  assert.equal(await classify({ ...completed, snapshot: { ...completed.snapshot, regime: 'UNKNOWN' } }), 'DATA_BLOCKED');
  assert.equal(await classify({ ...completed, snapshot: { ...completed.snapshot, status: 'BLOCKED', regime: 'RED', picks: [] } }), 'HELD');
  assert.equal(await classify({ ...completed, snapshot: { ...completed.snapshot, picks: [] } }), 'HELD');
  assert.equal(await classify({ ...completed, delivery: { sent: 0, skipped: 0, failed: 0 } }), 'DELIVERY_FAILED');
  assert.equal(await classify({ ...completed, delivery: { sent: 1, skipped: 0, failed: 1 } }), 'DELIVERY_FAILED');
  assert.equal(await classify({ ...completed, delivery: { sent: 0, skipped: 1, failed: 0 } }), 'SUCCESS', 'existing delivery receipts count as completed');

  await client.query(`
    insert into public.cron_http_runs(job_name,path,request_id,status,requested_at)
      values ('mtn-closing-test', '/api/cron/closing-bet?market=KOSDAQ150&phase=final', 3, 'QUEUED', now()+interval '1 second');
  `);
  await client.query('insert into net._http_response values (3,false,null,200,$1,now())', [JSON.stringify({ data: completed })]);
  await client.query('select mtn_internal.collect_cron_http_responses()');
  health = (await client.query('select * from public.cron_scheduler_health')).rows[0];
  assert.equal(health.health_status, 'HEALTHY', 'real completed work clears the previous failure');
  assert.ok(health.last_success_at);
  assert.equal(health.latest_business_status, 'SUCCESS');
  const skipped = (await client.query('select * from public.cron_http_runs where request_id=2')).rows[0];
  assert.equal(skipped.status, 'SUCCESS', 'transport status remains compatible');
  assert.equal(skipped.business_status, 'SKIPPED');
  assert.equal(skipped.business_reason, 'outside window');
  async function collectClosing(id, data) {
    await client.query(`insert into public.cron_http_runs(job_name,path,request_id,status,requested_at)
      values ('mtn-closing-test', '/api/cron/closing-bet?market=KOSDAQ150&phase=final', $1::bigint, 'QUEUED', now()+($1::bigint * interval '1 second'))`, [id]);
    await client.query('insert into net._http_response values ($1,false,null,200,$2,now())', [id, JSON.stringify({ data })]);
    await client.query('select mtn_internal.collect_cron_http_responses()');
    return (await client.query('select * from public.cron_scheduler_health')).rows[0];
  }
  const lowCoverage = { ...completed, snapshot: { ...completed.snapshot, status: 'BLOCKED', coverage: { collected: 11, total: 200 } } };
  assert.equal((await collectClosing(4, lowCoverage)).health_status, 'FAILED', 'transport success must expose data failure');
  assert.equal((await collectClosing(5, { skipped: true, reason: 'outside window' })).health_status, 'FAILED', 'skip cannot recover data failure');
  assert.equal((await collectClosing(6, { ...completed, snapshot: { ...completed.snapshot, status: 'BLOCKED', regime: 'RED', picks: [] } })).health_status, 'HEALTHY', 'verified delivered no-trade decision is legitimate completed work');
  const held = (await client.query('select * from public.cron_http_runs where request_id=6')).rows[0];
  assert.equal(held.business_status, 'HELD');
  const classified = (await client.query(`select mtn_internal.cron_business_status('/api/cron/closing-bet?phase=final', $1) as status`, ['{invalid'])).rows[0];
  assert.equal(classified.status, 'UNKNOWN', 'invalid JSON must not abort response collection or imply business success');
  assert.equal((await client.query(`select mtn_internal.cron_business_status('/api/cron/closing-bet?phase=review', '{"data":{"pending":true}}') as status`)).rows[0].status, 'PENDING');
  assert.equal((await client.query(`select mtn_internal.cron_business_status('/api/cron/check-alerts', 'ok') as status`)).rows[0].status, 'SUCCESS', 'other jobs retain existing transport contract');
  await client.query(readFileSync(migration, 'utf8'));
  console.log('Scheduler business health PostgreSQL tests passed');
} finally {
  if (client) await client.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
}
