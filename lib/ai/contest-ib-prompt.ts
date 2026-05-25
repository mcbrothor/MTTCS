import type { BeautyContestSession, ContestCandidate, MasterFilterResponse } from '@/types';
import { MAX_CONTEST_CANDIDATES } from '../contest-sources.ts';

export const IB_PROMPT_VERSION = 'mtn-ib-committee-v4-final-judgment';
export const IB_RESPONSE_SCHEMA_VERSION = 'mtn-ib-committee-markdown-v3';

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
실질적인 투자 판단은 IB Investment Committee의 독립적 최종 판단입니다.

MTN의 한계:
(L-1) SEPA/VCP는 가격과 패턴 중심이며 EPS 컨센서스, 가이던스, 백로그, 매출 mix를 자동 반영하지 않습니다.
(L-2) RS는 universe-relative proxy이며 IBD Official RS Rating이 아닙니다.
(L-3) Moat, 경쟁우위, 회계 품질, 이벤트 캘린더, 정책/규제 리스크는 별도 판단이 필요합니다.
(L-4) MTN 점수와 충돌하더라도, 위원회가 더 강한 펀더멘털/리스크 근거를 발견하면 위원회 판단을 우선하십시오.
`.trim();

const DECISION_HIERARCHY = `
[DECISION HIERARCHY - MTN은 1차 분석, IB 위원회가 실질 투자 판단]

MTN Rule Engine의 순위, 점수, 추천, confidence는 최종 투자 결정이 아닙니다.
위원회는 MTN 결과를 참고 자료로만 사용하고, 아래 6인의 전설적인 실존 투자 거장들로 구성된 위원회의 다각도 검토와 치열한 난상토론(Consensus)을 통해 최종 실질 투자 판단을 내려야 합니다. 각 위원은 철저히 자신의 역사적 실제 투자 철학에 입각해 의견을 제시합니다:

1. 수석 기술 분석가: 마크 미너비니 (Mark Minervini)
   - 투자 철학 및 검토 잣대: SEPA/VCP 전략의 정통성, 변동성 수축 단계(Contraction Steps)와 정밀도, 유효 피벗 돌파 영역 진입 여부, 거래량 격감(VDU) 및 Pocket Pivot 매집 흔적 검증.
2. 성장주 리서치 헤드: 윌리엄 오닐 (William O'Neil)
   - 투자 철학 및 검토 잣대: CANSLIM 정량 조건 만족도(C/A/N/S/L/I/M), 분기 및 연간 주당순이익(EPS) 및 매출 가속화(25%+), 업계 내 최고의 주도주(L) 여부, 기관의 강력한 수급 및 후원(Sponsorship).
3. 가치 및 경쟁우위 책임자: 워렌 버핏 (Warren Buffett)
   - 투자 철학 및 검토 잣대: 넓고 깊은 독점적 경제적 해자(Wide Moat), 높은 자본 효율성(ROE 17%+, ROIC), 비즈니스의 지속 가능성 및 회계 투명성, 밸류에이션 대비 안전 마진(Margin of Safety).
4. 글로벌 거시 및 유동성 전략가: 스탠리 드러켄밀러 (Stanley Druckenmiller)
   - 투자 철학 및 검토 잣대: 탑다운 글로벌 거시경제 환경(Macro Regime), 통화 정책 및 시장 유동성 순풍 여부, 향후 3개월 핵심 실적 촉매(Catalyst) 존재 여부, 기관들의 지속적인 대량 매수 흐름.
5. 집중 투자 및 행동주의 PM: 빌 애크먼 (Bill Ackman)
   - 투자 철학 및 검토 잣대: 단순하고 고도로 예측 가능하며 잉여 현금 흐름(Free Cash Flow)이 강력한 비즈니스, 주주 우대 정책(자사주 매입, 배당 등), 집중 포트폴리오(단 10~15종목)에 편입할 가치가 있는 탁월한 퀄리티.
6. 최고 포트폴리오 리스크 관리자: 폴 튜더 존스 (Paul Tudor Jones)
   - 투자 철학 및 검토 잣대: 200일선 기반의 장기 추세 무결성(200MA Veto - 200일선 하향 종목은 즉시 아웃), 일평균 거래 대금 기반의 슬리피지/유동성 리스크 통제, 명확한 손절가(Stop Loss) 버퍼 설계, 포트폴리오 전체 하방 변동성 차단.

반드시 수행할 것:
1. MTN 순위와 IB 위원회 최종 순위가 일치하는지 명시하십시오.
2. 다르면 upgrade/downgrade/rerank 이유를 구체적으로 설명하십시오.
3. 각 후보의 final_decision_impact를 LOW / MEDIUM / HIGH로 분류하십시오.
4. 최종 순위를 조율하는 과정에서 위 6인의 거장들 간에 발생했던 치열한 철학적 관점의 충돌, 난상토론, 그리고 최종 타협(Consensus) 과정을 보고서 Rationale에 생생하게 서술하십시오.
5. 보고서는 실제 포트폴리오 매니저가 바로 실행 여부를 판단할 수 있는 Investment Committee Memo 톤으로 작성하십시오.
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
    screener_source: snap.screener_source,
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
    canslim: snap.canslim,
  };
}

