#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://mttcs.vercel.app';
const REQUEST_TIMEOUT_MS = 30_000;

function kstDateString(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.MTN_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_BASE_URL,
    date: kstDateString(),
    dryRun: process.env.DRY_RUN?.toLowerCase() === 'true',
  };
  for (const raw of argv) {
    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const [key, value] = raw.split('=');
    if (key === '--base-url') args.baseUrl = value;
    if (key === '--date') args.date = value;
  }
  args.baseUrl = String(args.baseUrl || '').replace(/\/+$/, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date must be YYYY-MM-DD.');
  return args;
}

function cronSecret() {
  return process.env.CRON_SECRET || process.env.MTN_CRON_SECRET || '';
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, secret) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (response.ok) return body;
      const message = typeof body === 'object' && body?.message ? body.message : text;
      const error = new Error(`Daily screener enqueue failed (${response.status}): ${message || 'empty response'}`);
      if (response.status < 500 && response.status !== 408 && response.status !== 429) {
        error.nonRetryable = true;
        throw error;
      }
      lastError = error;
    } catch (error) {
      if (error?.nonRetryable) throw error;
      lastError = error;
    }
    if (attempt < 3) await delay(attempt * 1_000);
  }
  throw lastError;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = cronSecret();
  if (!secret) throw new Error('CRON_SECRET or MTN_CRON_SECRET is required.');
  const params = new URLSearchParams({ date: args.date });
  if (args.dryRun) params.set('dryRun', 'true');
  const url = `${args.baseUrl}/api/cron/daily-screeners?${params}`;
  const result = await requestJson(url, secret);
  console.log(JSON.stringify({
    event: 'daily_screener_enqueue',
    run_date: args.date,
    dry_run: args.dryRun,
    queued: Boolean(result?.queued),
    status: result?.run?.status || result?.status || null,
    run_id: result?.run?.id || result?.run_id || null,
    message: result?.message || null,
  }));
}

main().catch((error) => {
  console.error(`[DailyScreenerEnqueue] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
