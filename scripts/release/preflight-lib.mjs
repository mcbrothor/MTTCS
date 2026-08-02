import { execFile } from 'node:child_process';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_MANIFEST_PATH = 'infra/release/production-scheduler-manifest.json';
const PREFLIGHT_FILES = [
  'scripts/release/preflight-lib.mjs',
  'scripts/release/verify-release.mjs',
];

function fail(message) {
  throw new Error(`Release preflight failed: ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function posixPath(value) {
  return value.split(path.sep).join('/');
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function readJson(filePath, label) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    fail(`${label} is missing or unreadable at ${filePath}: ${error.message}`);
  }
  try {
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    fail(`${label} is not valid JSON at ${filePath}: ${error.message}`);
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursively(directory) {
  if (!await pathExists(directory)) return [];
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursively(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function validateJob(job, index) {
  const label = `scheduler manifest job #${index + 1}`;
  if (!job || typeof job !== 'object') fail(`${label} must be an object.`);
  if (!/^mtn-[a-z0-9-]+$/.test(job.name || '')) fail(`${label} has an invalid name.`);
  if (typeof job.path !== 'string' || !job.path.startsWith('/api/cron/')) {
    fail(`${label} must use a relative /api/cron/* path.`);
  }
  if (typeof job.schedule !== 'string' || job.schedule.trim().split(/\s+/).length !== 5) {
    fail(`${label} must contain a five-field cron schedule.`);
  }
  if (!Number.isInteger(job.slotMinutes) || job.slotMinutes < 1) {
    fail(`${label} must contain a positive integer slotMinutes.`);
  }
  if (!Number.isInteger(job.expectedDelaySeconds) || job.expectedDelaySeconds < 60) {
    fail(`${label} must contain expectedDelaySeconds of at least 60.`);
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') fail('Scheduler manifest must be an object.');
  if (manifest.schemaVersion !== 2) fail('Scheduler manifest schemaVersion must be 2.');
  if (manifest.schedulerOwner !== 'supabase-pg-cron') {
    fail('Scheduler manifest owner must be supabase-pg-cron.');
  }
  if (typeof manifest.provenanceEndpoint !== 'string'
    || !manifest.provenanceEndpoint.startsWith('/api/')
    || manifest.provenanceEndpoint.includes('?')) {
    fail('Scheduler manifest provenanceEndpoint must be a relative /api/* path without a query.');
  }
  if (!Array.isArray(manifest.scheduleMigrations) || manifest.scheduleMigrations.length === 0) {
    fail('Scheduler manifest scheduleMigrations must be a non-empty array.');
  }
  for (const migration of manifest.scheduleMigrations) {
    if (typeof migration !== 'string' || !migration.endsWith('.sql')) {
      fail('Every scheduler manifest scheduleMigrations entry must point to a SQL migration.');
    }
  }
  if (new Set(manifest.scheduleMigrations).size !== manifest.scheduleMigrations.length) {
    fail('Scheduler manifest contains duplicate scheduleMigrations entries.');
  }
  if (!Array.isArray(manifest.jobs)) fail('Scheduler manifest jobs must be an array.');
  if (manifest.jobs.length !== manifest.expectedJobCount) {
    fail(`Scheduler manifest expected ${manifest.expectedJobCount} jobs but declares ${manifest.jobs.length}.`);
  }
  manifest.jobs.forEach(validateJob);
  const names = manifest.jobs.map((job) => job.name);
  if (new Set(names).size !== names.length) fail('Scheduler manifest contains duplicate job names.');
  const paths = manifest.jobs.map((job) => job.path);
  if (new Set(paths).size !== paths.length) fail('Scheduler manifest contains duplicate job paths.');
  if (!Array.isArray(manifest.intentionallyUnscheduledRoutes)) {
    fail('Scheduler manifest intentionallyUnscheduledRoutes must be an array.');
  }
  for (const entry of manifest.intentionallyUnscheduledRoutes) {
    if (typeof entry?.route !== 'string' || !entry.route.startsWith('/api/cron/')) {
      fail('Every intentionally unscheduled route must use a relative /api/cron/* path.');
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
      fail(`Intentionally unscheduled route ${entry.route} requires a meaningful reason.`);
    }
  }
  if (!Array.isArray(manifest.requiredMigrations) || manifest.requiredMigrations.length === 0) {
    fail('Scheduler manifest requiredMigrations must be a non-empty array.');
  }
  const missingScheduleMigrations = manifest.scheduleMigrations.filter(
    (migration) => !manifest.requiredMigrations.includes(migration),
  );
  if (missingScheduleMigrations.length > 0) {
    fail(`Every schedule migration must also be listed in requiredMigrations: ${missingScheduleMigrations.join(', ')}`);
  }
  return manifest;
}

export function scheduledPathToRoute(jobPath) {
  let pathname;
  try {
    pathname = new URL(jobPath, 'https://mtn.invalid').pathname;
  } catch (error) {
    fail(`Scheduled path is invalid (${jobPath}): ${error.message}`);
  }
  if (!pathname.startsWith('/api/cron/')) fail(`Scheduled path is outside /api/cron: ${jobPath}`);
  return pathname.replace(/\/$/, '');
}

function scheduledRouteToFile(route) {
  return `app/${route.replace(/^\//, '')}/route.ts`;
}

function routeFileToRoute(relativeFile) {
  const normalized = posixPath(relativeFile);
  if (!normalized.startsWith('app/api/cron/') || !normalized.endsWith('/route.ts')) {
    fail(`Cannot derive a cron route from ${relativeFile}.`);
  }
  return `/${normalized.slice(4, -'/route.ts'.length)}`;
}

function decodeSqlString(value) {
  return value.replaceAll("''", "'");
}

function parseScheduledJobs(sql, migrationPath) {
  const parsed = [];
  const insertPattern = /insert\s+into\s+public\.cron_job_definitions\s*\(([\s\S]*?)\)\s*values\s*([\s\S]*?)(?=\bon\s+conflict\b|;)/gi;
  const expectedColumns = [
    'job_name',
    'path',
    'schedule',
    'slot_minutes',
    'expected_delay_seconds',
    'enabled',
    'updated_at',
  ];
  for (const insertMatch of sql.matchAll(insertPattern)) {
    const columns = insertMatch[1]
      .split(',')
      .map((column) => column.trim().toLowerCase());
    if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) {
      fail(`Schedule migration ${migrationPath} uses an unsupported cron_job_definitions column order.`);
    }
    const rowPattern = /\(\s*'((?:''|[^'])+)'\s*,\s*'((?:''|[^'])+)'\s*,\s*'((?:''|[^'])+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(true|false)\s*,\s*(?:(?:pg_catalog\.)?(?:clock_timestamp|now))\s*\(\s*\)\s*\)/gi;
    for (const rowMatch of insertMatch[2].matchAll(rowPattern)) {
      parsed.push({
        name: decodeSqlString(rowMatch[1]),
        path: decodeSqlString(rowMatch[2]),
        schedule: decodeSqlString(rowMatch[3]),
        slotMinutes: Number(rowMatch[4]),
        expectedDelaySeconds: Number(rowMatch[5]),
        enabled: rowMatch[6].toLowerCase() === 'true',
      });
    }
  }
  if (parsed.length === 0) {
    fail(`Schedule migration ${migrationPath} does not declare any cron_job_definitions rows.`);
  }
  return parsed;
}

