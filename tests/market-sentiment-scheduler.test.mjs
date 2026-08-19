import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20260820150000_market_sentiment_scheduler.sql', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../infra/release/production-scheduler-manifest.json', import.meta.url), 'utf8'));

test('market sentiment collection is scheduled after the Korean close', () => {
  const job = manifest.jobs.find((item) => item.name === 'mtn-market-sentiment-kr');
  assert.equal(job?.path, '/api/cron/market-sentiment');
  assert.equal(job?.schedule, '12 07 * * 1-5');
  assert.match(migration, /mtn_internal\.invoke_cron/i);
  assert.match(migration, /cron\.unschedule/i);
  assert.match(migration, /on conflict \(job_name\) do update/i);
});
