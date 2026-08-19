import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20260820123000_investor_flow_scheduler.sql', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../infra/release/production-scheduler-manifest.json', import.meta.url), 'utf8'));

test('all 350 Korean universe slots are scheduled in non-overlapping chunks', () => {
  const jobs = manifest.jobs.filter((job) => job.name.startsWith('mtn-investor-flow-kr-'));
  assert.equal(jobs.length, 9);
  assert.deepEqual(jobs.map((job) => new URL(`https://mtn.test${job.path}`).searchParams.get('cursor')), ['0', '40', '80', '120', '160', '200', '240', '280', '320']);
  assert.ok(jobs.every((job) => job.path.includes('size=40')));
});

test('scheduler migration is idempotent and uses the protected control plane', () => {
  assert.match(migration, /on conflict \(job_name\) do update/i);
  assert.match(migration, /mtn_internal\.invoke_cron/i);
  assert.match(migration, /cron\.unschedule/i);
});