function sessionScreenerSource(session: BeautyContestSession, candidates: ContestCandidate[]) {
  const fromPayload = (session.prompt_payload || []).find((candidate) => candidate?.screener_source)?.screener_source;
  if (fromPayload === 'canslim' || fromPayload === 'minervini') return fromPayload;
  const fromSnapshot = candidates
    .map((candidate) => (candidate.snapshot || {}) as Record<string, unknown>)
    .find((snap) => snap.screener_source === 'canslim' || snap.screener_source === 'minervini')?.screener_source;
  return fromSnapshot === 'canslim' ? 'canslim' : 'minervini';
}

function screenerCommitteeMandate(source: 'minervini' | 'canslim') {
  if (source === 'canslim') {
    return [
      "[O'NEIL CANSLIM COMMITTEE MANDATE]",
      "The O'Neil scanner is a first-pass CANSLIM filter. The IB committee must make the final investment judgment.",
      'Primary diligence lens: C/A/N/S/L/I/M evidence quality, earnings and sales acceleration, new-high or new-catalyst validity, supply-demand sponsorship, market direction, and whether the base/pivot creates executable risk/reward.',
      'Do not over-weight VCP score when CANSLIM pillar evidence is incomplete. VCP/base quality is execution confirmation, not the thesis itself.',
      'Explicitly call out which CANSLIM pillar changes the committee view versus the first-pass screen.',
    ].join('\n');
  }
  return [
    '[MINERVINI SEPA/VCP COMMITTEE MANDATE]',
    'The Minervini scanner is a first-pass SEPA/VCP filter. The IB committee must make the final investment judgment.',
    'Primary diligence lens: trend template, VCP contraction quality, valid pivot, RS leadership, volume dry-up, liquidity, high-tight-flag exceptions, and whether fundamentals support institutional sponsorship.',
    'Do not accept a recent-high fallback as a buy point. If the pivot is not valid, classify the idea as watch/research unless fundamentals and leadership justify an explicit committee override.',
    'Explicitly call out whether the committee confirms, upgrades, downgrades, or reranks the first-pass Minervini result.',
  ].join('\n');
}

function candidatePayload(candidates: ContestCandidate[], includeJsonMetadata: boolean) {
  const allRanked = [...candidates].sort((a, b) => (a.llm_rank ?? 99) - (b.llm_rank ?? 99));
  const ranked = includeJsonMetadata ? allRanked.slice(0, MAX_CONTEST_CANDIDATES) : allRanked;

  return ranked.map((candidate) => {
    const snapshot = compactSnapshot((candidate.snapshot ?? {}) as Record<string, unknown>);
    const scores = extractScores(candidate);
    const analysis = extractAnalysis(candidate);
    const scoreTotal = scores.vcp + scores.rs + scores.sepa + scores.momentum + scores.technical;

    return {
      ticker: candidate.ticker,
      name: candidate.name,
      exchange: candidate.exchange,
      screener_source: snapshot.screener_source ?? null,
      mtn_rank: candidate.llm_rank,
      score_total: Math.round(scoreTotal * 10) / 10,
      score_breakdown: scores,
      mtn_key_strength: analysis.key_strength ?? null,
      mtn_key_risk: analysis.key_risk ?? null,
      mtn_recommendation: analysis.recommendation ?? null,
      mtn_confidence: analysis.confidence ?? null,
      technical_data: snapshot,
      canslim_data: snapshot.canslim ?? null,
    };
  });
}

