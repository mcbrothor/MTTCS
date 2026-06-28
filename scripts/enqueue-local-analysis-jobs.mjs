import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const market = (process.argv.find((value) => value.startsWith('--market='))?.split('=')[1] || 'US').toUpperCase();
const limit = Math.max(1, Math.min(50, Number(process.argv.find((value) => value.startsWith('--limit='))?.split('=')[1] || 10)));
const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const runDate = process.argv.find((value) => value.startsWith('--run-date='))?.split('=')[1] || new Date().toISOString().slice(0, 10);

if (market !== 'US' && market !== 'KR') throw new Error('--market must be US or KR.');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((keyName) => `${JSON.stringify(keyName)}:${stableStringify(value[keyName])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function idempotencyKey(jobType, payload) {
  return `collector-${jobType.toLowerCase()}-${crypto.createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 24)}`;
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

async function upsertJob(jobType, payload, priority = 0) {
  const key = idempotencyKey(jobType, payload);
  const row = {
    job_type: jobType,
    status: 'queued',
    priority,
    payload,
    attempts: 0,
    locked_by: null,
    locked_at: null,
    error_message: null,
    completed_at: null,
    run_after: new Date().toISOString(),
    idempotency_key: key,
    created_by: 'local-analysis-collector',
    updated_at: new Date().toISOString(),
  };

  if (dryRun) return { ...row, dry_run: true };
  const { data, error } = await client
    .from('analysis_jobs')
    .upsert(row, { onConflict: 'job_type,idempotency_key' })
    .select('id, job_type, status, idempotency_key')
    .single();
  if (error) throw error;
  return data;
}

async function readLatestRecommendationPicks() {
  const { data: publications, error: publicationError } = await client
    .from('recommendation_publications')
    .select('id, run_date, market, engine_version')
    .eq('market', market)
    .eq('is_official', true)
    .eq('status', 'PUBLISHED')
    .lte('run_date', runDate)
    .order('run_date', { ascending: false })
    .limit(1);
  if (publicationError) throw publicationError;
  const publication = publications?.[0];
  if (!publication) return [];

  const { data, error } = await client
    .from('recommendation_picks')
    .select('ticker, exchange, name, rank, source, confidence, reason, risk, sector, candidate_snapshot')
    .eq('publication_id', publication.id)
    .order('rank', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((pick) => ({ ...pick, publication }));
}

async function readRecentSecurityEvents(tickers) {
  if (tickers.length === 0) return new Map();
  const since = new Date(`${runDate}T00:00:00.000Z`);
  since.setUTCDate(since.getUTCDate() - 14);
  const { data, error } = await client
    .from('security_events')
    .select('ticker, source, event_type, title, summary, source_url, occurred_at, payload')
    .eq('market', market)
    .in('ticker', tickers)
    .gte('occurred_at', since.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const grouped = new Map();
  for (const event of data || []) {
    const ticker = normalizeTicker(event.ticker);
    grouped.set(ticker, [...(grouped.get(ticker) || []), event]);
  }
  return grouped;
}

async function enqueueCommitteeAndNewsJobs(results) {
  const picks = await readLatestRecommendationPicks();
  const tickers = [...new Set(picks.map((pick) => normalizeTicker(pick.ticker)).filter(Boolean))];
  const eventsByTicker = await readRecentSecurityEvents(tickers);

  for (const pick of picks) {
    const ticker = normalizeTicker(pick.ticker);
    const basePayload = {
      ticker,
      market,
      recommendation_publication_id: pick.publication.id,
      recommendation_run_date: pick.publication.run_date,
      source: pick.source,
      rank: pick.rank,
      candidate_snapshot: pick.candidate_snapshot || {},
    };
    results.push(await upsertJob('COMMITTEE_REVIEW', {
      ...basePayload,
      agent_votes: [
        {
          agent_role: 'recommendation_engine',
          recommendation: Number(pick.rank) <= 3 ? 'BUY' : 'WATCH',
          confidence: Number(pick.confidence || 0.5),
          rationale: pick.reason || 'Latest recommendation pick.',
          evidence: { risk: pick.risk, sector: pick.sector, exchange: pick.exchange },
        },
      ],
    }, 30 - Number(pick.rank || 0)));

    const events = eventsByTicker.get(ticker) || [];
    if (events.length > 0) {
      results.push(await upsertJob('NEWS_PULSE', {
        ...basePayload,
        news: events.slice(0, 8).map((event) => ({
          source: event.source,
          headline: event.title,
          summary: event.summary,
          source_url: event.source_url,
          published_at: event.occurred_at,
          impact_label: event.event_type === 'EARNINGS' ? 'UNKNOWN' : 'NEUTRAL',
          raw_payload: event.payload || {},
        })),
      }, 20 - Number(pick.rank || 0)));
    }
  }
}

async function enqueueFinancialAuditJobs(results) {
  const { data, error } = await client
    .from('fundamental_cache')
    .select('ticker, market, eps_growth_pct, revenue_growth_pct, roe_pct, debt_to_equity_pct, source, updated_at')
    .eq('market', market)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  for (const row of data || []) {
    const financials = [
      ['eps_growth_pct', row.eps_growth_pct],
      ['revenue_growth_pct', row.revenue_growth_pct],
      ['roe_pct', row.roe_pct],
      ['debt_to_equity_pct', row.debt_to_equity_pct],
    ]
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([metric, value]) => ({
        metric,
        value: Number(value),
        source: row.source || 'fundamental_cache',
        period: 'latest',
        asOf: row.updated_at,
      }));
    results.push(await upsertJob('FINANCIAL_AUDIT', { ticker: row.ticker, market, financials }, 10));
  }
}

async function enqueueThesisCheckJobs(results) {
  const { data: theses, error } = await client
    .from('investment_theses')
    .select('id, ticker, market, title, thesis, status, health, thesis_assumptions(id, assumption_type, description, invalidation_condition, status, evidence)')
    .eq('market', market)
    .in('status', ['ACTIVE', 'WATCH'])
    .order('updated_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  for (const thesis of theses || []) {
    results.push(await upsertJob('THESIS_CHECK', {
      ticker: thesis.ticker,
      market,
      thesis_id: thesis.id,
      title: thesis.title,
      thesis: thesis.thesis,
      assumptions: (thesis.thesis_assumptions || []).map((assumption) => ({
        id: assumption.id,
        type: assumption.assumption_type,
        description: assumption.description,
        invalidation_condition: assumption.invalidation_condition,
        status: assumption.status,
        evidence: assumption.evidence || {},
      })),
      events: [],
      evidence: [],
    }, thesis.status === 'WATCH' ? 25 : 15));
  }
}

async function enqueueBacktestJob(results) {
  const since = new Date(`${runDate}T00:00:00.000Z`);
  since.setUTCDate(since.getUTCDate() - 120);
  const { data, error } = await client
    .from('recommendation_performance')
    .select('return_pct, excess_return_pct, horizon, evaluation_date, recommendation_picks!inner(ticker, rank, recommendation_publications!inner(market, run_date, is_official, status))')
    .eq('status', 'MATURED')
    .eq('recommendation_picks.recommendation_publications.market', market)
    .eq('recommendation_picks.recommendation_publications.is_official', true)
    .eq('recommendation_picks.recommendation_publications.status', 'PUBLISHED')
    .gte('recommendation_picks.recommendation_publications.run_date', since.toISOString().slice(0, 10))
    .limit(500);
  if (error) throw error;

  const trades = (data || []).map((row) => ({
    ticker: row.recommendation_picks?.ticker,
    rank: row.recommendation_picks?.rank,
    horizon: row.horizon,
    return_pct: Number(row.return_pct),
    excess_return_pct: row.excess_return_pct === null ? null : Number(row.excess_return_pct),
    evaluation_date: row.evaluation_date,
  })).filter((row) => Number.isFinite(row.return_pct));

  if (trades.length > 0) {
    results.push(await upsertJob('RECOMMENDATION_BACKTEST', {
      strategy_key: `official-recommendations-${market.toLowerCase()}`,
      dataset_key: `${runDate}-d120`,
      trades,
      assumptions: { market, run_date: runDate, lookback_days: 120 },
    }, 5));
  }
}

const results = [];
await enqueueCommitteeAndNewsJobs(results);
await enqueueFinancialAuditJobs(results);
await enqueueThesisCheckJobs(results);
await enqueueBacktestJob(results);

console.log(JSON.stringify({
  dryRun,
  market,
  runDate,
  limit,
  enqueued: results.length,
  jobs: results,
}, null, 2));
