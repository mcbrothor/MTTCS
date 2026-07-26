import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import {
  isTransientSupabaseError,
  nextAdaptivePollMs,
  reachedConsecutiveFailureLimit,
} from './lib/adaptive-polling.mjs';
import { summarizeSupabaseError } from './lib/supabase-request-utils.mjs';
import {
  buildWorkerConfig,
  claimNextJob,
  markJobFailed,
  processJob,
  updateHeartbeat,
  writeJobLog,
} from './lib/local-analysis-worker-utils.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const localPostgresUrl = process.env.LOCAL_POSTGRES_URL;

if (!supabaseUrl || !supabaseKey) {
  console.error('[LocalWorker] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!localPostgresUrl) {
  console.error('[LocalWorker] Missing LOCAL_POSTGRES_URL.');
  process.exit(1);
}

const config = buildWorkerConfig({
  ...process.env,
  MTN_LOCAL_WORKER_ONCE: process.argv.includes('--once') ? 'true' : process.env.MTN_LOCAL_WORKER_ONCE,
});
const supabase = createClient(supabaseUrl, supabaseKey);
const pool = new pg.Pool({ connectionString: localPostgresUrl, max: 4 });
let stopping = false;
const stopController = new AbortController();

function requestStop() {
  stopping = true;
  stopController.abort();
}

process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);

function sleep(ms) {
  if (stopController.signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId);
      stopController.signal.removeEventListener('abort', finish);
      resolve();
    };
    const timeoutId = setTimeout(finish, ms);
    stopController.signal.addEventListener('abort', finish, { once: true });
  });
}

async function tick() {
  await updateHeartbeat(pool, config, 'IDLE', { jobTypes: config.jobTypes });
  const job = await claimNextJob(supabase, config);
  if (!job) return false;

  try {
    await updateHeartbeat(pool, config, 'RUNNING', { jobType: job.job_type }, job.id);
    await processJob({ job, config, supabase, localDb: pool });
    await updateHeartbeat(pool, config, 'IDLE', { lastJobId: job.id });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[LocalWorker] Job ${job.id} failed: ${message}`);
    await writeJobLog(pool, config, job.id, 'ERROR', message).catch(() => {});
    await markJobFailed(supabase, job, message);
    await updateHeartbeat(pool, config, 'ERROR', { lastError: message }, job.id).catch(() => {});
    return true;
  }
}

async function main() {
  console.log(`[LocalWorker] Starting worker ${config.workerId}.`);
  await updateHeartbeat(pool, config, 'STARTING', { jobTypes: config.jobTypes });

  try {
    let nextPollMs = 0;
    let consecutiveClaimFailures = 0;
    do {
      let processed = false;
      try {
        processed = await tick();
        consecutiveClaimFailures = 0;
      } catch (error) {
        const message = summarizeSupabaseError(error);
        const transientClaimFailure = message.startsWith('claim_analysis_job failed:')
          && isTransientSupabaseError(error);
        consecutiveClaimFailures += 1;
        console.error(`[LocalWorker] Queue claim failed (${consecutiveClaimFailures}): ${message}`);
        await updateHeartbeat(pool, config, 'ERROR', { lastError: message }).catch(() => {});
        if (
          config.once
          || reachedConsecutiveFailureLimit(consecutiveClaimFailures, { transient: transientClaimFailure })
        ) throw error;
      }
      if (config.once) break;
      nextPollMs = nextAdaptivePollMs(nextPollMs, {
        baseMs: config.pollMs,
        maxMs: config.maxPollMs,
        worked: processed,
      });
      if (!processed) await sleep(nextPollMs);
    } while (!stopping);
  } finally {
    await updateHeartbeat(pool, config, 'STOPPING').catch(() => {});
    await pool.end();
    console.log('[LocalWorker] Stopped.');
  }
}

main().catch(async (error) => {
  console.error('[LocalWorker] Fatal error:', summarizeSupabaseError(error));
  await pool.end().catch(() => {});
  process.exit(1);
});