export function buildIbValidationPrompt(
  session: BeautyContestSession,
  candidates: ContestCandidate[],
  marketContext?: MasterFilterResponse | null,
  includeJsonMetadata: boolean = true
): string {
  const screenerSource = sessionScreenerSource(session, candidates);
  const ranked = candidatePayload(candidates, includeJsonMetadata);
  const marketBlock = marketContext ? {
    state: marketContext.state,
    p3Score: marketContext.metrics?.p3Score ?? null,
    insightLog: marketContext.insightLog ?? null,
  } : null;

  const dataPayload = JSON.stringify({
    decision_context: {
      screener_source: screenerSource,
      mtn_role: 'PRELIMINARY_SCREEN',
      committee_role: 'FINAL_INVESTMENT_JUDGMENT',
      final_decision_note: 'MTN 정량 결과는 1차 후보 선별입니다. 실질적인 투자 판단과 최종 우선순위는 IB 투자위원회의 독립 판단을 우선합니다.',
    },
    universe: session.universe,
    market: session.market,
    selected_at: session.selected_at,
    market_context: marketBlock,
    mtn_ranked_candidates: ranked,
  }, null, 2);

  const tickerList = ranked
    .map((candidate) => `${candidate.ticker}${candidate.name ? ` (${candidate.name})` : ''}`)
    .join(', ');

  return [
    SYSTEM_LIMITATION_DISCLOSURE,
    '',
    DECISION_HIERARCHY,
    '',
    screenerCommitteeMandate(screenerSource),
    '',
    '# Role',
    '당신은 글로벌 투자은행의 Investment Committee 서기 겸 수석 애널리스트입니다.',
    'MTN은 1차 정량 스크리너일 뿐이며, 당신의 임무는 IB 위원회의 실질적인 투자 판단을 문서화하는 것입니다.',
    '한국어로 작성하되 ticker, rating, target, EPS, moat 같은 금융 용어와 숫자는 원문 표기를 유지하십시오.',
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
      ? '응답은 반드시 두 파트로 명확하게 분리해서 작성하십시오. 먼저 [PART 1: JSON METADATA] 구분자 아래에 JSON 데이터를 넣고, 그 다음 [PART 2: MARKDOWN REPORT] 구분자 아래에 Markdown 리포트를 작성하십시오.'
      : '아래 구조의 markdown report만 작성하십시오. JSON metadata는 출력하지 마십시오.',
    '',
    ...(includeJsonMetadata ? [
      '[PART 1: JSON METADATA]',
      '```json',
      `{`,
      `  "schema_version": "${IB_RESPONSE_SCHEMA_VERSION}",`,
      `  "session_id": "${session.id}",`,
      `  "analysis_date": "<YYYY-MM-DD>",`,
      `  "mtn_role": "PRELIMINARY_SCREEN",`,
      `  "committee_role": "FINAL_INVESTMENT_JUDGMENT",`,
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
      '[PART 2: MARKDOWN REPORT]',
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
    '## 3. Committee Ranking Rationale',
    'MTN 1차 순위와 IB 위원회 최종 순위가 어떻게 달라졌는지 표 또는 짧은 문단으로 설명하십시오. 순위 변경의 배경이 되는 6인의 전설적인 거장(미너비니, 오닐, 버핏, 드러켄밀러, 애크먼, 존스)의 실제 투자 철학에 기반한 핵심 쟁점 대립(예: 버핏의 안전마진 만류 vs 드러켄밀러의 매크로 순풍 옹호 등)과 최종 합의 사유를 금융 공학적 근거와 함께 서술하십시오.',
    '',
    '## 4. Top Picks',
    '각 Top Pick은 아래 형식으로 300~450단어 안에서 상세하게 작성하십시오.',
    '### Pick #1 - <TICKER> (<Company Name>)',
    '> **IB Verdict**: <...> · **12M Target**: <...> · **EPS FY+1**: <...> · **Moat**: <...>',
    '**Thesis**: 왜 지금 이 종목인지, 시장이 아직 덜 반영한 요소가 무엇인지 설명하십시오.',
    '**Committee Perspective Details (전설적인 6인의 심층 검토 상세)**:',
    '- **마크 미너비니의 기술적 관점 (Technical Lead)**: SEPA/VCP 템플릿 정형성, 수축 상태, 피벗 가격 대비 현재 이격 윈도우 적격성, VDU 및 Pocket Pivot 흔적 분석.',
    '- **윌리엄 오닐의 성장주 관점 (Growth Equity Head)**: CANSLIM 요건 충족 상태, 분기/연간 EPS 및 매출액 가속성(25%+), 업계 내 독점적 주도 지위(L) 및 기관 후원(Sponsorship).',
    '- **워렌 버핏의 가치/Moat 관점 (Value & Moat Head)**: 지속가능한 넓은 경제적 해자(Moat)의 깊이, 자본 효율성(ROE 17%+/ROIC), 밸류에이션 대비 안전 마진(Safety Margin).',
    '- **스탠리 드러켄밀러의 매크로/유동성 관점 (Macro Strategist)**: 현 매크로 레짐(Macro Regime)과의 결합 순풍 여부, 향후 3개월 내 핵심 실적 촉매(Catalyst) 존재 여부, 기관 수급의 지속성.',
    '- **빌 애크먼의 집중투자/현금흐름 관점 (Concentrated PM)**: 비즈니스의 예측 가능한 강력한 잉여 현금 흐름(Free Cash Flow) 및 자본 배분 효율(자사주 매입 등), 집중 포트폴리오 적격성.',
    '- **폴 튜더 존스의 리스크/Sizing 관점 (Chief Risk Officer)**: 200일선 장기 추세 무결성(200MA Veto), 일평균 거래 대금 기반 유동성 리스크 통제, 현실적 손절가(Stop Loss) 및 Sizing 가이드라인.',
    '**Drivers & Catalysts**: 향후 3개월 촉매와 펀더멘털 동인을 bullets 2~3개로 정리하십시오.',
    '**Risk & Execution**: 핵심 리스크, 무효화 조건, 진입/분할 관점을 간결히 쓰십시오.',
    '**MTN Cross-Check**: MTN 결과를 위원회가 확인/상향/하향/재순위화한 이유를 명시하십시오.',
    '',
    '### Pick #2 - <TICKER> (<Company Name>)',
    '동일 형식 (미너비니, 오닐, 버핏, 드러켄밀러, 애크먼, 존스의 6인 개별 관점 포함).',
    '',
    '### Pick #3 - <TICKER> (<Company Name>)',
    '동일 형식 (미너비니, 오닐, 버핏, 드러켄밀러, 애크먼, 존스의 6인 개별 관점 포함).',
    '',
    '## 5. Remaining Candidates',
    '| Ticker | Company | IB Rank | Verdict | MTN Alignment | Decision Impact | One-line Rationale |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '',
    '## 6. Final Committee Decision',
    '2문단 이내. 최종 포트폴리오 행동, 우선순위, 보류/제외 후보를 정리하십시오. 이 섹션은 MTN이 아니라 IB 위원회의 최종 판단이어야 합니다.',
    '',
    '## 7. Data Caveat',
    '짧게. MTN은 1차 정량 스크리너이고, 본 메모는 IB 위원회 판단을 구조화한 투자 검토 자료이며 투자 책임은 사용자에게 있음을 명시하십시오.',
    '',
    '# Writing Rules',
    '- 전체 markdown report는 1,200~1,800단어 안에서 끝내십시오. 절대 중간에 끊기지 않게 결론까지 작성하십시오.',
    '- 모든 Top Pick 표기에는 ticker와 company name을 함께 쓰십시오.',
    '- 장식적인 수사보다 PM이 실행할 수 있는 판단, 촉매, 리스크, sizing implication을 우선하십시오.',
    '- 추정치는 반드시 Est.로 표시하고, 근거가 약하면 UNKNOWN/null로 두십시오.',
    '- JSON metadata 이외의 JSON/code fence를 추가하지 마십시오.',
  ].join('\n');
}
