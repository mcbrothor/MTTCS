#!/usr/bin/env node
/**
 * Daily snapshot script — saves master-filter P3 score and macro score to Supabase.
 * Usage: node scripts/snapshot-market-state.mjs [--base-url=https://...] [--market=US|KR|ALL] [--dry-run]
 */

const DEFAULT_BASE_URL = 'https://mttcs.vercel.app';

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.MTN_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_BASE_URL,
    market: process.env.SNAPSHOT_MARKET || 'ALL',
    calcDate: new Date().toISOString().slice(0, 10),
    dryRun: false,
  };

  for (const raw of argv) {
    if (raw === '--dry-run') { args.dryRun = true; continue; }
    const [key, value] = raw.split('=');
    if (!key.startsWith('--')) continue;
    if (key === '--base-url') args.baseUrl = value;
    if (key === '--market') args.market = value.toUpperCase();
    if (key === '--calc-date') args.calcDate = value;
  }

  args.baseUrl = String(args.baseUrl || '').replace(/\/+$/, '');
  return args;
}

function marketsFrom(value) {
  if (value === 'ALL') return ['US', 'KR'];
  if (value === 'US' || value === 'KR') return [value];
  throw new Error('--market must be US, KR, or ALL.');
}

function cronSecret() {
  return process.env.CRON_SECRET || process.env.MTN_CRON_SECRET || '';
}

async function callEndpoint(url, args) {
  const secret = cronSecret();
  const headers = secret ? { authorization: `Bearer ${secret}` } : {};

  if (args.dryRun) {
    console.log(`[dry-run] GET ${url}`);
    return null;
  }

  const response = await fetch(url, { headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!response.ok) {
    const message = typeof body === 'object' && body?.message ? body.message : text;
    throw new Error(`Request failed (${response.status}): ${message}`);
  }
  return body;
}

async function snapshotMasterFilter(args, market) {
  console.log(`\n[master-filter] saving snapshot for ${market} (${args.calcDate})`);
  const url = `${args.baseUrl}/api/cron/snapshot-market-state?market=${market}&type=master-filter&calcDate=${args.calcDate}`;
  const body = await callEndpoint(url, args);
  if (!args.dryRun) console.log(`[master-filter ${market}] done: p3Score=${body?.data?.p3Score} state=${body?.data?.state}`);
}

async function snapshotMacro(args) {
  console.log(`\n[macro] saving snapshot (${args.calcDate})`);
  const url = `${args.baseUrl}/api/cron/snapshot-market-state?type=macro&calcDate=${args.calcDate}`;
  const body = await callEndpoint(url, args);
  if (!args.dryRun) console.log(`[macro] done: macroScore=${body?.data?.macroScore} regime=${body?.data?.regime}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const markets = marketsFrom(args.market);

  console.log(`Snapshot market state — baseUrl=${args.baseUrl}, markets=${markets.join(',')}, calcDate=${args.calcDate}`);

  const tasks = [
    ...markets.map((m) => snapshotMasterFilter(args, m)),
    snapshotMacro(args),
  ];

  const results = await Promise.allSettled(tasks);
  let hasError = false;
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[ERROR]', result.reason?.message ?? result.reason);
      hasError = true;
    }
  }

  if (hasError) process.exit(1);
  console.log('\nAll snapshots completed.');
}

main().catch((err) => {
  console.error('[FATAL]', err.message ?? err);
  process.exit(1);
});
