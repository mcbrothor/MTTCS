import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  runCleanClonePreflight,
  runReleasePreflight,
} from '../scripts/release/preflight-lib.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const temporaryRoots = [];

const jobs = [
  {
    name: 'mtn-alpha',
    path: '/api/cron/alpha?market=US',
    schedule: '5 21 * * *',
    slotMinutes: 1,
    expectedDelaySeconds: 93600,
  },
  {
    name: 'mtn-alpha-kr',
    path: '/api/cron/alpha?market=KR',
    schedule: '10 07 * * *',
    slotMinutes: 1,
    expectedDelaySeconds: 93600,
  },
  {
    name: 'mtn-beta',
    path: '/api/cron/beta',
    schedule: '*/30 * * * *',
    slotMinutes: 30,
    expectedDelaySeconds: 2700,
  },
];

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function initializeGit(root) {
  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'MTN Test'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'mtn-test@example.invalid'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'Create release fixture'], { cwd: root });
  return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'mtn-release-preflight-test-'));
  temporaryRoots.push(root);
  await writeJson(path.join(root, 'vercel.json'), {
    $schema: 'https://openapi.vercel.sh/vercel.json',
  });
  await writeJson(path.join(root, 'infra/release/production-scheduler-manifest.json'), {
    schemaVersion: 2,
    schedulerOwner: 'supabase-pg-cron',
    provenanceEndpoint: '/api/release',
    scheduleMigrations: [
      'supabase/migrations/20260801133000_scheduler.sql',
      'supabase/migrations/20260802123000_scheduler_increment.sql',
    ],
    expectedJobCount: 3,
    jobs,
    intentionallyUnscheduledRoutes: [
      {
        route: '/api/cron/manual',
        reason: 'Authenticated operator-only manual recovery route.',
      },
    ],
    requiredMigrations: [
      'supabase/migrations/20260801133000_scheduler.sql',
      'supabase/migrations/20260802123000_scheduler_increment.sql',
    ],
  });
  await mkdir(path.join(root, 'app/api/cron/alpha'), { recursive: true });
  await mkdir(path.join(root, 'app/api/cron/beta'), { recursive: true });
  await mkdir(path.join(root, 'app/api/cron/manual'), { recursive: true });
  await mkdir(path.join(root, 'app/api/release'), { recursive: true });
  await writeFile(
    path.join(root, 'app/api/cron/alpha/route.ts'),
    "import { validateCronRequest } from '@/lib/auth/cron';\nexport async function GET(request: Request) { if (!validateCronRequest(request)) return Response.json({}, { status: 401 }); }\n",
  );
  await writeFile(
    path.join(root, 'app/api/cron/beta/route.ts'),
    "import { validateCronRequest } from '@/lib/auth/cron';\nexport async function GET(request: Request) { if (!validateCronRequest(request)) return Response.json({}, { status: 401 }); }\n",
  );
  await writeFile(
    path.join(root, 'app/api/cron/manual/route.ts'),
    "import { validateCronRequest } from '@/lib/auth/cron';\nexport async function GET(request: Request) { if (!validateCronRequest(request)) return Response.json({}, { status: 401 }); }\n",
  );
  await writeFile(
    path.join(root, 'app/api/release/route.ts'),
    "export async function GET() { return Response.json({ gitSha: process.env.VERCEL_GIT_COMMIT_SHA }); }\n",
  );
  await mkdir(path.join(root, 'supabase/migrations'), { recursive: true });
  await writeFile(
    path.join(root, 'supabase/migrations/20260801133000_scheduler.sql'),
    `insert into public.cron_job_definitions (
  job_name, path, schedule, slot_minutes, expected_delay_seconds, enabled, updated_at
)
values
  ('mtn-alpha', '/api/cron/alpha?market=US', '5 21 * * *', 1, 93600, true, now()),
  ('mtn-alpha-kr', '/api/cron/alpha?market=KR', '10 07 * * *', 1, 93600, true, now());
`,
  );
  await writeFile(
    path.join(root, 'supabase/migrations/20260802123000_scheduler_increment.sql'),
    `insert into public.cron_job_definitions (
  job_name, path, schedule, slot_minutes, expected_delay_seconds, enabled, updated_at
)
values (
  'mtn-beta', '/api/cron/beta', '*/30 * * * *', 30, 2700, true,
  pg_catalog.clock_timestamp()
)
on conflict (job_name) do update
set path = excluded.path;

select cron.schedule(
  'mtn-database-capacity-monitor',
  '13 03 * * *',
  $cron$select mtn_internal.capture_database_capacity();$cron$
);
`,
  );
  await mkdir(path.join(root, 'scripts/release'), { recursive: true });
  await writeFile(path.join(root, 'scripts/release/preflight-lib.mjs'), '// release preflight fixture\n');
  await writeFile(path.join(root, 'scripts/release/verify-release.mjs'), '// release preflight fixture\n');
  const sha = await initializeGit(root);
  return { root, sha };
}

