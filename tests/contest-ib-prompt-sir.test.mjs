import assert from 'node:assert/strict';
import { buildIbValidationPrompt } from '../lib/ai/contest-ib-prompt.ts';

const session = {
  id: 'sir-session-1',
  created_at: '2026-04-26T00:00:00.000Z',
  updated_at: '2026-04-26T00:00:00.000Z',
  market: 'US',
  universe: 'NASDAQ100',
  selected_at: '2026-04-26T00:00:00.000Z',
  prompt_payload: [],
  llm_prompt: '',
  llm_raw_response: null,
  llm_provider: null,
  status: 'ANALYZED',
};

const candidate = {
  id: 'cand-top',
  created_at: '2026-04-26T00:00:00.000Z',
  updated_at: '2026-04-26T00:00:00.000Z',
  session_id: 'sir-session-1',
  ticker: 'TOP',
  exchange: 'NAS',
  name: 'Top Corp',
  user_rank: 1,
  llm_rank: 1,
  llm_comment: 'Top pick',
  llm_scores: { vcp: 80, rs: 90, sepa: 75, momentum: 85, technical: 82 },
  llm_analysis: {
    key_strength: 'Strong SEPA/VCP setup that still needs fundamental validation',
    key_risk: 'Event risk requires review',
    recommendation: 'PROCEED',
    confidence: 0.84,
  },
  actual_invested: false,
  linked_trade_id: null,
  entry_reference_price: 100,
  snapshot: {
    rs_rating: 96,
    rs_source: 'stock_metrics',
    rs_percentile: 96,
    rs_data_quality: 'OK',
    vcp_score: 80,
    vcp_status: 'strong',
    sepa_passed: 7,
    sepa_failed: 1,
    high_tight_flag: { passed: true, stopReliability: 'RELIABLE', stopPrice: 94 },
  },
};

const prompt = buildIbValidationPrompt(session, [candidate], {
  state: 'YELLOW',
  metrics: { p3Score: 55 },
  insightLog: ['test context'],
});

assert.match(prompt, /SYSTEM-LIMITATION DISCLOSURE/);
assert.match(prompt, /DECISION HIERARCHY/);
assert.match(prompt, /MTN Rule Engine의 순위, 점수, 추천, confidence는 최종 투자 결정이 아닙니다/);
assert.match(prompt, /실질적인 투자 판단은 IB Investment Committee의 독립적 최종 판단입니다/);
assert.match(prompt, /committee_role": "FINAL_INVESTMENT_JUDGMENT"/);
assert.match(prompt, /PRELIMINARY_SCREEN/);
assert.match(prompt, /mtn_alignment/);
assert.match(prompt, /final_decision_impact/);
assert.match(prompt, /override_reason/);
assert.match(prompt, /"name": "<company name or null>"/);
assert.match(prompt, /Committee Ranking Rationale/);
assert.match(prompt, /Top Pick 표기에는 ticker와 company name/);
assert.match(prompt, /전체 markdown report는 1,200~1,800단어 안에서 끝내십시오/);
assert.match(prompt, /MTN 정량 결과는 1차 후보 선별/);
assert.doesNotMatch(prompt, /諛|李|꾩|쒖/);

const canslimPrompt = buildIbValidationPrompt({
  ...session,
  id: 'sir-canslim-1',
  prompt_payload: [{ ticker: 'TOP', exchange: 'NAS', name: 'Top Corp', user_rank: 1, screener_source: 'canslim' }],
}, [{
  ...candidate,
  snapshot: {
    ...candidate.snapshot,
    screener_source: 'canslim',
    canslim: { pass: true, confidence: 'HIGH', n_status: 'VALID', dual_tier: 'TIER_1', pillars: [] },
  },
}], null, false);

assert.match(canslimPrompt, /O'NEIL CANSLIM COMMITTEE MANDATE/);
assert.match(canslimPrompt, /CANSLIM pillar changes the committee view/);
assert.match(canslimPrompt, /canslim_data/);

console.log('contest IB prompt SIR tests passed');
