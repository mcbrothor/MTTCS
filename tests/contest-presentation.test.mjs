import assert from 'node:assert/strict';
import { getContestStructuredVerdict } from '../lib/contest-presentation.ts';
import { contestCandidatePlanHref, contestFollowUpCopy, contestWatchlistPriority } from '../lib/contest-followup.ts';

{
  const verdict = getContestStructuredVerdict({
    llm_comment: 'Top setup',
    llm_analysis: {
      overall: 'POSITIVE',
      key_strength: 'Tight base and strong RS',
      key_risk: 'Slightly extended',
      recommendation: 'PROCEED',
      confidence: 0.83,
    },
  });

  assert.equal(verdict.overall, 'POSITIVE');
  assert.equal(verdict.keyStrength, 'Tight base and strong RS');
  assert.equal(verdict.keyRisk, 'Slightly extended');
  assert.equal(verdict.recommendation, 'PROCEED');
  assert.equal(verdict.confidence, 0.83);
  assert.equal(verdict.comment, 'Top setup');
  assert.equal(verdict.hasStructuredData, true);
}

{
  const verdict = getContestStructuredVerdict({
    llm_comment: null,
    llm_analysis: {
      investment_thesis: 'Fallback thesis',
      confidence: '0.62',
    },
  });

  assert.equal(verdict.overall, null);
  assert.equal(verdict.keyStrength, 'Fallback thesis');
  assert.equal(verdict.comment, 'Fallback thesis');
  assert.equal(verdict.confidence, 0.62);
  assert.equal(verdict.hasStructuredData, true);
}

{
  const verdict = getContestStructuredVerdict({
    llm_comment: 'Legacy only',
    llm_analysis: null,
  });

  assert.equal(verdict.overall, null);
  assert.equal(verdict.keyStrength, null);
  assert.equal(verdict.keyRisk, null);
  assert.equal(verdict.recommendation, null);
  assert.equal(verdict.confidence, null);
  assert.equal(verdict.comment, 'Legacy only');
  assert.equal(verdict.hasStructuredData, false);
}

{
  assert.equal(contestCandidatePlanHref({ ticker: 'GOOGL', exchange: 'NAS' }), '/plan?ticker=GOOGL&exchange=NAS');
  assert.equal(contestWatchlistPriority('PROCEED'), 2);
  assert.equal(contestWatchlistPriority('WATCH'), 1);
  assert.equal(contestWatchlistPriority('SKIP'), 0);
  assert.equal(contestFollowUpCopy(0).empty, true);
  assert.equal(contestFollowUpCopy(2).empty, false);
}

console.log('contest presentation tests passed');
