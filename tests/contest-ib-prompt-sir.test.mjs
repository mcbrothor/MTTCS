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
    key_strength: '가격 패턴 기반 SEPA 통과, 펀더멘털은 외부 LLM 상세 검토 필요',
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
assert.match(prompt, /MTN Rule Engine의 순위, 점수, 추천, confidence는 최종 투자 결정이 아니라/);
assert.match(prompt, /PRELIMINARY_SCREEN/);
assert.match(prompt, /DECISION_INFLUENCING_REVIEW/);
assert.match(prompt, /mtn_alignment/);
assert.match(prompt, /final_decision_impact/);
assert.match(prompt, /override_reason/);
assert.match(prompt, /단일 LLM 호출의 페르소나 시뮬레이션/);
assert.match(prompt, /MTN 정량 점수 대비 외부 LLM의 최종 판단 영향/);

console.log('contest IB prompt SIR tests passed');
