import assert from 'node:assert/strict';
import { runRuleEngine } from '../lib/ai/contest-rule-engine.ts';

function candidate(id, ticker, userRank, snapshot) {
  return { id, ticker, name: ticker, user_rank: userRank, snapshot };
}

const baseSnapshot = {
  exchange: 'NAS',
  sepa_status: 'pass',
  sepa_passed: 7,
  sepa_failed: 1,
  vcp_status: 'strong',
  vcp_score: 80,
  contraction_score: 75,
  volume_dry_up_score: 72,
  bb_squeeze_score: 70,
  pocket_pivot_score: 65,
  pivot_price: 100,
  distance_to_pivot_pct: 2,
  avg_dollar_volume: 30_000_000,
  price: 102,
  return_12m: 80,
  high_tight_flag: {
    passed: true,
    baseDays: 12,
    stopReliability: 'RELIABLE',
    stopPrice: 94,
    stopPlan: ['Initial stop'],
  },
};

const response = runRuleEngine([
  candidate('c-top', 'TOP', 1, {
    ...baseSnapshot,
    rs_rating: 96,
    rs_percentile: 96,
    ibd_proxy_score: 94,
    mansfield_rs_flag: true,
    mansfield_rs_score: 1.2,
  }),
  candidate('c-watch', 'MID', 2, {
    ...baseSnapshot,
    vcp_score: 62,
    sepa_passed: 4,
    sepa_failed: 3,
    rs_rating: 76,
    rs_percentile: 76,
    high_tight_flag: { passed: false, baseDays: 8, stopReliability: 'PATTERN_NOT_CONFIRMED', stopPrice: null, stopPlan: [] },
  }),
  candidate('c-missing-rs', 'NORS', 3, {
    ...baseSnapshot,
    vcp_score: 72,
    rs_rating: null,
    rs_percentile: null,
    ibd_proxy_score: null,
  }),
  candidate('c-blocked', 'BASE', 4, {
    ...baseSnapshot,
    rs_rating: 88,
    high_tight_flag: { passed: false, baseDays: 2, stopReliability: 'INSUFFICIENT_BASE', stopPrice: null, stopPlan: [] },
  }),
  candidate('c-low', 'LOW', 5, {
    ...baseSnapshot,
    sepa_status: 'fail',
    sepa_passed: 1,
    sepa_failed: 7,
    vcp_status: 'none',
    vcp_score: 8,
    contraction_score: 5,
    volume_dry_up_score: 5,
    bb_squeeze_score: 5,
    pocket_pivot_score: 5,
    rs_rating: 22,
    rs_percentile: 22,
    distance_to_pivot_pct: 35,
    avg_dollar_volume: 1_000_000,
  }),
], 'sir-session-1');

assert.equal(response.session_id, 'sir-session-1');
assert.equal(response.rankings.length, 5);

const recommendations = new Set(response.rankings.map((ranking) => ranking.recommendation));
assert.ok(recommendations.has('PROCEED'), 'varied candidate set should include PROCEED');
assert.ok(recommendations.has('SKIP'), 'varied candidate set should include SKIP');
assert.ok(recommendations.size > 1, 'recommendations should not collapse to one value');

const top = response.rankings.find((ranking) => ranking.ticker === 'TOP');
assert.equal(top.analysis.mtn_role, 'PRELIMINARY_SCREEN');
assert.equal(top.analysis.committee_role, 'DECISION_INFLUENCING_REVIEW');
assert.ok(top.analysis.disclaimers.some((item) => item.includes('1차 정량 평가')));

const missingRs = response.rankings.find((ranking) => ranking.ticker === 'NORS');
assert.ok(missingRs.analysis.risk_flags.includes('RS_DATA_MISSING'));
assert.equal(missingRs.analysis.data_quality.rs_available, false);

const blocked = response.rankings.find((ranking) => ranking.ticker === 'BASE');
assert.ok(blocked.analysis.risk_flags.includes('STOP_PLAN_BLOCKED_INSUFFICIENT_BASE'));
assert.equal(blocked.analysis.data_quality.stop_plan_available, false);
assert.notEqual(blocked.recommendation, 'PROCEED');

console.log('contest rule engine SIR tests passed');