function composeScheduledJobs(scheduleMigrations) {
  const composed = new Map();
  for (const migration of scheduleMigrations) {
    const declaredJobs = parseScheduledJobs(migration.sql, migration.path);
    migration.declaredJobCount = declaredJobs.length;
    for (const job of declaredJobs) {
      if (job.enabled) composed.set(job.name, job);
      else composed.delete(job.name);
    }
  }
  return [...composed.values()];
}

function canonicalJobs(jobs) {
  return [...jobs]
    .map((job) => ({
      name: job.name,
      path: job.path,
      schedule: job.schedule,
      slotMinutes: job.slotMinutes,
      expectedDelaySeconds: job.expectedDelaySeconds,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function inspectGit(repoRoot, expectedSha) {
  let sha;
  let statusOutput;
  try {
    sha = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim();
    statusOutput = (await execFileAsync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      { cwd: repoRoot, maxBuffer: 10_000_000 },
    )).stdout;
  } catch (error) {
    fail(`Repository Git state is unavailable: ${error.message}`);
  }
  if (!/^[a-f0-9]{40}$/i.test(sha)) fail(`Git HEAD did not resolve to a full commit SHA: ${sha}`);
  if (expectedSha && sha !== expectedSha) {
    fail(`Git HEAD ${sha} does not match expected deployment SHA ${expectedSha}.`);
  }
  const dirtyEntries = statusOutput.split('\n').filter(Boolean);
  return { sha, clean: dirtyEntries.length === 0, dirtyEntries };
}

async function findUntrackedReleaseFiles(repoRoot, releaseFiles) {
  let stdout;
  try {
    stdout = (await execFileAsync(
      'git',
      ['ls-files', '--', ...releaseFiles],
      { cwd: repoRoot, maxBuffer: 10_000_000 },
    )).stdout;
  } catch (error) {
    fail(`Unable to inspect tracked release files: ${error.message}`);
  }
  const tracked = new Set(stdout.split('\n').filter(Boolean));
  return releaseFiles.filter((file) => !tracked.has(file));
}

async function buildMigrationManifest(repoRoot, requiredMigrations) {
  const migrationsRoot = path.join(repoRoot, 'supabase/migrations');
  const files = (await listFilesRecursively(migrationsRoot))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => posixPath(path.relative(repoRoot, file)))
    .sort((left, right) => left.localeCompare(right));
  if (files.length === 0) fail('No Supabase SQL migrations were found.');
  const missingRequired = requiredMigrations.filter((file) => !files.includes(file));
  if (missingRequired.length > 0) {
    fail(`Required release migrations are missing: ${missingRequired.join(', ')}`);
  }
  const entries = [];
  for (const relativeFile of files) {
    const absoluteFile = path.join(repoRoot, relativeFile);
    const [raw, metadata] = await Promise.all([readFile(absoluteFile), stat(absoluteFile)]);
    entries.push({
      path: relativeFile,
      bytes: metadata.size,
      sha256: sha256(raw),
      requiredForScheduler: requiredMigrations.includes(relativeFile),
    });
  }
  const aggregateInput = entries
    .map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`)
    .join('');
  return {
    files: entries,
    aggregateSha256: sha256(aggregateInput),
    requiredMigrations: [...requiredMigrations],
  };
}

async function verifyLiveRoutes({
  baseUrl,
  jobs,
  fetchImpl,
  timeoutMs,
  expectedSha,
  provenanceEndpoint,
}) {
  if (!baseUrl) return { checked: false, checkedJobCount: 0, statusCounts: {} };
  let origin;
  try {
    const parsed = new URL(baseUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) fail('Live preflight base URL must use HTTP or HTTPS.');
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      fail('Live preflight base URL must be an origin without credentials, query, or fragment.');
    }
    origin = parsed.origin;
  } catch (error) {
    if (error.message.startsWith('Release preflight failed:')) throw error;
    fail(`Live preflight base URL is invalid: ${error.message}`);
  }
  const request = fetchImpl || globalThis.fetch;
  if (typeof request !== 'function') fail('No fetch implementation is available for live route checks.');
  const results = await Promise.all(jobs.map(async (job) => {
    let response;
    try {
      response = await request(`${origin}${job.path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'application/json',
          'user-agent': 'mtn-release-preflight/1.0',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      fail(`Live route ${job.name} (${job.path}) could not be reached: ${error.message}`);
    }
    if (response.status !== 401) {
      fail(`Live route ${job.name} (${job.path}) expected unauthenticated HTTP 401 but received ${response.status}.`);
    }
    return { name: job.name, path: job.path, status: response.status };
  }));
  let deploymentShaVerified = false;
  let deployedGitSha = null;
  if (expectedSha) {
    const provenanceUrl = `${origin}${provenanceEndpoint}`;
    let response;
    try {
      response = await request(provenanceUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'application/json',
          'user-agent': 'mtn-release-preflight/1.0',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      fail(`Deployment provenance endpoint ${provenanceEndpoint} could not be reached: ${error.message}`);
    }
    if (response.status !== 200) {
      fail(`Deployment provenance endpoint ${provenanceEndpoint} returned HTTP ${response.status}; expected 200.`);
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      fail(`Deployment provenance endpoint ${provenanceEndpoint} returned invalid JSON: ${error.message}`);
    }
    deployedGitSha = payload?.gitSha || null;
    if (deployedGitSha !== expectedSha) {
      fail(`Deployed Git SHA ${deployedGitSha || 'missing'} does not match expected deployment SHA ${expectedSha}.`);
    }
    deploymentShaVerified = true;
  }
  return {
    checked: true,
    baseUrl: origin,
    checkedJobCount: results.length,
    deploymentShaVerified,
    deployedGitSha,
    statusCounts: results.reduce((counts, result) => {
      counts[result.status] = (counts[result.status] || 0) + 1;
      return counts;
    }, {}),
  };
}

