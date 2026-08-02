import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isTransientSupabaseError,
  nextAdaptivePollMs,
  normalizePollingMs,
  reachedConsecutiveFailureLimit,
} from '../scripts/lib/adaptive-polling.mjs';
import { buildWorkerConfig } from '../scripts/lib/local-analysis-worker-utils.mjs';

{
  const delays = [];
  let previousMs = 0;
  for (let index = 0; index < 6; index += 1) {
    previousMs = nextAdaptivePollMs(previousMs, { baseMs: 30_000, maxMs: 300_000 });
    delays.push(previousMs);
  }
  assert.deepEqual(delays, [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
  assert.equal(nextAdaptivePollMs(300_000, { baseMs: 30_000, maxMs: 300_000, worked: true }), 0);
}

{
  assert.equal(normalizePollingMs('45000', { fallbackMs: 30_000, minMs: 10_000 }), 45_000);
  assert.equal(normalizePollingMs('invalid', { fallbackMs: 30_000, minMs: 10_000 }), 30_000);
  assert.equal(normalizePollingMs('-1', { fallbackMs: 30_000, minMs: 10_000 }), 30_000);
}

{
  assert.equal(isTransientSupabaseError(new Error('HTTP 522: Connection timed out')), true);
  assert.equal(isTransientSupabaseError(new Error('database system is not accepting connections')), true);
  assert.equal(isTransientSupabaseError(new Error('Could not query the database for the schema cache. Retrying.')), true);
  assert.equal(isTransientSupabaseError(new Error('fetch failed: ECONNRESET')), true);
  assert.equal(isTransientSupabaseError(new Error('column queue_state does not exist')), false);
  assert.equal(isTransientSupabaseError(new Error('column queue_500 does not exist')), false);
  assert.equal(isTransientSupabaseError(new Error('validation rejected item 429')), false);
  assert.equal(reachedConsecutiveFailureLimit(3, { transient: false }), true);
  assert.equal(reachedConsecutiveFailureLimit(19, { transient: true }), false);
  assert.equal(reachedConsecutiveFailureLimit(20, { transient: true }), true);
}

{
  const defaults = buildWorkerConfig({});
  assert.equal(defaults.workerId, 'mtn-local-primary');
  assert.equal(defaults.pollMs, 30_000);
  assert.equal(defaults.maxPollMs, 300_000);

  const overridden = buildWorkerConfig({
    MTN_LOCAL_WORKER_POLL_MS: '5000',
    MTN_LOCAL_WORKER_MAX_POLL_MS: '60000',
  });
  assert.equal(overridden.pollMs, 5000);
  assert.equal(overridden.maxPollMs, 60000);
}

{
  const workerSource = readFileSync(new URL('../scripts/local-llm-worker.mjs', import.meta.url), 'utf8');
  assert.match(workerSource, /DAILY_SCREENER_STALE_CHECK_INTERVAL_MS/);
  assert.match(workerSource, /LOCAL_LLM_REQUEST_TIMEOUT_MS/);
  assert.match(workerSource, /operations_component_heartbeats/);
  assert.match(workerSource, /setInterval\([^]*recordCodexWorkerHeartbeat/);
  assert.match(workerSource, /timeout:\s*LOCAL_LLM_REQUEST_TIMEOUT_MS/);
  assert.doesNotMatch(workerSource, /timeout:\s*0\b/);
  assert.match(workerSource, /\.from\('recommendation_picks'\)/);
  assert.doesNotMatch(
    workerSource.match(/async function processPendingRecommendationTelegramQueue\(\)[\s\S]*?async function processDailyScreenerQueue/)?.[0] || '',
    /recommendation_picks\(/,
  );
}

{
  const proxyRunner = readFileSync(new URL('../scripts/run-toss-proxy-server.sh', import.meta.url), 'utf8');
  assert.match(proxyRunner, /\.next\/BUILD_ID/);
  assert.match(proxyRunner, /npm run start/);
  assert.doesNotMatch(proxyRunner, /npm run dev/);
}

{
  const runnerSource = readFileSync(new URL('../scripts/run-local-analysis-worker.sh', import.meta.url), 'utf8');
  assert.match(runnerSource, /NODE24_BIN="\/opt\/homebrew\/opt\/node@24\/bin\/node"/);
  assert.match(runnerSource, /exec "\$NODE24_BIN" --env-file=/);
  assert.doesNotMatch(runnerSource, /exec node --env-file=/);
}

for (const fileName of [
  'com.mantori.mtn-codex-worker.plist',
  'com.mantori.mtn-local-analysis-worker.plist',
]) {
  const plist = readFileSync(new URL(`../infra/launchd/${fileName}`, import.meta.url), 'utf8');
  assert.match(plist, /<key>ThrottleInterval<\/key>\s*<integer>300<\/integer>/);
}

console.log('worker resource budget tests passed');
