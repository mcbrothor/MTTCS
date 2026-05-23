#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://mttcs.vercel.app';

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.MTN_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_BASE_URL,
    market: process.env.RS_METRICS_MARKET || 'ALL',
    chunkSize: Number(process.env.RS_METRICS_CHUNK_SIZE || 50),
    calcDate: process.env.RS_METRICS_CALC_DATE || new Date().toISOString().slice(0, 10),
    dryRun: false,
  };

  for (const raw of argv) {
    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const [key, value] = raw.split('=');
    if (!key.startsWith('--')) continue;
    if (key === '--base-url') args.baseUrl = value;
    if (key === '--market') args.market = value;
    if (key === '--chunk-size') args.chunkSize = Number(value);
    if (key === '--calc-date') args.calcDate = value;
  }

  args.baseUrl = String(args.baseUrl || '').replace(/\/+$/, '');
  args.market = String(args.market || '').toUpperCase();
  return args;
}

function marketsFrom(value) {
  if (value === 'ALL') return ['US', 'KR'];
  if (value === 'US' || value === 'KR') return [value];
  throw new Error('--market must be US, KR, or ALL.');
}

function assertValidArgs(args) {
  if (!args.baseUrl.startsWith('http')) throw new Error('--base-url must be an absolute URL.');
  if (!Number.isInteger(args.chunkSize) || args.chunkSize < 1 || args.chunkSize > 100) {
    throw new Error('--chunk-size must be an integer between 1 and 100.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.calcDate)) {
    throw new Error('--calc-date must be YYYY-MM-DD.');
  }
}

function cronSecret() {
  return process.env.CRON_SECRET || process.env.MTN_CRON_SECRET || '';
}

function buildUrl(args, params) {
  const url = new URL('/api/cron/rs-metrics', args.baseUrl);
  url.searchParams.set('calcDate', args.calcDate);
  url.searchParams.set('chunkSize', String(args.chunkSize));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function callCron(args, params) {
  const url = buildUrl(args, params);
  const secret = cronSecret();
  const headers = secret ? { authorization: `Bearer ${secret}` } : {};

  if (args.dryRun) {
    console.log(`[dry-run] GET ${url.toString()}`);
    return null;
  }

  const response = await fetch(url, { headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message = typeof body === 'object' && body?.message ? body.message : text;
    throw new Error(`RS metrics request failed (${response.status}): ${message}`);
  }

  return body;
}

async function runMarket(args, market) {
  console.log(`\n[${market}] RS metrics chunk run started (${args.calcDate}, chunkSize=${args.chunkSize})`);
  let chunk = 0;
  let processed = 0;

  while (chunk !== null) {
    const body = await callCron(args, { market, mode: 'chunk', chunk });
    if (args.dryRun) {
      chunk += 1;
      if (chunk >= 2) {
        console.log(`[dry-run] stopping after sample chunks for ${market}`);
        break;
      }
      continue;
    }

    const result = body?.data?.results?.[0];
    if (!result) throw new Error(`Unexpected chunk response for ${market}.`);
    processed += result.processed || 0;
    console.log(
      `[${market}] chunk ${result.chunkIndex} processed ${result.processed}/${result.total}; next=${result.nextChunkIndex ?? 'finalize'}`
    );
    chunk = result.nextChunkIndex;
  }

  const finalize = await callCron(args, { market, mode: 'finalize' });
  if (!args.dryRun) {
    const result = finalize?.data?.results?.[0];
    if (!result) throw new Error(`Unexpected finalize response for ${market}.`);
    console.log(`[${market}] finalized ${result.ranked} ranked rows; macro rows=${result.macro?.length || 0}`);
  }

  return { market, processed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertValidArgs(args);
  const markets = marketsFrom(args.market);

  console.log(`MTN RS metrics runner`);
  console.log(`baseUrl=${args.baseUrl}`);
  console.log(`market=${markets.join(',')}`);
  console.log(`auth=${cronSecret() ? 'CRON_SECRET provided' : 'no CRON_SECRET header'}`);

  for (const market of markets) {
    await runMarket(args, market);
  }

  console.log('\nRS metrics run completed.');
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