async function expectFailure(action, pattern) {
  await assert.rejects(action, (error) => {
    assert.match(error.message, pattern);
    return true;
  });
}

try {
  const fixture = await createFixture();
  const checkedUrls = [];
  const success = await runReleasePreflight({
    repoRoot: fixture.root,
    expectedSha: fixture.sha,
    baseUrl: 'https://production.example.test',
    fetchImpl: async (url) => {
      checkedUrls.push(String(url));
      if (String(url).endsWith('/api/release')) {
        return Response.json({ gitSha: fixture.sha });
      }
      return new Response(null, { status: 401 });
    },
  });
  assert.equal(success.schemaVersion, 2);
  assert.equal(success.releaseEligible, true);
  assert.equal(success.git.clean, true);
  assert.equal(success.git.sha, fixture.sha);
  assert.equal(success.vercel.cronCount, 0);
  assert.equal(success.scheduler.jobCount, 3);
  assert.equal(success.scheduler.scheduledRouteCount, 2);
  assert.equal(success.scheduler.discoveredRouteCount, 3);
  assert.equal(success.scheduler.scheduleMigrations.length, 2);
  assert.deepEqual(
    success.scheduler.scheduleMigrations.map((migration) => migration.declaredJobCount),
    [2, 1],
    'database-only cron.schedule jobs must not count as HTTP registry jobs',
  );
  assert.equal(success.live.checkedJobCount, 3);
  assert.equal(success.live.deploymentShaVerified, true);
  assert.equal(success.migrations.files.length, 2);
  assert.match(success.migrations.aggregateSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(checkedUrls, [
    'https://production.example.test/api/cron/alpha?market=US',
    'https://production.example.test/api/cron/alpha?market=KR',
    'https://production.example.test/api/cron/beta',
    'https://production.example.test/api/release',
  ]);
  await expectFailure(
    () => runReleasePreflight({
      repoRoot: fixture.root,
      expectedSha: fixture.sha,
      baseUrl: 'https://production.example.test',
      fetchImpl: async (url) => String(url).endsWith('/api/release')
        ? Response.json({ gitSha: 'f'.repeat(40) })
        : new Response(null, { status: 401 }),
    }),
    /deployed Git SHA .* does not match expected deployment SHA/i,
  );

  await writeFile(path.join(fixture.root, 'dirty.txt'), 'dirty\n');
  await expectFailure(
    () => runReleasePreflight({ repoRoot: fixture.root }),
    /clean Git worktree/i,
  );
  const dirtyAllowed = await runReleasePreflight({ repoRoot: fixture.root, allowDirty: true });
  assert.equal(dirtyAllowed.releaseEligible, false);
  assert.equal(dirtyAllowed.git.clean, false);
  await rm(path.join(fixture.root, 'dirty.txt'));

  await writeJson(path.join(fixture.root, 'vercel.json'), {
    crons: [{ path: '/api/cron/alpha', schedule: '0 0 * * *' }],
  });
  await expectFailure(
    () => runReleasePreflight({ repoRoot: fixture.root, allowDirty: true }),
    /Vercel cron count must be 0/i,
  );
  await writeJson(path.join(fixture.root, 'vercel.json'), {
    $schema: 'https://openapi.vercel.sh/vercel.json',
  });

  const scheduleMigration = path.join(
    fixture.root,
    'supabase/migrations/20260801133000_scheduler.sql',
  );
  const reviewedSchedule = await readFile(scheduleMigration, 'utf8');
  await writeFile(scheduleMigration, reviewedSchedule.replace('5 21 * * *', '6 21 * * *'));
  await expectFailure(
    () => runReleasePreflight({ repoRoot: fixture.root, allowDirty: true }),
    /scheduler manifest does not match/i,
  );
  await writeFile(scheduleMigration, reviewedSchedule);

  const incrementalScheduleMigration = path.join(
    fixture.root,
    'supabase/migrations/20260802123000_scheduler_increment.sql',
  );
  const reviewedIncrement = await readFile(incrementalScheduleMigration, 'utf8');
  await writeFile(
    incrementalScheduleMigration,
    reviewedIncrement.replace("'*/30 * * * *'", "'*/20 * * * *'"),
  );
  await expectFailure(
    () => runReleasePreflight({ repoRoot: fixture.root, allowDirty: true }),
    /scheduler manifest does not match/i,
  );
  await writeFile(incrementalScheduleMigration, reviewedIncrement);

  await rm(path.join(fixture.root, 'app/api/cron/alpha/route.ts'));
  await expectFailure(
    () => runReleasePreflight({ repoRoot: fixture.root, allowDirty: true }),
    /scheduled route file is missing/i,
  );
  await writeFile(
    path.join(fixture.root, 'app/api/cron/alpha/route.ts'),
    "import { validateCronRequest } from '@/lib/auth/cron';\nexport async function GET(request: Request) { if (!validateCronRequest(request)) return Response.json({}, { status: 401 }); }\n",
  );

  await mkdir(path.join(fixture.root, 'app/api/cron/orphan'), { recursive: true });
  await writeFile(path.join(fixture.root, 'app/api/cron/orphan/route.ts'), 'export async function GET() {}\n');
  await expectFailure(
    () => runReleasePreflight({ repoRoot: fixture.root, allowDirty: true }),
    /unclassified cron route/i,
  );
  await rm(path.join(fixture.root, 'app/api/cron/orphan'), { recursive: true });

  await expectFailure(
    () => runReleasePreflight({
      repoRoot: fixture.root,
      allowDirty: true,
      baseUrl: 'https://production.example.test',
      fetchImpl: async () => new Response(null, { status: 200 }),
    }),
    /expected unauthenticated HTTP 401/i,
  );

  await expectFailure(
    () => runReleasePreflight({
      repoRoot: fixture.root,
      allowDirty: true,
      expectedSha: '0000000000000000000000000000000000000000',
    }),
    /does not match expected deployment SHA/i,
  );

  await execFileAsync('git', ['checkout', '--', '.'], { cwd: fixture.root });
  const cleanClone = await runCleanClonePreflight({
    repoRoot: fixture.root,
    expectedSha: fixture.sha,
  });
  assert.equal(cleanClone.cleanCloneVerified, true);
  assert.equal(cleanClone.git.sha, fixture.sha);

  const repositoryStructure = await runReleasePreflight({
    repoRoot: projectRoot,
    allowDirty: true,
  });
  // Repository cleanliness is intentionally environment-dependent here: local
  // development may be dirty while CI checks out an exact clean SHA. The
  // fixture assertions above cover both clean and dirty eligibility behavior;
  // this block only verifies the real repository's release structure.
  assert.equal(typeof repositoryStructure.releaseEligible, 'boolean');
  assert.equal(repositoryStructure.vercel.cronCount, 0);
  assert.equal(repositoryStructure.scheduler.jobCount, 37);
  assert.equal(repositoryStructure.scheduler.scheduleMigrations.length, 5);
  assert.equal(repositoryStructure.scheduler.discoveredRouteCount, 18);
  for (const requiredMigration of [
    'supabase/migrations/20260728090000_manual_strategy_capital.sql',
    'supabase/migrations/20260802090000_recommendation_action_state.sql',
    'supabase/migrations/20260802093000_recommendation_category_market_state.sql',
    'supabase/migrations/20260802140000_operations_health_control_plane.sql',
    'supabase/migrations/20260802153000_recommendation_evidence_backend.sql',
    'supabase/migrations/20260803100000_conditional_90_assurance.sql',
    'supabase/migrations/20260820120000_investment_management_integration.sql',
    'supabase/migrations/20260820123000_investor_flow_scheduler.sql',
    'supabase/migrations/20260820150000_market_sentiment_scheduler.sql',
    'supabase/migrations/20260901090000_monthly_strategy_snapshots.sql',
    'supabase/migrations/20260901093000_monthly_strategy_scheduler.sql',
  ]) {
    assert.ok(
      repositoryStructure.migrations.requiredMigrations.includes(requiredMigration),
      `${requiredMigration} must be release-gated`,
    );
  }

  console.log('Release preflight tests passed');
} finally {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
}
