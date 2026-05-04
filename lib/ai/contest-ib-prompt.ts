import type { BeautyContestSession, ContestCandidate, MasterFilterResponse } from '@/types';

export const IB_PROMPT_VERSION = 'mtn-ib-committee-v3-concise-memo';
export const IB_RESPONSE_SCHEMA_VERSION = 'mtn-ib-committee-markdown-v2';

export interface IbCandidateInput {
  ticker: string;
  name: string | null;
  mtn_rank: number;
  score_total: number;
  score_breakdown: {
    vcp: number;
    rs: number;
    sepa: number;
    momentum: number;
    technical: number;
  };
  snapshot: Record<string, unknown>;
}

const SYSTEM_LIMITATION_DISCLOSURE = `
[SYSTEM-LIMITATION DISCLOSURE - 반드시 평가에 반영]

MTN 정량 점수(VCP, RS, SEPA, Momentum, Technical Quality)는 1차 후보 선별용입니다.
아래 한계를 명시적으로 보완하십시오.

(L-1) SEPA 점수는 가격/패턴 기반이며 EPS 컨센서스, 가이던스, 백로그, 매출 mix를 자동 반영하지 않습니다.
(L-2) RS는 universe-relative proxy이며 IBD Official RS Rating이 아닙니다.
(L-3) Moat, 경쟁우위, 회계 품질, 이벤트 캘린더, 정책/규제 리스크는 별도 판단이 필요합니다.
(L-4) 외부 LLM 판단은 최종 매매 계획을 보조하는 2차 검토입니다. MTN 점수와 충돌하면 채택 여부와 근거를 분명히 적으십시오.
`.trim();

const DECISION_HIERARCHY = `
[DECISION HIERARCHY - MTN은 1차 스크린, IB 위원회는 의사결정 보정 레이어]

MTN Rule Engine의 순위, 점수, 추천, confidence는 최종 투자 결정이 아닙니다.
위원회는 MTN 결과를 존중하되 그대로 복제하지 말고, 펀더멘털, 촉매, 리스크, 유동성, 집행 가능성 관점에서 재평가하십시오.

반드시 수행할 것:
1. MTN 순위와 위원회 최종 순위가 일치하는지 명시하십시오.
2. 다르면 upgrade/downgrade/rerank 이유를 구체적으로 설명하십시오.
3. 각 후보의 final_decision_impact를 LOW / MEDIUM / HIGH로 분류하십시오.
4. 보고서는 실제 포트폴리오 매니저가 바로 읽을 수 있는 투자위원회 메모 톤으로 작성하십시오.
`.trim();

function extractScores(candidate: ContestCandidate): IbCandidateInput['score_breakdown'] {
  const scores = candidate.llm_scores as Record<string, unknown> | null | undefined;
  if (scores && typeof scores === 'object') {
    return {
      vcp: Number(scores.vcp ?? 0),
      rs: Number(scores.rs ?? 0),
      sepa: Number(scores.sepa ?? 0),
      momentum: Number(scores.momentum ?? 0),
      technical: Number(scores.technical ?? 0),
    };
  }
  return { vcp: 0, rs: 0, sepa: 0, momentum: 0, technical: 0 };
}

function extractAnalysis(candidate: ContestCandidate): Record<string, unknown> {
  return (candidate.llm_analysis ?? {}) as Record<string, unknown>;
}

function compactSnapshot(snap: Record<string, unknown> | null): Record<string, unknown> {
  if (!snap) return {};
  return {
    rs_rating: snap.rs_rating,
    rs_source: snap.rs_source,
    rs_percentile: snap.rs_percentile,
    rs_data_quality: snap.rs_data_quality,
    rs_line_new_high: snap.rs_line_new_high,
    vcp_score: snap.vcp_score,
    vcp_status: snap.vcp_status,
    sepa_passed: snap.sepa_passed,
    sepa_failed: snap.sepa_failed,
    base_type: snap.base_type,
    distance_to_pivot_pct: snap.distance_to_pivot_pct,
    ibd_proxy_score: snap.ibd_proxy_score,
    mansfield_rs_flag: snap.mansfield_rs_flag,
    return_3m: snap.return_3m,
    return_6m: snap.return_6m,
    return_12m: snap.return_12m,
    macro_action_level: snap.macro_action_level,
    contraction_score: snap.contraction_score,
    volume_dry_up_score: snap.volume_dry_up_score,
    avg_dollar_volume: snap.avg_dollar_volume,
    price: snap.price,
    high_tight_flag: snap.high_tight_flag,
    recommendation_tier: snap.recommendation_tier,
    recommendation_reason: snap.recommendation_reason,
    exception_signals: snap.exception_signals,
  };
}

