import assert from 'node:assert/strict';
import { passesScannerMacroPolicy } from '../lib/finance/market/macro-policy.ts';
import { evaluateScannerRecommendation } from '../lib/scanner-recommendation.ts';
import {
  buildContestPrompt,
  CONTEST_RESPONSE_SCHEMA_VERSION,
  normalizeContestLlmResponse,
} from '../lib/contest.ts';
import {
  buildContestSnapshot,
  buildEntrySnapshot,
  buildLlmVerdict,
} from '../lib/finance/core/snapshot.ts';
import { attachTradeMetrics } from '../lib/finance/core/trade-metrics.ts';
import { calculatePortfolioRiskSummary } from '../lib/finance/core/portfolio-risk.ts';
import { getHistoryComparisonSummary } from '../lib/history-presentation.ts';
import { buildReviewStatsSummary } from '../lib/review-stats.ts';

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function execution(overrides) {
  return {
    id: crypto.randomUUID(),
    trade_id: 'trade-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    executed_at: '2026-01-01T00:00:00.000Z',
    side: 'ENTRY',
    price: 100,
    shares: 100,
    fees: 0,
    leg_label: 'E1',
    note: null,
    ...overrides,
  };
}

const strongSepaEvidence = {
  status: 'pass',
  summary: {
    passed: 9,
    failed: 0,
    info: 0,
    corePassed: 7,
    coreFailed: 0,
    coreTotal: 7,
  },
  metrics: {
    rsRating: 97,
    rsSource: 'DB_BATCH',
    macroActionLevel: 'FULL',
  },
  criteria: [],
};

const strongVcpAnalysis = {
  grade: 'A',
  score: 88,
  baseType: 'VCP',
  pivotPrice: 121,
  recommendedEntry: 122,
  invalidationPrice: 111,
  breakoutVolumeStatus: 'confirmed',
  contractions: [{}, {}, {}],
  volumeDryUpScore: 74,
  pocketPivotScore: 66,
};

