import assert from 'node:assert/strict';
import { buildContestSnapshot, buildEntrySnapshot, buildLlmVerdict } from '../lib/finance/core/snapshot.ts';

{
  const snapshot = buildEntrySnapshot({
    ticker: 'nvda',
    direction: 'LONG',
    checklist: {
      chk_sepa: true,
      chk_risk: true,
      chk_entry: true,
      chk_stoploss: true,
      chk_exit: false,
      chk_psychology: true,
    },
    sepaEvidence: {
      status: 'pass',
      criteria: [],
      summary: {
        passed: 8,
        failed: 1,
        info: 0,
        total: 9,
        corePassed: 7,
        coreFailed: 0,
        coreTotal: 7,
      },
      metrics: {
        lastClose: 100,
        ma50: 95,
        ma150: 90,
        ma200: 85,
        high52Week: 110,
        distanceFromHigh52WeekPct: -9.09,
        low52Week: 60,
        distanceFromLow52WeekPct: 66.67,
        avgDollarVolume20: 10_000_000,
        rsRating: 97,
        rsSource: 'DB_BATCH',
        macroActionLevel: 'FULL',
      },
    },
    vcpAnalysis: {
      grade: 'strong',
      score: 92,
      baseType: 'Standard_VCP',
      pivotPrice: 101,
      recommendedEntry: 101.5,
      invalidationPrice: 96,
      breakoutVolumeStatus: 'confirmed',
      contractions: [{}, {}],
      volumeDryUpScore: 74,
      pocketPivotScore: 68,
    },
    totalEquity: 100000,
    plannedRisk: 1000,
    riskPercent: 0.01,
    entryPrice: 101.5,
    stoplossPrice: 96,
    positionSize: 18000,
    totalShares: 180,
    entryTargets: { initialTarget: 110, secondaryTarget: 118 },
    trailingStops: { strategy: 'TEN_WEEK_MA', enabled: true },
    planNote: 'pilot entry',
    invalidationNote: 'lose pivot',
    capturedAt: '2026-04-23T00:00:00.000Z',
  });

  assert.equal(snapshot.ticker, 'NVDA');
  assert.equal(snapshot.checklist.market, true);
  assert.equal(snapshot.sepa.core_passed, 7);
  assert.equal(snapshot.sepa.rs_source, 'DB_BATCH');
  assert.equal(snapshot.vcp.contraction_count, 2);
  assert.equal(snapshot.plan.total_shares, 180);
  assert.equal(snapshot.notes.plan_note, 'pilot entry');
}

{
  const snapshot = buildEntrySnapshot({
    ticker: '005930',
    direction: 'LONG',
    checklist: {},
    sepaEvidence: null,
    vcpAnalysis: null,
    capturedAt: '2026-04-23T00:00:00.000Z',
  });

  assert.equal(snapshot.checklist.market, false);
  assert.equal(snapshot.sepa.status, null);
  assert.equal(snapshot.vcp.grade, null);
  assert.equal(snapshot.plan.entry_targets, null);
}

{
  const session = {
    id: 'session-1',
    market: 'US',
    universe: 'NASDAQ100',
    selected_at: '2026-04-23T00:00:00.000Z',
    status: 'REVIEW_READY',
    llm_provider: 'gemini',
    response_schema_version: 'mtn-contest-json-v3',
    market_context: { state: 'YELLOW' },
    candidate_pool_snapshot: [{ ticker: 'NVDA' }],
  };
  const candidate = {
    id: 'candidate-1',
    session_id: 'session-1',
    ticker: 'NVDA',
    exchange: 'NAS',
    name: 'NVIDIA',
    user_rank: 1,
    llm_rank: 2,
    llm_comment: 'High quality leader',
    llm_scores: { technical: 95 },
    llm_analysis: {
      overall: 'POSITIVE',
      key_strength: 'AI infrastructure leader',
      key_risk: 'Could be extended',
      recommendation: 'PROCEED',
      confidence: 0.82,
      raw: { source: 'gemini' },
    },
    actual_invested: true,
    final_pick_rank: 1,
    recommendation_tier: 'Recommended',
    recommendation_reason: 'Best RS and structure',
    entry_reference_price: 101.5,
    linked_trade_id: 'trade-1',
  };

  const contestSnapshot = buildContestSnapshot(session, candidate, '2026-04-23T01:00:00.000Z');
  const llmVerdict = buildLlmVerdict(session, candidate, '2026-04-23T01:00:00.000Z');

  assert.equal(contestSnapshot.session.id, 'session-1');
  assert.equal(contestSnapshot.candidate.recommendation_tier, 'Recommended');
  assert.deepEqual(contestSnapshot.market_context, { state: 'YELLOW' });
  assert.equal(llmVerdict.llm_provider, 'gemini');
  assert.deepEqual(llmVerdict.scores, { technical: 95 });
  assert.equal(llmVerdict.recommendation, 'PROCEED');
  assert.equal(llmVerdict.confidence, 0.82);
  assert.deepEqual(llmVerdict.raw, { source: 'gemini' });
}

console.log('trade snapshot tests passed');
