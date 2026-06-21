import { createClient } from '@supabase/supabase-js';
import { createJiti } from 'jiti';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { persistRecommendationPublications } = jiti('../lib/recommendations/persistence.ts');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const client = createClient(url, key, { auth: { persistSession: false } });

const { data: runs, error } = await client
  .from('daily_screener_runs')
  .select('id, run_date, created_at, completed_at, status, telegram_sent_at, top5_result')
  .eq('status', 'completed')
  .order('run_date', { ascending: true });
if (error) throw error;

const report = { mode: apply ? 'apply' : 'dry-run', eligible: [], skipped: [], publications: 0 };
for (const run of runs || []) {
  try {
    const result = run.top5_result;
    const generatedAt = result?.generated_at || run.completed_at || run.created_at;
    if (!generatedAt) throw new Error('missing generated_at');
    for (const market of ['US', 'KR']) {
      const rows = result?.markets?.[market];
      if (!Array.isArray(rows) || rows.length !== 10 || new Set(rows.map((row) => row.ticker)).size !== 10) {
        throw new Error(`${market} does not contain 10 unique picks`);
      }
    }
    const { data: candidateRows, error: candidateError } = await client
      .from('daily_screener_candidates')
      .select('*')
      .eq('run_id', run.id);
    if (candidateError) throw candidateError;
    const candidates = (candidateRows || []).map((row) => ({
      source: row.source,
      universe: row.universe,
      ticker: row.ticker,
      exchange: row.exchange,
      name: row.name,
      score: Number(row.score),
      grade: row.grade,
      rank: row.source_rank ?? undefined,
      price: row.price === null ? null : Number(row.price),
      priceAsOf: row.price_as_of,
      reason: row.reason || '',
      metrics: row.raw_metrics || {},
      raw: row.raw || {},
    }));
    const tickers = new Set(candidates.map((candidate) => candidate.ticker.toUpperCase()));
    const missing = [...result.markets.US, ...result.markets.KR].filter((pick) => !tickers.has(pick.ticker.toUpperCase()));
    if (missing.length) throw new Error(`missing candidate snapshots: ${missing.map((pick) => pick.ticker).join(',')}`);
    report.eligible.push({ runDate: run.run_date, generatedAt, candidates: candidates.length });
    if (apply) {
      const publications = await persistRecommendationPublications({
        client,
        runId: run.id,
        runDate: run.run_date,
        generatedAt,
        provider: result.provider || 'backfill',
        model: result.model || 'unknown',
        result: { markets: result.markets, reportMarkdown: result.report_markdown || '', rawResponse: result.raw_response || '' },
        candidates,
        telegramSentAt: run.telegram_sent_at,
      });
      report.publications += publications.length;
    }
  } catch (error) {
    report.skipped.push({ runDate: run.run_date, reason: error instanceof Error ? error.message : 'unknown error' });
  }
}

console.log(JSON.stringify(report, null, 2));
