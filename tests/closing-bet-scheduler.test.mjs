import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const schema = readFileSync('supabase/migrations/20260905090000_closing_bet.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20260905093000_closing_bet_scheduler.sql', 'utf8');
const manifest = JSON.parse(readFileSync('infra/release/production-scheduler-manifest.json', 'utf8'));
const jobs = manifest.jobs.filter((job) => job.name.startsWith('mtn-closing-'));
assert.equal(jobs.length, 10);
for (const job of jobs) {
  assert.ok(migration.includes(`'${job.name}',\n    '${job.path}',\n    '${job.schedule}'`));
  assert.match(job.path, /market=KOS(?:PI200|DAQ150)&phase=(?:prepare|watch|final|monitor|review)&dryRun=false/);
}
assert.ok(manifest.scheduleMigrations.includes('supabase/migrations/20260905093000_closing_bet_scheduler.sql'));
assert.equal(manifest.expectedJobCount, manifest.jobs.length);
for (const table of ['snapshots', 'cache', 'deliveries', 'evaluations', 'locks']) assert.ok(schema.includes(`alter table public.closing_bet_${table} enable row level security`));
assert.match(schema, /unique \(trade_date, market, mode, phase, model_version\)/);
assert.match(schema, /primary key \(snapshot_id, chat_hash, kind, chunk\)/);
assert.match(schema, /revoke all on function public.claim_closing_bet_lock.*from public, anon, authenticated/);
assert.match(migration, /delete from public.closing_bet_cache where expires_at < now\(\)/);
assert.ok(migration.includes("case when p_path like '/api/cron/closing-bet?%' then 240000 else 55000 end"));
assert.ok(migration.includes("case when run.path like '/api/cron/closing-bet?%' then interval '300 seconds' else interval '120 seconds' end"));
console.log('closing bet scheduler and persistence contracts passed');
