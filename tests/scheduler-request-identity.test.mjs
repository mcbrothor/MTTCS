import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { resolveTestPostgresBin } from '../scripts/lib/test-postgres-bin.mjs';

const bin = resolveTestPostgresBin();
const directory = mkdtempSync(join(tmpdir(), 'mtn-request-identity-'));
const dataDir = join(directory, 'data');
const port = 15000 + (process.pid % 30000);
const migration = new URL('../supabase/migrations/20260923010000_scheduler_request_identity.sql', import.meta.url);
const readMigration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
let client;
let started = false;
function start() {
  execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-l', join(directory, 'postgres.log'), '-o', `-p ${port} -k ${directory} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
}
async function connect() {
  client = new pg.Client({ host: directory, port, user: 'postgres', database: 'postgres' });
  await client.connect();
}
async function crashRestart() {
  await client.end();
  execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
  started = false;
  start();
  await connect();
}
async function invoke(job) {
  return (await client.query("select mtn_internal.invoke_cron($1, '/api/cron/test') as id", [job])).rows[0].id;
}
try {
  execFileSync(join(bin, 'initdb'), ['-D', dataDir, '-A', 'trust', '--no-locale', '-U', 'postgres'], { stdio: 'pipe' });
  start();
  await connect();
  await client.query(`
    create schema mtn_internal;
    create schema net;
    create schema vault;
    create role anon;
    create role authenticated;
    create role service_role;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    insert into vault.decrypted_secrets values ('mtn_app_base_url','https://example.invalid'), ('mtn_cron_secret','fixture-secret');
    create unlogged table net.http_request_queue(id bigserial, url text, headers jsonb, timeout_milliseconds integer);
    create function net.http_get(url text, headers jsonb, timeout_milliseconds integer) returns bigint language sql as $$
      insert into net.http_request_queue(url, headers, timeout_milliseconds) values ($1,$2,$3) returning id;
    $$;
    create unlogged table net._http_response(id bigint, timed_out boolean default false, error_msg text, status_code integer, content text, created timestamptz default now());
  `);
  const original = readMigration('20260801133000_supabase_scheduler_control_plane.sql');
  await client.query(original.match(/create table if not exists public\.cron_http_runs[\s\S]*?\n\);/)[0]);
  const budget = readMigration('20260914010000_restore_scheduler_timeout_budgets.sql');
  await client.query(budget);
  const business = readMigration('20260921010000_scheduler_business_health.sql');
  await client.query(business.slice(0, business.indexOf('create or replace view public.cron_scheduler_health')));
  assert.equal(await invoke('mtn-original'), '1');
  await client.query("update public.cron_http_runs set status='SUCCESS', completed_at=clock_timestamp(), response_excerpt='historical evidence' where job_name='mtn-original'");
  await crashRestart();
  assert.equal((await client.query('select last_value,is_called from net.http_request_queue_id_seq')).rows[0].is_called, false, 'fixture crash resets the unlogged pg_net sequence');
  assert.equal(await invoke('mtn-reproduced'), null);
  const failure = (await client.query("select status,error_message from public.cron_http_runs where job_name='mtn-reproduced'")).rows[0];
  assert.equal(failure.status, 'FAILED');
  assert.match(failure.error_message, /23505:.*cron_http_runs_request_id_key/, 'reproduce the production failure before applying the repair');

  // Advance the historical high-water mark above the failed nextval call.
  await client.query("insert into public.cron_http_runs(job_name,slot_started_at,path,request_id,status,requested_at) values ('mtn-historical-high',now(),'/api/cron/test',1000,'TIMED_OUT',pg_postmaster_start_time()-interval '1 day')");
  if (existsSync(migration)) await client.query(readFileSync(migration, 'utf8'));
  const repaired = await invoke('mtn-repaired');
  assert.ok(BigInt(repaired ?? 0) > 1000n, 'new requests must advance past durable historical IDs after a restart');
  assert.equal((await client.query("select relpersistence from pg_class where oid='net.http_request_queue_id_seq'::regclass")).rows[0].relpersistence, 'u', 'extension-owned sequence remains unchanged; dispatcher repairs it');
  assert.equal((await client.query("select count(*) from pg_constraint where conrelid='public.cron_http_runs'::regclass and conname='cron_http_runs_request_id_key'")).rows[0].count, '1', 'keep the original uniqueness constraint');
  assert.equal((await client.query("select response_excerpt from public.cron_http_runs where job_name='mtn-original'")).rows[0].response_excerpt, 'historical evidence');
  assert.equal(await invoke('mtn-repaired'), null, 'same-slot idempotency is preserved');
  assert.equal((await client.query('select timeout_milliseconds from net.http_request_queue where id=$1', [repaired])).rows[0].timeout_milliseconds, 280000);

  await client.query(`
    insert into net._http_response(id,status_code,content,created) values
      (1000,200,'unrelated response after ID reuse',clock_timestamp());
    insert into public.cron_http_runs(job_name,slot_started_at,path,request_id,status,requested_at) values
      ('mtn-stale-response',now(),'/api/cron/test',2000,'QUEUED',clock_timestamp()-interval '295 seconds');
    insert into net._http_response(id,status_code,content,created) values
      (2000,200,'stale response',clock_timestamp()-interval '1 day');
    select mtn_internal.collect_cron_http_responses();
  `);
  assert.equal((await client.query("select status from public.cron_http_runs where job_name='mtn-historical-high'")).rows[0].status, 'TIMED_OUT', 'post-restart ID reuse must not repair a historical timeout');
  assert.equal((await client.query("select status from public.cron_http_runs where job_name='mtn-stale-response'")).rows[0].status, 'TIMED_OUT', 'a stale response cannot complete or indefinitely delay the timeout');
  await client.query('insert into net._http_response(id,status_code,content,created) values ($1,200,\'{"data":{}}\',clock_timestamp())', [repaired]);
  await client.query('select mtn_internal.collect_cron_http_responses()');
  assert.equal((await client.query("select status from public.cron_http_runs where job_name='mtn-repaired'")).rows[0].status, 'SUCCESS', 'current response still completes normally');

  // Reruns include live queue/response IDs and never rewind the sequence.
  await client.query("select setval('net.http_request_queue_id_seq',4000,true)");
  await client.query(readFileSync(migration, 'utf8'));
  const afterRerun = await invoke('mtn-rerun');
  assert.ok(BigInt(afterRerun) > 4000n);
  await client.query("insert into net.http_request_queue(id,url) values (6000,'https://example.invalid/other-caller'); insert into net._http_response(id,status_code,content) values (7000,200,'other caller')");
  const afterLiveIds = await invoke('mtn-live-ids');
  assert.ok(BigInt(afterLiveIds) > 7000n, 'retain IDs belonging to other pg_net callers as well');
  assert.equal((await client.query("select has_function_privilege('anon','mtn_internal.ensure_cron_request_identity()','EXECUTE') as allowed")).rows[0].allowed, false);

  const concurrent = new pg.Client({ host: directory, port, user: 'postgres', database: 'postgres', application_name: 'mtn-identity-concurrency-test' });
  await concurrent.connect();
  try {
    await client.query('begin');
    await client.query('select mtn_internal.ensure_cron_request_identity()');
    const pending = concurrent.query("select mtn_internal.invoke_cron('mtn-concurrent','/api/cron/test') as id");
    await client.query('select pg_sleep(0.05)');
    assert.equal((await client.query("select wait_event_type from pg_stat_activity where application_name='mtn-identity-concurrency-test'")).rows[0].wait_event_type, 'Lock', 'concurrent dispatch must wait at the queue lock boundary');
    await client.query('commit');
    assert.ok(BigInt((await pending).rows[0].id) > BigInt(afterLiveIds));
  } finally {
    await client.query('rollback');
    await concurrent.end();
  }
  await crashRestart();
  const afterCrash = await invoke('mtn-after-crash');
  assert.ok(BigInt(afterCrash) > BigInt(afterRerun), 'dispatcher must repair another unclean restart from durable history');
  console.log('Scheduler request identity integration tests passed (isolated PostgreSQL, no HTTP).');
} finally {
  if (client) await client.end();
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
}