export async function runReleasePreflight({
  repoRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
  expectedSha,
  allowDirty = false,
  baseUrl,
  fetchImpl,
  timeoutMs = 10_000,
} = {}) {
  const resolvedRoot = path.resolve(repoRoot || process.cwd());
  const vercelPath = path.join(resolvedRoot, 'vercel.json');
  const resolvedManifestPath = path.join(resolvedRoot, manifestPath);
  const [{ raw: vercelRaw, value: vercel }, { raw: manifestRaw, value: manifestValue }] = await Promise.all([
    readJson(vercelPath, 'Vercel configuration'),
    readJson(resolvedManifestPath, 'Production scheduler manifest'),
  ]);
  const manifest = validateManifest(manifestValue);

  const hasVercelCrons = Object.hasOwn(vercel, 'crons');
  const vercelCronCount = Array.isArray(vercel.crons) ? vercel.crons.length : hasVercelCrons ? -1 : 0;
  if (hasVercelCrons) {
    fail(`Vercel cron count must be 0 and the crons key must be absent; observed ${vercelCronCount}.`);
  }

  const scheduleMigrations = [];
  for (const migrationPath of manifest.scheduleMigrations) {
    let sql;
    try {
      sql = await readFile(path.join(resolvedRoot, migrationPath), 'utf8');
    } catch (error) {
      fail(`Schedule migration is missing at ${migrationPath}: ${error.message}`);
    }
    scheduleMigrations.push({ path: migrationPath, sql });
  }
  const migrationJobs = composeScheduledJobs(scheduleMigrations);
  if (JSON.stringify(canonicalJobs(migrationJobs)) !== JSON.stringify(canonicalJobs(manifest.jobs))) {
    fail('Scheduler manifest does not match the composed reviewed job registry in scheduleMigrations.');
  }

  const scheduledRoutes = sortedUnique(manifest.jobs.map((job) => scheduledPathToRoute(job.path)));
  const scheduledRouteFiles = scheduledRoutes.map(scheduledRouteToFile);
  const missingRouteFiles = [];
  for (const relativeFile of scheduledRouteFiles) {
    if (!await pathExists(path.join(resolvedRoot, relativeFile))) missingRouteFiles.push(relativeFile);
  }
  if (missingRouteFiles.length > 0) {
    fail(`Scheduled route file is missing: ${missingRouteFiles.join(', ')}`);
  }

  const routeRoot = path.join(resolvedRoot, 'app/api/cron');
  const discoveredRouteFiles = (await listFilesRecursively(routeRoot))
    .filter((file) => file.endsWith(`${path.sep}route.ts`))
    .map((file) => posixPath(path.relative(resolvedRoot, file)))
    .sort((left, right) => left.localeCompare(right));
  const discoveredRoutes = discoveredRouteFiles.map(routeFileToRoute);
  const intentionallyUnscheduledRoutes = sortedUnique(
    manifest.intentionallyUnscheduledRoutes.map((entry) => entry.route.replace(/\/$/, '')),
  );
  const classifiedRoutes = new Set([...scheduledRoutes, ...intentionallyUnscheduledRoutes]);
  const unclassifiedRoutes = discoveredRoutes.filter((route) => !classifiedRoutes.has(route));
  const classifiedButMissing = [...classifiedRoutes].filter((route) => !discoveredRoutes.includes(route));
  if (unclassifiedRoutes.length > 0) {
    fail(`Unclassified cron route(s) must be scheduled or explicitly exempted: ${unclassifiedRoutes.join(', ')}`);
  }
  if (classifiedButMissing.length > 0) {
    fail(`Scheduler manifest classifies route(s) that do not exist: ${classifiedButMissing.join(', ')}`);
  }

  for (const relativeFile of discoveredRouteFiles) {
    const source = await readFile(path.join(resolvedRoot, relativeFile), 'utf8');
    if (!source.includes('validateCronRequest') || !/\b401\b/.test(source)) {
      fail(`Cron route ${relativeFile} does not declare the validateCronRequest + HTTP 401 authentication contract.`);
    }
  }

  const migrations = await buildMigrationManifest(resolvedRoot, manifest.requiredMigrations);
  const git = await inspectGit(resolvedRoot, expectedSha);
  const releaseFiles = sortedUnique([
    'vercel.json',
    manifestPath,
    ...manifest.scheduleMigrations,
    ...manifest.requiredMigrations,
    ...discoveredRouteFiles,
    `app${manifest.provenanceEndpoint}/route.ts`,
    ...PREFLIGHT_FILES,
  ]);
  const untrackedReleaseFiles = await findUntrackedReleaseFiles(resolvedRoot, releaseFiles);
  if (!allowDirty && !git.clean) {
    fail(`A clean Git worktree is required; found ${git.dirtyEntries.length} changed or untracked path(s).`);
  }
  if (!allowDirty && untrackedReleaseFiles.length > 0) {
    fail(`Release-critical files are not tracked by Git: ${untrackedReleaseFiles.join(', ')}`);
  }

  const live = await verifyLiveRoutes({
    baseUrl,
    jobs: manifest.jobs,
    fetchImpl,
    timeoutMs,
    expectedSha,
    provenanceEndpoint: manifest.provenanceEndpoint,
  });
  const releaseEligible = git.clean && untrackedReleaseFiles.length === 0;
  return {
    schemaVersion: 2,
    releaseEligible,
    git: {
      sha: git.sha,
      clean: git.clean,
      dirtyPathCount: git.dirtyEntries.length,
      untrackedReleaseFiles,
    },
    vercel: {
      cronCount: vercelCronCount,
      sha256: sha256(vercelRaw),
    },
    scheduler: {
      owner: manifest.schedulerOwner,
      manifestPath,
      manifestSha256: sha256(manifestRaw),
      scheduleMigrations: scheduleMigrations.map((migration) => ({
        path: migration.path,
        sha256: sha256(migration.sql),
        declaredJobCount: migration.declaredJobCount,
      })),
      jobCount: manifest.jobs.length,
      scheduledRouteCount: scheduledRoutes.length,
      intentionallyUnscheduledRouteCount: intentionallyUnscheduledRoutes.length,
      discoveredRouteCount: discoveredRoutes.length,
      scheduledRoutes,
      intentionallyUnscheduledRoutes,
    },
    migrations,
    live,
  };
}

export async function runCleanClonePreflight({
  repoRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
  expectedSha,
  baseUrl,
  fetchImpl,
  timeoutMs = 10_000,
} = {}) {
  const resolvedRoot = path.resolve(repoRoot || process.cwd());
  const source = await runReleasePreflight({
    repoRoot: resolvedRoot,
    manifestPath,
    expectedSha,
  });
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'mtn-release-clean-clone-'));
  const cloneRoot = path.join(temporaryRoot, 'repository');
  try {
    await execFileAsync(
      'git',
      ['clone', '--quiet', '--local', '--no-hardlinks', resolvedRoot, cloneRoot],
      { maxBuffer: 10_000_000 },
    );
    const clone = await runReleasePreflight({
      repoRoot: cloneRoot,
      manifestPath,
      expectedSha: source.git.sha,
      baseUrl,
      fetchImpl,
      timeoutMs,
    });
    return { ...clone, cleanCloneVerified: true };
  } catch (error) {
    if (error.message.startsWith('Release preflight failed:')) throw error;
    fail(`Clean-clone verification failed: ${error.message}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
