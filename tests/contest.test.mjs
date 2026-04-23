import assert from 'node:assert/strict';
import {
  buildContestPrompt,
  calculateReturnPct,
  extractLlmSessionId,
  isReviewDue,
  normalizeContestLlmResponse,
  parseLlmRankings,
  reviewDueDate,
  validateContestCandidates,
  CONTEST_RESPONSE_SCHEMA_VERSION,
} from '../lib/contest.ts';

const candidates = Array.from({ length: 3 }, (_, index) => ({
  candidate_id: ['cand-nvda', 'cand-meta', 'cand-tsla'][index],
  ticker: ['NVDA', 'META', 'TSLA'][index],
  exchange: 'NAS',
  name: ['Nvidia', 'Meta', 'Tesla'][index],
  user_rank: index + 1,
  rs_rating: 90 - index,
  sepa_status: 'pass',
  sepa_passed: 8,
  sepa_failed: 1,
  vcp_status: 'strong',
  vcp_score: 80 - index,
  contraction_score: 75,
  volume_dry_up_score: 70,
  bb_squeeze_score: 65,
  pocket_pivot_score: 60,
  pivot_price: 100 + index,
  distance_to_pivot_pct: index,
  avg_dollar_volume: 10_000_000,
  price: 100 + index,
  price_as_of: '20260416',
  source: 'test',
}));

{
  const { payload, llmPrompt } = buildContestPrompt({
    market: 'US',
    universe: 'NASDAQ100',
    sessionId: 'session-1',
    candidates,
    marketContext: { state: 'YELLOW', market: 'US', metrics: { p3Score: 55 } },
  });
  assert.equal(payload.length, 3);
  assert.match(llmPrompt, /response_schema_version/);
  assert.match(llmPrompt, /PROCEED/);
  assert.match(llmPrompt, /key_strength/);
  assert.match(llmPrompt, /NVDA/);
}

{
  assert.throws(
    () => validateContestCandidates([...candidates, { ...candidates[0] }]),
    /Duplicate candidate/
  );
}

{
  const normalized = normalizeContestLlmResponse(
    JSON.stringify({
      response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
      session_id: 'session-1',
      rankings: [
        {
          session_id: 'session-1',
          candidate_id: 'cand-meta',
          ticker: 'META',
          rank: 1,
          overall: 'POSITIVE',
          key_strength: 'Best mix of earnings and structure',
          key_risk: 'Could be extended after earnings',
          recommendation: 'PROCEED',
          confidence: 0.84,
          comment: 'Top pick',
          scores: { technical: 91 },
        },
        {
          session_id: 'session-1',
          candidate_id: 'cand-nvda',
          ticker: 'NVDA',
          rank: 2,
          overall: 'NEUTRAL',
          key_strength: 'Elite relative strength',
          key_risk: 'Needs tighter handle',
          recommendation: 'WATCH',
          confidence: 0.63,
        },
        {
          session_id: 'session-1',
          candidate_id: 'cand-tsla',
          ticker: 'TSLA',
          rank: 3,
          overall: 'NEGATIVE',
          key_strength: 'Volatile momentum',
          key_risk: 'Weak earnings quality',
          recommendation: 'SKIP',
          confidence: 0.74,
        },
      ],
    }),
    candidates.map((candidate) => ({ id: candidate.candidate_id, ticker: candidate.ticker })),
    'session-1'
  );

  assert.equal(normalized.response_schema_version, CONTEST_RESPONSE_SCHEMA_VERSION);
  assert.equal(normalized.session_id, 'session-1');
  assert.equal(normalized.rankings[0].recommendation, 'PROCEED');
}

{
  const rankings = parseLlmRankings(
    [
      'preface',
      '```json',
      JSON.stringify({
        rankings: [
          {
            candidate_id: 'cand-meta',
            session_id: 'session-1',
            ticker: 'META',
            rank: 1,
            overall: 'POSITIVE',
            key_strength: 'Best compounder',
            key_risk: 'Valuation remains high',
            recommendation: 'PROCEED',
            confidence: 0.88,
            scores: { technical: 91 },
            investment_thesis: 'best compounder',
            technical_view: 'tight base',
            market_context: 'fits YELLOW market',
            risks: ['valuation'],
            catalysts: ['AI'],
            comment: 'best setup',
          },
          {
            candidate_id: 'cand-nvda',
            session_id: 'session-1',
            ticker: 'NVDA',
            rank: 2,
            overall: 'NEUTRAL',
            key_strength: 'Leadership remains strong',
            key_risk: 'Extended from proper entry',
            recommendation: 'WATCH',
            confidence: 0.67,
          },
          {
            candidate_id: 'cand-tsla',
            session_id: 'session-1',
            ticker: 'TSLA',
            rank: 3,
            overall: 'NEGATIVE',
            key_strength: 'Can move fast',
            key_risk: 'Too erratic for current tape',
            recommendation: 'SKIP',
            confidence: 0.7,
          },
        ],
      }),
      '```',
    ].join('\n'),
    candidates.map((candidate) => ({ id: candidate.candidate_id, ticker: candidate.ticker }))
  );

  assert.equal(rankings[0].candidate_id, 'cand-meta');
  assert.deepEqual(rankings[0].scores, { technical: 91 });
  assert.equal(rankings[0].analysis.key_strength, 'Best compounder');
  assert.equal(rankings[0].analysis.recommendation, 'PROCEED');
}

{
  const sessionId = extractLlmSessionId(JSON.stringify({
    response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
    session_id: 'session-from-paste',
    rankings: [
      { session_id: 'session-from-paste', ticker: 'NVDA', rank: 1 },
      { session_id: 'session-from-paste', ticker: 'META', rank: 2 },
    ],
  }));
  assert.equal(sessionId, 'session-from-paste');
}

{
  assert.throws(
    () => normalizeContestLlmResponse(
      JSON.stringify({
        session_id: 'other-session',
        rankings: [
          {
            session_id: 'other-session',
            ticker: 'NVDA',
            rank: 1,
            overall: 'POSITIVE',
            key_strength: 'Leader',
            key_risk: 'Extended',
            recommendation: 'PROCEED',
            confidence: 0.8,
          },
          {
            session_id: 'other-session',
            ticker: 'META',
            rank: 2,
            overall: 'NEUTRAL',
            key_strength: 'Stable',
            key_risk: 'Slowdown',
            recommendation: 'WATCH',
            confidence: 0.6,
          },
        ],
      }),
      ['NVDA', 'META'],
      'session-1'
    ),
    /session_id mismatch/
  );
}

{
  assert.throws(
    () => parseLlmRankings('{"rankings":[{"ticker":"NVDA","rank":1}]}', ['NVDA', 'META']),
    /rank every selected candidate|Each ranking must include/
  );
}

{
  assert.equal(reviewDueDate('2026-04-17T00:00:00.000Z', 'W1'), '2026-04-24');
  assert.equal(reviewDueDate('2026-04-17T00:00:00.000Z', 'M1'), '2026-05-17');
  assert.equal(calculateReturnPct(100, 112.345), 12.35);
  assert.equal(calculateReturnPct(0, 112.345), null);
}

{
  assert.equal(isReviewDue({ due_date: '2026-04-16', status: 'PENDING' }, new Date('2026-04-17T00:00:00Z')), true);
  assert.equal(isReviewDue({ due_date: '2026-04-18', status: 'PENDING' }, new Date('2026-04-17T00:00:00Z')), false);
  assert.equal(isReviewDue({ due_date: '2026-04-16', status: 'UPDATED' }, new Date('2026-04-17T00:00:00Z')), false);
}

console.log('contest tests passed');