function candidatePayload(candidates: ContestCandidate[], includeJsonMetadata: boolean) {
  const allRanked = [...candidates].sort((a, b) => (a.llm_rank ?? 99) - (b.llm_rank ?? 99));
  const ranked = includeJsonMetadata ? allRanked.slice(0, 10) : allRanked;

  return ranked.map((candidate) => {
    const snapshot = compactSnapshot((candidate.snapshot ?? {}) as Record<string, unknown>);
    const scores = extractScores(candidate);
    const analysis = extractAnalysis(candidate);
    const scoreTotal = scores.vcp + scores.rs + scores.sepa + scores.momentum + scores.technical;

    return {
      ticker: candidate.ticker,
      name: candidate.name,
      exchange: candidate.exchange,
      mtn_rank: candidate.llm_rank,
      score_total: Math.round(scoreTotal * 10) / 10,
      score_breakdown: scores,
      mtn_key_strength: analysis.key_strength ?? null,
      mtn_key_risk: analysis.key_risk ?? null,
      mtn_recommendation: analysis.recommendation ?? null,
      mtn_confidence: analysis.confidence ?? null,
      technical_data: snapshot,
    };
  });
}

export function buildIbValidationPrompt(
  session: BeautyContestSession,
  candidates: ContestCandidate[],
  marketContext?: MasterFilterResponse | null,
  includeJsonMetadata: boolean = true
): string {
  const ranked = candidatePayload(candidates, includeJsonMetadata);
  const marketBlock = marketContext ? {
    state: marketContext.state,
    p3Score: marketContext.metrics?.p3Score ?? null,
    insightLog: marketContext.insightLog ?? null,
  } : null;

  const dataPayload = JSON.stringify({
    decision_context: {
      mtn_role: 'PRELIMINARY_SCREEN',
      committee_role: 'DECISION_INFLUENCING_REVIEW',
      final_decision_note: 'MTN 정량 결과는 1차 후보 선별이며, IB 위원회 상세 평가는 최종 매매 계획 결정에 영향을 주는 보정 레이어입니다.',
    },
    universe: session.universe,
    market: session.market,
    selected_at: session.selected_at,
    market_context: marketBlock,
    mtn_ranked_candidates: ranked,
  }, null, 2);

  const tickerList = ranked.map((candidate) => `${candidate.ticker}${candidate.name ? ` (${candidate.name})` : ''}`).join(', ');

  return [
    SYSTEM_LIMITATION_DISCLOSURE,
    '',
    DECISION_HIERARCHY,
    '',
    '# Role',
    '당신은 글로벌 투자은행의 Investment Committee 서기 겸 수석 애널리스트입니다.',
    '한국어로 작성하되, ticker, rating, target, EPS 같은 금융 용어와 숫자는 원문 표기를 유지하십시오.',
    '',
    '# Input Data',
    'MTN Rule Engine scoring: VCP 25 + RS 25 + SEPA 20 + Momentum 15 + Technical Quality 15 = 100.',
    '',
    '```json',
    dataPayload,
    '```',
    '',
    '# Output Contract',
    includeJsonMetadata
      ? '응답은 반드시 Part 1 JSON metadata fence로 시작하고, 그 뒤에 Part 2 markdown report를 코드블록 없이 작성하십시오.'
      : '아래 구조의 markdown report만 작성하십시오. JSON metadata는 출력하지 마십시오.',
    '',
    ...(includeJsonMetadata ? [
      '```json',
      `{`,
      `  "schema_version": "${IB_RESPONSE_SCHEMA_VERSION}",`,
      `  "session_id": "${session.id}",`,
      `  "analysis_date": "<YYYY-MM-DD>",`,
      `  "mtn_role": "PRELIMINARY_SCREEN",`,
      `  "committee_role": "DECISION_INFLUENCING_REVIEW",`,
      `  "final_decision_impact": "LOW | MEDIUM | HIGH",`,
      `  "committee_consensus": {`,
      `    "top3_tickers": ["...", "...", "..."],`,
      `    "mtn_alignment": "CONFIRMS | PARTIAL_RERANK | SIGNIFICANT_RERANK",`,
      `    "regime_label": "<current market regime in Korean>",`,
      `    "override_reason": "<required if committee rank differs from MTN, otherwise null>"`,
      `  },`,
      `  "candidates": [`,
      `    {`,
      `      "ticker": "...",`,
      `      "name": "<company name or null>",`,
      `      "mtn_rank": <int>,`,
      `      "ib_rank": <int>,`,
      `      "ib_verdict": "STRONG_BUY | BUY | HOLD | SELL | STRONG_SELL",`,
      `      "price_target_12m": "Est. XXX or null",`,
      `      "eps_growth_estimate": "Est. +XX% or null",`,
      `      "revenue_growth_estimate": "Est. +XX% or null",`,
      `      "moat_assessment": "WIDE | NARROW | NONE | UNKNOWN",`,
      `      "mtn_alignment": "CONFIRMS | UPGRADES | DOWNGRADES",`,
      `      "final_decision_impact": "LOW | MEDIUM | HIGH",`,
      `      "override_reason": "<required if this view differs from MTN, otherwise null>"`,
      `    }`,
      `  ]`,
      `}`,
      '```',
      '',
    ] : []),
    '# Investment Committee Memorandum',
    `**Universe**: ${session.universe} · **Market**: ${session.market} · **Date**: <YYYY-MM-DD>`,
    `**Coverage**: ${tickerList}`,
    '',
    '## 1. Executive Summary',
    '4~6문장. 시장 국면, 위원회 최종 Top 3, MTN 순위와의 차이, 최종 매매 계획에 미치는 영향을 요약하십시오.',
    '',
    '## 2. Market Regime & Portfolio Implication',
    '2문단 이내. 현재 시장 상태, 리스크 온/오프, 섹터/스타일 로테이션, 포지션 사이징 관점을 연결하십시오.',
    '',
    '## 3. Top Picks',
    '각 Top Pick은 아래 형식으로 220~320단어 안에서 작성하십시오.',
    '### Pick #1 - <TICKER> (<Company Name>)',
    '> **IB Verdict**: <...> · **12M Target**: <...> · **EPS FY+1**: <...> · **Moat**: <...>',
    '**Thesis**: 왜 지금 이 종목인지, 시장이 아직 덜 반영한 요소가 무엇인지 설명하십시오.',
    '**Drivers & Catalysts**: 향후 3개월 촉매와 펀더멘털 동인을 bullets 2~3개로 정리하십시오.',
    '**Risk & Execution**: 핵심 리스크, 무효화 조건, 진입/분할 관점을 간결히 쓰십시오.',
    '**MTN Cross-Check**: MTN 점수와 위원회 판단이 확인/상향/하향되는 이유를 명시하십시오.',
    '',
    '### Pick #2 - <TICKER> (<Company Name>)',
    '동일 형식.',
    '',
    '### Pick #3 - <TICKER> (<Company Name>)',
    '동일 형식.',
    '',
    '## 4. Remaining Candidates',
    '| Ticker | Company | IB Rank | Verdict | MTN Alignment | Decision Impact | One-line Rationale |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '',
    '## 5. Final Committee Decision',
    '2문단 이내. 최종 포트폴리오 행동, 우선순위, 보류/제외 후보를 정리하십시오.',
    '',
    '## 6. Data Caveat',
    '짧게. 이 리포트는 MTN Rule Engine과 외부 LLM 기반 2차 검토이며 투자 책임은 사용자에게 있음을 명시하십시오.',
    '',
    '# Writing Rules',
    '- 전체 markdown report는 1,200~1,800단어 안에서 끝내십시오. 절대 중간에 끊기지 않게 결론까지 작성하십시오.',
    '- 모든 Top Pick 표기에는 ticker와 company name을 함께 쓰십시오.',
    '- 장식적인 수사보다 PM이 실행할 수 있는 판단, 촉매, 리스크, sizing implication을 우선하십시오.',
    '- 추정치는 반드시 Est.로 표시하고, 근거가 약하면 UNKNOWN/null로 두십시오.',
    '- JSON metadata 이외의 JSON/code fence를 추가하지 마십시오.',
  ].join('\n');
}