run('simulates a professional leadership workflow from scanner to history review', () => {
  const scannerCandidate = {
    status: 'done',
    ticker: 'NVDA',
    exchange: 'NAS',
    sepaStatus: 'pass',
    sepaFailed: 0,
    sepaEvidence: strongSepaEvidence,
    vcpGrade: 'strong',
    vcpScore: 88,
    distanceToPivotPct: 1.2,
    pocketPivotScore: 66,
    volumeDryUpScore: 74,
    breakoutVolumeStatus: 'confirmed',
    rsRating: 97,
    weightedMomentumScore: 94,
    baseType: 'VCP',
    rsLineNearHigh: true,
    tennisBallCount: 2,
  };

  const recommendation = evaluateScannerRecommendation(scannerCandidate);
  assert.equal(recommendation.recommendationTier, 'Recommended');
  assert.equal(passesScannerMacroPolicy({ status: 'done', rsRating: 97 }, 'FULL'), true);

  const prompt = buildContestPrompt({
    market: 'US',
    universe: 'growth',
    sessionId: 'session-us-1',
    candidates: [
      { candidate_id: 'cand-1', ticker: 'NVDA', exchange: 'NAS', name: 'NVIDIA', user_rank: 1 },
      { candidate_id: 'cand-2', ticker: 'META', exchange: 'NAS', name: 'Meta', user_rank: 2 },
      { candidate_id: 'cand-3', ticker: 'SNOW', exchange: 'NAS', name: 'Snowflake', user_rank: 3 },
    ],
    marketContext: { state: 'GREEN', market: 'US', metrics: { p3Score: 87 } },
  });

  assert.match(prompt.llmPrompt, new RegExp(CONTEST_RESPONSE_SCHEMA_VERSION));

  const llmResponse = normalizeContestLlmResponse(
    JSON.stringify({
      response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
      session_id: 'session-us-1',
      rankings: [
        {
          session_id: 'session-us-1',
          candidate_id: 'cand-1',
          ticker: 'NVDA',
          rank: 1,
          overall: 'POSITIVE',
          key_strength: 'Explosive earnings and tight VCP near highs.',
          key_risk: 'Could fail if breakout volume fades.',
          recommendation: 'PROCEED',
          confidence: 0.86,
          comment: 'Best leadership candidate.',
          analysis: {},
        },
        {
          session_id: 'session-us-1',
          candidate_id: 'cand-2',
          ticker: 'META',
          rank: 2,
          overall: 'NEUTRAL',
          key_strength: 'Persistent RS support.',
          key_risk: 'Extended from the last base.',
          recommendation: 'WATCH',
          confidence: 0.64,
          comment: 'Watch for a cleaner reset.',
          analysis: {},
        },
        {
          session_id: 'session-us-1',
          candidate_id: 'cand-3',
          ticker: 'SNOW',
          rank: 3,
          overall: 'NEGATIVE',
          key_strength: 'Loose constructive bounce.',
          key_risk: 'Not enough institutional confirmation.',
          recommendation: 'SKIP',
          confidence: 0.58,
          comment: 'Too early for a full position.',
          analysis: {},
        },
      ],
    }),
    [
      { id: 'cand-1', ticker: 'NVDA' },
      { id: 'cand-2', ticker: 'META' },
      { id: 'cand-3', ticker: 'SNOW' },
    ],
    'session-us-1'
  );

  assert.equal(llmResponse.rankings[0].recommendation, 'PROCEED');

  const session = {
    id: 'session-us-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    market: 'US',
    universe: 'growth',
    selected_at: '2026-01-02T00:00:00.000Z',
    prompt_payload: prompt.payload,
    prompt_version: 'mtn-contest-ko-v3-rs-htf',
    response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
    market_context: { state: 'GREEN' },
    candidate_pool_snapshot: [],
    llm_prompt: prompt.llmPrompt,
    llm_raw_response: JSON.stringify(llmResponse),
    llm_provider: 'gemini',
    status: 'COMPLETED',
  };

  const candidate = {
    id: 'cand-1',
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    session_id: 'session-us-1',
    ticker: 'NVDA',
    exchange: 'NAS',
    name: 'NVIDIA',
    user_rank: 1,
    llm_rank: 1,
    llm_comment: 'Best leadership candidate.',
    recommendation_tier: recommendation.recommendationTier,
    recommendation_reason: recommendation.recommendationReason,
    llm_scores: { technical: 91, market_fit: 88 },
    llm_analysis: llmResponse.rankings[0].analysis,
    final_pick_rank: 1,
    final_pick_note: 'Chosen for plan build.',
    actual_invested: true,
    linked_trade_id: 'trade-nvda-1',
    entry_reference_price: 122,
    snapshot: prompt.payload[0],
  };

  const entrySnapshot = buildEntrySnapshot({
    ticker: 'NVDA',
    direction: 'LONG',
    checklist: {
      chk_sepa: true,
      chk_market: true,
      chk_risk: true,
      chk_entry: true,
      chk_stoploss: true,
      chk_exit: true,
      chk_psychology: true,
    },
    sepaEvidence: strongSepaEvidence,
    vcpAnalysis: strongVcpAnalysis,
    totalEquity: 50_000,
    plannedRisk: 600,
    riskPercent: 0.012,
    entryPrice: 122,
    stoplossPrice: 96,
    positionSize: 100,
    totalShares: 100,
    entryTargets: {
      e1: { label: 'E1', price: 122, shares: 50 },
      e2: { label: 'E2', price: 124, shares: 30 },
      e3: { label: 'E3', price: 128, shares: 20 },
    },
    trailingStops: {
      initial: 96,
      afterEntry2: 104,
      afterEntry3: 112,
    },
    planNote: 'Buy the strongest liquid AI leader on confirmation.',
    invalidationNote: 'Exit if price loses the VCP invalidation zone.',
  });
  const contestSnapshot = buildContestSnapshot(session, candidate);
  const llmVerdict = buildLlmVerdict(session, candidate);

  const activeTrade = attachTradeMetrics({
    id: 'trade-nvda-1',
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-05T00:00:00.000Z',
    ticker: 'NVDA',
    direction: 'LONG',
    status: 'ACTIVE',
    chk_sepa: true,
    chk_market: true,
    chk_risk: true,
    chk_entry: true,
    chk_stoploss: true,
    chk_exit: true,
    chk_psychology: true,
    sepa_evidence: strongSepaEvidence,
    total_equity: 50_000,
    planned_risk: 600,
    risk_percent: 0.012,
    atr_value: 4.2,
    entry_price: 122,
    stoploss_price: 96,
    position_size: 100,
    total_shares: 100,
    entry_targets: entrySnapshot.plan.entry_targets,
    trailing_stops: entrySnapshot.plan.trailing_stops,
    exit_price: null,
    exit_reason: null,
    result_amount: null,
    final_discipline: null,
    emotion_note: null,
    setup_tags: ['VCP', 'SEPA'],
    mistake_tags: [],
    plan_note: entrySnapshot.notes.plan_note,
    invalidation_note: entrySnapshot.notes.invalidation_note,
    review_note: null,
    review_action: null,
    entry_snapshot: entrySnapshot,
    contest_snapshot: contestSnapshot,
    llm_verdict: llmVerdict,
    executions: [
      execution({ trade_id: 'trade-nvda-1', price: 100, shares: 50, leg_label: 'E1' }),
      execution({ trade_id: 'trade-nvda-1', price: 104, shares: 30, leg_label: 'E2', executed_at: '2026-01-03T00:00:00.000Z' }),
      execution({ trade_id: 'trade-nvda-1', side: 'EXIT', price: 112, shares: 20, leg_label: 'MANUAL', executed_at: '2026-01-04T00:00:00.000Z' }),
      execution({ trade_id: 'trade-nvda-1', price: 118, shares: 20, leg_label: 'E3', executed_at: '2026-01-05T00:00:00.000Z' }),
    ],
  }, 124);

  const portfolio = calculatePortfolioRiskSummary(
    [activeTrade],
    50_000,
    [{ ticker: 'NVDA', exchange: 'NAS', name: 'NVIDIA', sector: 'Semiconductors', industry: 'AI Chips', market: 'US' }]
  );

  assert.equal(portfolio.activePositions, 1);
  assert.equal(portfolio.positions?.[0].pyramidCount, 2);
  assert.equal(portfolio.positions?.[0].partialExitCount, 1);
  assert.equal(portfolio.positions?.[0].latestAction, 'PYRAMID');

  const completedTrade = attachTradeMetrics({
    ...activeTrade,
    status: 'COMPLETED',
    updated_at: '2026-01-06T00:00:00.000Z',
    executions: [
      ...(activeTrade.executions || []),
      execution({ trade_id: 'trade-nvda-1', side: 'EXIT', price: 130, shares: 80, leg_label: 'MANUAL', executed_at: '2026-01-06T00:00:00.000Z' }),
    ],
    final_discipline: 91,
    result_amount: null,
    review_note: 'Scaled correctly and let the winner work.',
    review_action: 'Keep the same add-on discipline.',
  });

  const historySummary = getHistoryComparisonSummary(completedTrade);
  assert.equal(historySummary.tone, 'positive');
  assert.equal(historySummary.headline, 'Pre-trade conviction and actual outcome aligned.');

  const reviewStats = buildReviewStatsSummary([completedTrade]);
  assert.equal(reviewStats.setupTags[0].tag, 'SEPA');
  assert.equal(reviewStats.completedCount, 1);
});

