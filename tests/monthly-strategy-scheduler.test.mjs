import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260901093000_monthly_strategy_scheduler.sql', import.meta.url),
  'utf8',
);
const manifest = JSON.parse(
  readFileSync(new URL('../infra/release/production-scheduler-manifest.json', import.meta.url), 'utf8'),
);

const expectedJobs = [
  ['mtn-monthly-strategy-kr', '/api/cron/monthly-strategies?market=KR', '20 07 * * 1-5'],
  ['mtn-monthly-strategy-us', '/api/cron/monthly-strategies?market=US', '20 21 * * 1-5'],
];

for (const [name, path, schedule] of expectedJobs) {
  assert.ok(
    migration.includes(`'${name}',\n    '${path}',\n    '${schedule}'`),
    `${name} 스케줄이 마이그레이션에 선언되어야 한다`,
  );
  const job = manifest.jobs.find((candidate) => candidate.name === name);
  assert.deepEqual(job, {
    name,
    path,
    schedule,
    slotMinutes: 1,
    expectedDelaySeconds: 352800,
  });
}

assert.ok(
  manifest.scheduleMigrations.includes('supabase/migrations/20260901093000_monthly_strategy_scheduler.sql'),
  '운영 릴리스 manifest가 월간 전략 스케줄러 마이그레이션을 포함해야 한다',
);
assert.equal(manifest.expectedJobCount, manifest.jobs.length);

console.log('monthly strategy scheduler tests passed');
