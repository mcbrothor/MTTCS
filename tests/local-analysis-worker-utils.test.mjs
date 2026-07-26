import assert from 'node:assert/strict';
import {
  buildFinancialAuditResult,
  buildCommitteeReviewResult,
  buildNewsPulseResult,
  buildRecommendationBacktestResult,
  buildThesisCheckResult,
  buildWorkerConfig,
  hashPayload,
  stableStringify,
} from '../scripts/lib/local-analysis-worker-utils.mjs';

{
  assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(hashPayload({ b: 2, a: 1 }), hashPayload({ a: 1, b: 2 }));
}

{
  const config = buildWorkerConfig({
    MTN_LOCAL_WORKER_ID: 'test-worker',
    MTN_LOCAL_WORKER_POLL_MS: '2000',
    MTN_LOCAL_WORKER_STALE_AFTER_SECONDS: '45',
    MTN_LOCAL_WORKER_JOB_TYPES: 'FINANCIAL_AUDIT,NEWS_PULSE',
    MTN_LOCAL_WORKER_ONCE: 'true',
  });
  assert.equal(config.workerId, 'test-worker');
  assert.equal(config.pollMs, 2000);
  assert.equal(config.maxPollMs, 300000);
  assert.equal(config.staleAfterSeconds, 45);
  assert.deepEqual(config.jobTypes, ['FINANCIAL_AUDIT', 'NEWS_PULSE']);
  assert.equal(config.once, true);
}

{
  const result = buildThesisCheckResult({
    ticker: 'tsla',
    assumptions: [{ status: 'WEAKENED', description: 'Gross margin recovery' }],
    events: [{ impact: 'WEAKENS', summary: 'Margin slipped again.' }],
  });
  assert.equal(result.ticker, 'TSLA');
  assert.equal(result.impact, 'WEAKENS');
  assert.equal(result.health, 'WATCH');
}

{
  const result = buildNewsPulseResult({
    ticker: 'nvda',
    news: [
      { headline: 'New contract', impact_label: 'STRENGTHENS' },
      { headline: 'Export concern', impact_label: 'WEAKENS' },
      { headline: 'Regulatory break', impact_label: 'BREAKS' },
    ],
  });
  assert.equal(result.ticker, 'NVDA');
  assert.equal(result.dominantImpact, 'BREAKS');
  assert.equal(result.newsCount, 3);
}

{
  const result = buildCommitteeReviewResult({
    ticker: 'aapl',
    agent_votes: [
      { agent_role: 'technical', recommendation: 'BUY', confidence: 0.8 },
      { agent_role: 'risk', recommendation: 'WATCH', confidence: 0.5 },
      { agent_role: 'business', recommendation: 'BUY', confidence: 0.7 },
    ],
  });
  assert.equal(result.ticker, 'AAPL');
  assert.equal(result.consensus, 'BUY');
  assert.equal(result.votes.length, 3);
}

{
  const result = buildRecommendationBacktestResult({
    strategy_key: 'daily-top10',
    trades: [
      { return_pct: 8, excess_return_pct: 3 },
      { return_pct: -2, excess_return_pct: -1 },
      { return_pct: 4, excess_return_pct: 2 },
    ],
  });
  assert.equal(result.status, 'PASSED');
  assert.equal(result.metrics.sample_size, 3);
  assert.equal(result.metrics.hit_rate, 0.6667);
}

{
  const result = buildFinancialAuditResult({
    ticker: ' nvda ',
    market: 'US',
    financials: [
      { metric: 'revenue', source: 'SEC', value: 100, currency: 'USD', period: 'FY2026' },
      { metric: 'revenue', source: 'Yahoo', value: 103, currency: 'USD', period: 'FY2026' },
    ],
  });
  assert.equal(result.ticker, 'NVDA');
  assert.equal(result.status, 'PASS');
  assert.equal(result.findingCount, 0);
  assert.equal(result.sourceCount, 2);
}

{
  const result = buildFinancialAuditResult({
    ticker: '005930',
    market: 'KR',
    toleranceWarnPct: 5,
    toleranceFailPct: 15,
    financials: [
      { metric: 'operating_income', source: 'DART', value: 100, currency: 'KRW', period: 'FY2026' },
      { metric: 'operating_income', source: 'Naver', value: 122, currency: 'KRW', period: 'FY2026' },
    ],
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.severity, 'CRITICAL');
  assert.equal(result.findings[0].code, 'SOURCE_CONFLICT');
}

{
  const result = buildFinancialAuditResult({ ticker: 'AAPL', financials: [] });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.findings[0].code, 'DATA_MISSING');
}

assert.throws(
  () => buildFinancialAuditResult({ financials: [] }),
  /requires ticker/,
);

console.log('local analysis worker utils tests passed');