run('simulates defensive behavior when macro conditions degrade', () => {
  assert.equal(passesScannerMacroPolicy({ status: 'done', rsRating: 74 }, 'REDUCED'), false);
  assert.equal(passesScannerMacroPolicy({ status: 'done', rsRating: 92 }, 'REDUCED'), true);
  assert.equal(passesScannerMacroPolicy({ status: 'done', rsRating: 92 }, 'HALT'), false);
  assert.equal(passesScannerMacroPolicy({ status: 'error', rsRating: null }, 'HALT'), true);

  const defensiveResponse = normalizeContestLlmResponse(
    JSON.stringify({
      response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
      session_id: 'session-red-1',
      rankings: [
        {
          session_id: 'session-red-1',
          candidate_id: 'cand-red-1',
          ticker: 'SNOW',
          rank: 1,
          overall: 'NEGATIVE',
          key_strength: 'Some bounce structure is visible.',
          key_risk: 'Macro tape is not supporting fresh exposure.',
          recommendation: 'SKIP',
          confidence: 0.72,
          comment: 'Wait for the regime to improve.',
          analysis: {},
        },
      ],
    }),
    [{ id: 'cand-red-1', ticker: 'SNOW' }],
    'session-red-1'
  );

  const losingTrade = attachTradeMetrics({
    id: 'trade-snow-1',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-04T00:00:00.000Z',
    ticker: 'SNOW',
    direction: 'LONG',
    status: 'COMPLETED',
    chk_sepa: false,
    chk_market: false,
    chk_risk: true,
    chk_entry: true,
    chk_stoploss: true,
    chk_exit: true,
    chk_psychology: true,
    sepa_evidence: null,
    total_equity: 50_000,
    planned_risk: 500,
    risk_percent: 0.01,
    atr_value: null,
    entry_price: 100,
    stoploss_price: 95,
    position_size: 100,
    total_shares: 100,
    entry_targets: null,
    trailing_stops: null,
    exit_price: null,
    exit_reason: '손절',
    result_amount: null,
    final_discipline: 86,
    emotion_note: null,
    setup_tags: ['Bounce'],
    mistake_tags: [],
    plan_note: null,
    invalidation_note: null,
    review_note: null,
    review_action: null,
    llm_verdict: {
      version: 'mtn-llm-verdict-v1',
      captured_at: '2026-02-01T00:00:00.000Z',
      session_id: 'session-red-1',
      candidate_id: 'cand-red-1',
      ticker: 'SNOW',
      llm_provider: 'gemini',
      llm_rank: 1,
      comment: defensiveResponse.rankings[0].comment,
      overall: defensiveResponse.rankings[0].overall,
      key_strength: defensiveResponse.rankings[0].key_strength,
      key_risk: defensiveResponse.rankings[0].key_risk,
      recommendation: defensiveResponse.rankings[0].recommendation,
      confidence: defensiveResponse.rankings[0].confidence,
      scores: null,
      raw: null,
      analysis: defensiveResponse.rankings[0].analysis,
      response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
    },
    executions: [
      execution({ trade_id: 'trade-snow-1', price: 100, shares: 100, leg_label: 'E1' }),
      execution({ trade_id: 'trade-snow-1', side: 'EXIT', price: 94, shares: 100, leg_label: 'MANUAL', executed_at: '2026-02-04T00:00:00.000Z' }),
    ],
  });

  const comparison = getHistoryComparisonSummary(losingTrade);
  assert.equal(comparison.tone, 'positive');
  assert.equal(comparison.headline, 'The skip verdict matched the weak outcome.');
});

