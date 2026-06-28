import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
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

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    do {
      const processed = await tick();
      if (config.once) break;
      if (!processed) await sleep(config.pollMs);
    } while (!stopping);
  } finally {
    await updateHeartbeat(pool, config, 'STOPPING').catch(() => {});
    await pool.end();
    console.log('[LocalWorker] Stopped.');
  }
}

main().catch(async (error) => {
  console.error('[LocalWorker] Fatal error:', error);
  await pool.end().catch(() => {});
  process.exit(1);
});
