import assert from 'node:assert/strict';
import {
  buildContestPrompt,
  calculateReturnPct,
  extractLlmSessionId,
  isReviewDue,
  parseLlmRankings,
  reviewDueDate,
  validateContestCandidates,
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
  assert.match(llmPrompt, /JSON만 출력/);
  assert.match(llmPrompt, /candidate_id/);
  assert.match(llmPrompt, /마스터 필터/);
  assert.match(llmPrompt, /NVDA/);
}

{
  assert.throws(
    () => validateContestCandidates([...candidates, { ...candidates[0] }]),
    /Duplicate candidate/
  );
}

{
  const rankings = parseLlmRankings(
    JSON.stringify({
      rankings: [
        { ticker: 'META', rank: 1, comment: 'best setup' },
        { ticker: 'NVDA', rank: 2, comment: 'extended' },
        { ticker: 'TSLA', rank: 3, comment: 'watch' },
      ],
    }),
    ['NVDA', 'META', 'TSLA']
  );
  assert.deepEqual(rankings.map((item) => item.ticker), ['META', 'NVDA', 'TSLA']);
}

{
  const rankings = parseLlmRankings(
    [
      '리포트 전문입니다.',
      '```json',
      JSON.stringify({
        rankings: [
          {
            candidate_id: 'cand-meta',
            ticker: 'META',
            rank: 1,
            scores: { technical: 91 },
            investment_thesis: 'best compounder',
            technical_view: 'tight base',
            fundamental_view: 'quality',
            earnings_growth_view: 'accelerating',
            moat_view: 'network',
            market_context: 'fits YELLOW market',
            risks: ['valuation'],
            catalysts: ['AI'],
            comment: 'best setup',
          },
          { candidate_id: 'cand-nvda', ticker: 'NVDA', rank: 2, comment: 'extended' },
          { candidate_id: 'cand-tsla', ticker: 'TSLA', rank: 3, comment: 'watch' },
        ],
      }),
      '```',
      '끝',
    ].join('\n'),
    candidates.map((candidate) => ({ id: candidate.candidate_id, ticker: candidate.ticker }))
  );

  assert.equal(rankings[0].candidate_id, 'cand-meta');
  assert.deepEqual(rankings[0].scores, { technical: 91 });
  assert.equal(rankings[0].analysis.investment_thesis, 'best compounder');
}

{
  const sessionId = extractLlmSessionId(JSON.stringify({
    rankings: [
      { session_id: 'session-from-paste', ticker: 'NVDA', rank: 1 },
      { session_id: 'session-from-paste', ticker: 'META', rank: 2 },
    ],
  }));
  assert.equal(sessionId, 'session-from-paste');
}

{
  assert.throws(
    () => parseLlmRankings('{"rankings":[{"ticker":"NVDA","rank":1}]}', ['NVDA', 'META']),
    /rank every selected candidate/
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
