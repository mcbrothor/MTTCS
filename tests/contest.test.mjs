import assert from 'node:assert/strict';
import {
  buildContestPrompt,
  calculateReturnPct,
  isReviewDue,
  parseLlmRankings,
  reviewDueDate,
  validateContestCandidates,
} from '../lib/contest.ts';

const candidates = Array.from({ length: 3 }, (_, index) => ({
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
  const { payload, llmPrompt } = buildContestPrompt({ market: 'US', universe: 'NASDAQ100', candidates });
  assert.equal(payload.length, 3);
  assert.match(llmPrompt, /ONLY valid JSON/);
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
