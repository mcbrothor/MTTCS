#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { getTelegramChatIds } from './lib/codex-cli-worker-utils.mjs';
import { evaluateDailyDeliveryHealth } from './lib/daily-screener-watchdog-utils.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_BASE_URL = 'https://mttcs.vercel.app';
const ALL_CATEGORIES = ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'];
const WORKER_LABEL = 'com.mantori.mtn-codex-worker';
const REQUEST_TIMEOUT_MS = 30_000;

function kstDateString(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {
    date: kstDateString(),
    baseUrl: process.env.MTN_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_BASE_URL,
    dryRun: process.env.DRY_RUN?.toLowerCase() === 'true',
  };
  for (const raw of argv) {
    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const [key, value] = raw.split('=');
    if (key === '--date') args.date = value;
    if (key === '--base-url') args.baseUrl = value;
  }
  args.baseUrl = String(args.baseUrl || '').replace(/\/+$/, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date must be YYYY-MM-DD.');
  return args;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function expectedCategories(run, publications) {
  const recorded = Array.isArray(run?.scan_summary?.delivery_categories)
    ? run.scan_summary.delivery_categories.filter((category) => ALL_CATEGORIES.includes(category))
    : [];
  if (recorded.length > 0) return [...new Set(recorded)];
  const legacyCompleted = run?.status === 'completed'
    ? [...new Set((publications || []).map((publication) => publication.category).filter((category) => ALL_CATEGORIES.includes(category)))]
    : [];
  if (legacyCompleted.length > 0) return legacyCompleted;
  const scoped = Array.isArray(run?.scope?.universes)
    ? run.scope.universes.filter((category) => ALL_CATEGORIES.includes(category))
    : [];
  return scoped.length > 0 ? [...new Set(scoped)] : ALL_CATEGORIES;
}

function deliveryDeadline(runDate) {
  const raw = process.env.DAILY_SCREENER_DELIVERY_DEADLINE_KST || '19:30';
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error('DAILY_SCREENER_DELIVERY_DEADLINE_KST must be HH:MM.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('DAILY_SCREENER_DELIVERY_DEADLINE_KST must be a valid time.');
  return Date.parse(`${runDate}T00:00:00.000Z`) + ((hour - 9) * 60 + minute) * 60_000;
}

async function loadState(client, runDate) {
  const { data: run, error: runError } = await client
    .from('daily_screener_runs')
    .select('id, run_date, status, scope, scan_summary, error_summary, telegram_sent_at, completed_at, created_at, updated_at')
    .eq('run_date', runDate)
    .maybeSingle();
  if (runError) throw new Error(`daily run query failed: ${runError.message}`);
  if (!run) return { run: null, publications: [] };
  const { data: publications, error: publicationsError } = await client
    .from('recommendation_publications')
    .select('id, category, status, telegram_status, telegram_sent_at, updated_at')
    .eq('screener_run_id', run.id)
    .eq('is_official', true)
    .eq('status', 'PUBLISHED');
  if (publicationsError) throw new Error(`publication query failed: ${publicationsError.message}`);
  return { run, publications: publications || [] };
}

async function enqueueRun(args) {
  const secret = process.env.CRON_SECRET || process.env.MTN_CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET or MTN_CRON_SECRET is required to enqueue.');
  const url = `${args.baseUrl}/api/cron/daily-screeners?date=${encodeURIComponent(args.date)}`;
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
  if (!response.ok) {
    const message = typeof body === 'object' && body?.message ? body.message : text;
    throw new Error(`enqueue failed (${response.status}): ${message || 'empty response'}`);
  }
  return body;
}

async function requeueRun(client, run, reason) {
  const now = new Date().toISOString();
  const previous = String(run.error_summary || '').slice(0, 1200);
  const retryCount = Number(run.scope?.watchdog_retry_count ?? previous.match(/watchdog_retry=(\d+)/)?.[1] ?? 0) + 1;
  const errorSummary = `watchdog_retry=${retryCount}; Watchdog requeued at ${now}: ${reason}${previous ? `; previous: ${previous}` : ''}`.slice(0, 2000);
  const { data, error } = await client
    .from('daily_screener_runs')
    .update({
      status: 'pending',
      scope: { ...(run.scope || {}), watchdog_retry_count: retryCount },
      error_summary: errorSummary,
      telegram_sent_at: null,
      completed_at: null,
      updated_at: now,
    })
    .eq('id', run.id)
    .eq('status', run.status)
    .eq('updated_at', run.updated_at)
    .select('id, run_date, status')
    .maybeSingle();
  if (error) throw new Error(`requeue failed: ${error.message}`);
  if (!data) return { skipped: true, reason: 'run changed during watchdog evaluation' };
  return data;
}

async function syncRun(client, run, publications) {
  const sentAt = publications
    .map((publication) => publication.telegram_sent_at)
    .filter(Boolean)
    .sort()
    .at(-1) || new Date().toISOString();
  const { data, error } = await client
    .from('daily_screener_runs')
    .update({ telegram_sent_at: sentAt, updated_at: new Date().toISOString() })
    .eq('id', run.id)
    .eq('status', 'completed')
    .is('telegram_sent_at', null)
    .select('id, telegram_sent_at')
    .maybeSingle();
  if (error) throw new Error(`run synchronization failed: ${error.message}`);
  return data || { skipped: true, reason: 'run changed during synchronization' };
}

async function kickWorker(force = false) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (!Number.isInteger(uid)) throw new Error('Cannot determine the current user id for launchctl.');
  await execFileAsync('/bin/launchctl', ['kickstart', ...(force ? ['-k'] : []), `gui/${uid}/${WORKER_LABEL}`], { timeout: 30_000 });
  return { label: WORKER_LABEL, forced: force };
}

async function sendAlert(text) {
  const token = requiredEnv('TELEGRAM_BOT_TOKEN');
  const chatIds = getTelegramChatIds();
  if (chatIds.length === 0) throw new Error('TELEGRAM_ALLOWED_CHAT_IDS or TELEGRAM_CHAT_ID is required for alerts.');
  const failures = [];
  for (const chatId of chatIds) {
    try {
      const { stdout } = await execFileAsync('/usr/bin/curl', [
        '-sS', '--connect-timeout', '15', '--max-time', '30',
        '-X', 'POST', `https://api.telegram.org/bot${token}/sendMessage`,
        '-H', 'content-type: application/json',
        '--data-binary', JSON.stringify({ chat_id: chatId, text }),
      ], { timeout: REQUEST_TIMEOUT_MS + 5_000, maxBuffer: 1_000_000 });
      const body = JSON.parse(stdout || '{}');
      if (!body?.ok) throw new Error(body?.description || 'Telegram returned an invalid response.');
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      failures.push(raw.replaceAll(token, '[redacted]').slice(0, 500));
    }
  }
  if (failures.length > 0) throw new Error(`watchdog Telegram alert failed: ${failures.join('; ')}`);
  return { recipients: chatIds.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const state = await loadState(supabase, args.date);
  const staleAfterMs = Math.max(30 * 60_000, Number(process.env.DAILY_SCREENER_WATCHDOG_STALE_AFTER_MS || 2 * 60 * 60_000));
  const assessment = evaluateDailyDeliveryHealth({
    ...state,
    expectedCategories: expectedCategories(state.run, state.publications),
    staleAfterMs,
    deliveryOverdue: Date.now() >= deliveryDeadline(args.date),
    maxAutoRetries: Math.max(0, Number(process.env.DAILY_SCREENER_WATCHDOG_MAX_RETRIES || 2)),
  });
  const summary = {
    event: 'daily_screener_watchdog',
    run_date: args.date,
    status: state.run?.status || null,
    healthy: assessment.healthy,
    reason: assessment.reason,
    actions: assessment.actions,
    dry_run: args.dryRun,
  };
  console.log(JSON.stringify(summary));
  if (args.dryRun || assessment.actions.length === 0) return;

  const results = [];
  for (const action of assessment.actions) {
    if (action === 'enqueue') results.push({ action, result: await enqueueRun(args) });
    if (action === 'requeue') results.push({ action, result: await requeueRun(supabase, state.run, assessment.reason) });
    if (action === 'sync_run') results.push({ action, result: await syncRun(supabase, state.run, state.publications) });
    if (action === 'kick_worker') {
      const requeueResult = results.find((item) => item.action === 'requeue')?.result;
      const force = assessment.reason.includes('stale') && !requeueResult?.skipped;
      results.push({ action, result: await kickWorker(force) });
    }
    if (action === 'alert') {
      const message = [
        '[MTN 자동복구 알림]',
        `기준일: ${args.date}`,
        `상태: ${state.run?.status || 'missing'}`,
        `원인: ${assessment.reason}`,
        `조치: ${results.map((item) => item.action).join(', ') || 'none'}`,
      ].join('\n');
      results.push({ action, result: await sendAlert(message) });
    }
  }
  console.log(JSON.stringify({ ...summary, repaired: true, results }));
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DailyScreenerWatchdog] ${message}`);
  const dryRunRequested = process.argv.includes('--dry-run') || process.env.DRY_RUN?.toLowerCase() === 'true';
  if (!dryRunRequested) {
    try {
      await sendAlert(`[MTN 감시기 자체 오류]\n${kstDateString()}\n${message.slice(0, 1500)}`);
    } catch (alertError) {
      console.error(`[DailyScreenerWatchdog] ${alertError instanceof Error ? alertError.message : String(alertError)}`);
    }
  }
  process.exit(1);
});