run('surfaces per-position lifecycle data after multiple trims from the portfolio view', () => {
  const activeTrade = attachTradeMetrics({
    id: 'trade-meta-1',
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-05T00:00:00.000Z',
    ticker: 'META',
    direction: 'LONG',
    status: 'ACTIVE',
    chk_sepa: true,
    chk_market: true,
    chk_risk: true,
    chk_entry: true,
    chk_stoploss: true,
    chk_exit: true,
    chk_psychology: true,
    sepa_evidence: strongSepaEvidence,
    total_equity: 80_000,
    planned_risk: 800,
    risk_percent: 0.01,
    atr_value: 5,
    entry_price: 100,
    stoploss_price: 90,
    position_size: 100,
    total_shares: 100,
    entry_targets: null,
    trailing_stops: null,
    exit_price: null,
    exit_reason: null,
    result_amount: null,
    final_discipline: null,
    emotion_note: null,
    setup_tags: ['VCP'],
    mistake_tags: [],
    plan_note: null,
    invalidation_note: null,
    review_note: null,
    review_action: null,
    executions: [
      execution({ trade_id: 'trade-meta-1', price: 100, shares: 60, leg_label: 'E1' }),
      execution({ trade_id: 'trade-meta-1', price: 105, shares: 40, leg_label: 'E2', executed_at: '2026-03-02T00:00:00.000Z' }),
      execution({ trade_id: 'trade-meta-1', side: 'EXIT', price: 112, shares: 25, leg_label: 'MANUAL', executed_at: '2026-03-03T00:00:00.000Z' }),
      execution({ trade_id: 'trade-meta-1', side: 'EXIT', price: 118, shares: 20, leg_label: 'MANUAL', executed_at: '2026-03-04T00:00:00.000Z' }),
    ],
  }, 121);

  const portfolio = calculatePortfolioRiskSummary(
    [activeTrade],
    80_000,
    [{ ticker: 'META', exchange: 'NAS', name: 'Meta', sector: 'Internet', industry: 'Platforms', market: 'US' }]
  );

  assert.equal(portfolio.positions?.length, 1);
  assert.equal(portfolio.positions?.[0].partialExitCount, 2);
  assert.equal(portfolio.positions?.[0].pyramidCount, 1);
  assert.equal(portfolio.positions?.[0].latestAction, 'PARTIAL_EXIT');
});

console.log('e2e lifecycle tests passed');
