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
[SYSTEM-LIMITATION DISCLOSURE - 기관 투자 의견 수렴 시 필수 반영]

MTN 정량 점수(VCP, RS, SEPA, Momentum, Technical Quality)는 1차 후보 선별을 위한 기초 계량 필터(Quantitative Screen)입니다.
실질적인 자금 집행을 위한 최종 의사결정은 IB Investment Committee의 거시적·미시적 심층 독립 분석을 거쳐야 합니다.

MTN 알고리즘의 한계와 위원회 보완점:
(L-1) SEPA/VCP는 가격 패턴 및 모멘텀 중심이며, 분기 실적 가이던스, 수주 잔고(Backlog), 매출 다변화(Segment Mix), 연구개발(R&D) 효율성 등 재무제표 심층 항목을 반영하지 못합니다.
(L-2) Relative Strength(RS)는 전체 시장 대비 단순 가격 성과의 상대 지표일 뿐, 해당 기업의 내재적 펀더멘털 해자나 규제 리스크를 반영하지 않습니다.
(L-3) 독점적 해자의 존속 기간(Moat Longevity), 지배구조(Governance), 회계 투명성(Accounting Quality), 연간 설비투자(CapEx) 회수 기간 등은 공시 자료(DART/SEC 10-K, 10-Q)를 통한 수동 검증이 필수적입니다.
(L-4) 정량적 MTN 점수와 충돌하더라도, 위원회가 더 강력한 근본적 펀더멘털 및 매크로 리스크 근거를 확보한 경우 위원회의 정성적 최종 판단을 우선합니다.
`.trim();

const DECISION_HIERARCHY = `
[DECISION HIERARCHY - MTN QUANT SCREEN VS. IB INVESTMENT COMMITTEE]

MTN의 기계적 순위 및 추천 등급은 최종 포트폴리오 편입 결정이 아닌 '1차 딜 플로우 스크리닝(First-pass Deal Flow Screening)'입니다.
투자위원회는 아래의 전설적인 6인의 실존 투자 거장의 투자 철학과 프레임워크를 기반으로 고도의 논쟁과 치열한 난상토론(Debate & Consensus)을 전개하고, 이를 거쳐 최종 실질 투자 판단(Strong Buy, Buy, Hold, Sell)과 포지션 사이징(Sizing)을 결정합니다.

각 위원은 본인의 역사적 실제 투자 철학에 입각해 가장 냉철하고 엄격한 심사 잣대를 제시합니다:

1. 수석 기술 분석가: 마크 미너비니 (Mark Minervini)
   - 투자 프레임워크: SEPA/VCP(변동성 수축 패턴)의 정형성과 완결성 검증.
   - 핵심 심사 기준: 변동성 수축 단계(VCP Contraction Stages: e.g., 4T -> 2T -> 1T)의 완벽성, Pivot 돌파 시점의 이격 마진, 거래량 격감(Volume Dry-Up, VDU) 및 매집(Pocket Pivot) 징후 포착 여부. 거래량이 마르지 않았거나 Pivot 영역을 크게 이격하여 추격 매수해야 하는 구간은 철저히 배제.

2. 성장주 리서치 헤드: 윌리엄 오닐 (William O'Neil)
   - 투자 프레임워크: CANSLIM 계량 및 수급 펀더멘털 심사.
   - 핵심 심사 기준: 분기 및 연간 주당순이익(EPS) 및 매출액 성장률 가속화 여부(25%+ 및 직전 분기 대비 가속화 필수), 독점적 신제품/서비스(N) 존재 여부, 산업군 내 주도 지위(Leader vs. Laggard), 기관 투자자들의 순매수 유동성 유입 및 후원(Sponsorship) 추세. RS Line이 신고가 부근에 위치하고 있는가?

3. 가치 및 경쟁우위 책임자: 워렌 버핏 (Warren Buffett)
   - 투자 프레임워크: 경제적 해자(Economic Moat) 및 자본 배분 효율성 평가.
   - 핵심 심사 기준: 높은 전환 비용(Switching Costs), 브랜드 로열티, 네트워크 효과 또는 강력한 비용 우위 등으로 무장한 지속 가능한 넓은 해자(Wide Moat)의 존재 여부. 자기자본이익률(ROE 17%+) 및 투하자본이익률(ROIC)의 다년도 지속 가능성, 경영진의 현명한 주주 이익 환원력, 내재 가치 대비 안전 마진(Margin of Safety) 확보 여부.

4. 글로벌 거시 및 유동성 전략가: 스탠리 드러켄밀러 (Stanley Druckenmiller)
   - 투자 프레임워크: 탑다운 매크로 레짐(Macro Regime) 분석 및 수급 카탈리스트.
   - 핵심 심사 기준: 글로벌 중앙은행의 유동성 통화정책 순풍 여부, 금리 및 인플레이션 환경 하에서의 산업별 수혜 여부. 향후 3개월 이내에 시장 컨센서스를 대폭 상회할 확실한 실적 촉매(Earnings Catalyst)나 대형 계약/수주/제품 출시 이벤트의 존재 여부. 기관 투자자들의 강한 장기 매수 주도성.

5. 집중 투자 및 행동주의 PM: 빌 애크먼 (Bill Ackman)
   - 투자 프레임워크: 단순하고 예측 가능하며 잉여현금흐름(FCF)이 뛰어난 독과점 비즈니스 심사.
   - 핵심 심사 기준: 사업 구조의 심플함 및 높은 미래 현금 흐름의 예측 가능성, 강력한 FCF Yield 및 이에 기반한 적극적인 자사주 매입(Share Buybacks)이나 부채 감축 등의 효율적인 자본 배분. 10~15종목 내외의 초집중 포트폴리오에 영구 편입할 가치가 있는 견고한 비즈니스 퀄리티인가?

6. 최고 포트폴리오 리스크 관리자: 폴 튜더 존스 (Paul Tudor Jones)
   - 투자 프레임워크: 절대 추세 무결성(200MA Veto) 및 자금 관리/손절 한도 설계.
   - 핵심 심사 기준: 200일 이동평균선(200MA)의 장기 우상향 추세 무결성 검증 (※ 200일선 하향 종목이거나 200일선 아래에 위치한 종목은 위원회 최종 등급 무조건 STRONG_SELL 또는 SELL로 제한하는 200MA Veto Rule 적용). 일평균 거래 대금 대비 슬리피지(Slippage) 한도, 명확하고 기계적인 손절선(Stop Loss Level) 설계 및 포지션 사이징 가이드라인 제시.

[COMMITTEE DEBATE MANDATE - 거장들 간의 철학적 대립과 Consensus]
보고서 작성 시 다음 사항을 최우선으로 준수하십시오:
1. **정량 vs 정성의 조화**: 단순히 수치만 나열하지 말고, 각 수치가 의미하는 사업적 깊이를 6인의 거장 간의 생생한 찬반 토론으로 전개하십시오.
2. **논리적 갈등과 합의**: 예컨대 "Minervini는 완벽한 VCP 돌파 진입점을 옹호하지만, Buffett는 안전마진 부족과 밸류에이션 부담을 제기하는 장면", 혹은 "O'Neil은 50% EPS 가속화를 극찬하는 반면, Tudor Jones는 200일선 이격 과도로 인한 하방 변동성 노출을 경고하고 Ackman은 FCF Yield가 검증되지 않았다며 집중 투자 편입에 반대하는 장면" 등 거장들 간의 실제 철학이 정면 충돌하는 쟁점과 이를 최종적으로 조율하여 합의에 도달한 금융 공학적 근거(Consensus Rationale)를 구체적으로 서술하십시오.
3. **공시 정보 분석**: DART 또는 SEC 10-K/10-Q 공시 자료에 기술된 주요 사업 부문별 매출 성과(Segment Revenue Shares), 설비투자(CapEx) 규모 및 수주잔고(Backlog) 등의 실질 공시 데이터를 Thesis 및 Catalysts의 논거로 명확히 연동하십시오.
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
      "The O'Neil scanner serves as an initial CANSLIM quant screen. The IB committee must perform the fundamental due diligence and overlay qualitative context.",
      "Evaluate key evidence across all seven CANSLIM pillars, verifying that current EPS growth acceleration, relative strength line quality, structural supply-demand dynamics, and institutional sponsorship support a long-term position.",
      "Bypass mechanical filters to identify where the quant scores understate institutional sponsorship or overstate cyclical earnings quality. Demand specific, verifiable DART/SEC fundamental backlogs.",
    ].join('\n');
  }
  return [
    "[MINERVINI SEPA/VCP COMMITTEE MANDATE]",
    "The Minervini scanner serves as an initial technical breakout screen. The IB committee must validate structural base quality and underlying corporate drivers.",
    "Verify the absolute validity of the VCP contraction stages and volume contraction (VDU). Ensure that recent consolidations do not mask secular growth deterioration.",
    "Analyze whether the technical breakout has institutional support (sponsorship) and fundamental drivers, rather than speculative retail-driven price momentum.",
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
      committee_role: 'AI_CIO_FINAL_JUDGMENT',
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
    '당신은 사용자(펀드매니저)의 전속 퀀트 및 펀더멘털 투자 전략을 총괄하는 "AI 수석 비서 겸 최고투자책임자(AI-CIO)"입니다.',
    '당신의 유일한 목표는 6대 거장(미너비니, 오닐, 버핏, 드러켄밀러, 애크먼, 존스)의 깐깐한 심사 기준을 모두 통합하여, 사용자님이 현업에서 즉시 자금을 집행(Execution)할 수 있도록 가장 실전적이고 명확한 "일일 행동 브리핑(Daily Actionable Briefing)"을 제공하는 것입니다.',
    '장황한 학술적 논쟁이나 불필요한 미사여구는 배제하십시오. "이 종목을 지금 사야 하는가? 피해야 하는가? 손절선은 어디인가?"에 대한 당신만의 단호한 결론을 내리십시오.',
    '본 리포트는 한국어 경어체(~습니다, ~하십시오)로 작성하되 ticker, rating, consensus, FCF yield, PEG, moat, catalyst, CapEx, top picks 등의 공식 금융 영단어 및 재무 지표는 영문 원어 표기를 엄격히 유지하십시오.',
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
      `  "committee_role": "AI_CIO_FINAL_JUDGMENT",`,
      `  "final_decision_impact": "LOW | MEDIUM | HIGH",`,
      `  "committee_consensus": {`,
      `    "top3_tickers": ["...", "...", "..."],`,
      `    "mtn_alignment": "CONFIRMS | PARTIAL_RERANK | SIGNIFICANT_RERANK",`,
      `    "regime_label": "<current market regime in Korean>",`,
      `    "override_reason": "<required if CIO rank differs from MTN, otherwise null>"` ,
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
      `      "override_reason": "<required if this view differs from MTN, otherwise null>"` ,
      `    }`,
      `  ]`,
      `}`,
      '```',
      '',
      '[PART 2: MARKDOWN REPORT]',
    ] : []),
    '# 📈 AI-CIO Daily Execution Briefing',
    `**Universe**: ${session.universe} · **Date**: <YYYY-MM-DD>`,
    '',
    '## 1. 💼 매니저님을 위한 핵심 요약 (Executive Summary)',
    '3~4문장으로 작성하십시오. "매니저님, 금일 시장은 [매크로 국면] 상태이며, 리스크 관리에 집중해야 할/공격적으로 비중을 늘려야 할 시점입니다."로 시작하여, 오늘 스크리닝된 종목 중 당장 자금을 투입해야 할 Top 3 종목과 그 이유를 직관적으로 요약하십시오.',
    '',
    '## 2. 🎯 AI-CIO 실전 편입 후보 (Top 3 Picks)',
    '매니저님이 즉각 매매 계획(Trading Plan)을 세울 수 있도록 Top 3 종목을 선정하고 아래 양식에 맞추어 단호하게 브리핑하십시오.',
    '',
    '### 🥇 Pick #1: <TICKER> (<Company Name>)',
    '> **투자의견**: [STRONG_BUY | BUY] · **12M 목표가**: Est. <$XX> · **Moat**: [WIDE | NARROW]',
    '',
    '- **📈 편입 사유 (Why Now?)**: 매니저님, 이 종목은 현재 [특정 촉매/실적/차트 패턴] 덕분에 비대칭적 수익비가 가장 높습니다. (거장들의 관점 요약)',
    '- **🔍 거장들의 팩트체크**: 미너비니의 VCP 돌파 관점, 오닐의 실적 가속도, 버핏의 경제적 해자, 애크먼의 FCF 관점을 2~3문장으로 간결하게 압축하여 이 종목이 왜 검증되었는지 팩트 위주로 보고하십시오.',
    '- **⚠️ 핵심 리스크 (Red Flag)**: [매크로 리스크 또는 기업 고유 리스크]',
    '- **✅ 실전 매매 전략 (Action Plan)**: 매니저님, [XX~XX] 구간에서 분할 매수를 권장하며, 만약 주가가 [XX (200일선 등)] 아래로 하향 이탈할 경우 즉각 전량 손절(Stop Loss) 하십시오.',
    '',
    '### 🥈 Pick #2: <TICKER> (<Company Name>)',
    '(Pick #1과 동일한 구조로 작성)',
    '',
    '### 🥉 Pick #3: <TICKER> (<Company Name>)',
    '(Pick #1과 동일한 구조로 작성)',
    '',
    '## 3. 🚫 즉각 배제 및 관망 대상 (Veto & Watchlist)',
    '| Ticker | Company Name | 판정 | AI-CIO 배제 사유 (한 줄 요약) |',
    '| --- | --- | --- | --- |',
    '위 표에 기재된 나머지 후보들에 대해서, 왜 지금 당장 자금을 투입하면 안 되는지(예: 200MA 하회, FCF 적자, 촉매 부재)를 매우 냉혹하게 한 줄로 보고하십시오.',
    '',
    '## 4. 🧭 최종 자금 집행 가이드 (Capital Allocation)',
    '2문단 이내. "결론적으로 매니저님, 금일 포트폴리오의 [X%]는 현금으로 유보하시고, [X%] 비중만 위 Top 3 종목에 정밀 타격(Precision Trading)하시길 권고합니다."와 같이 확실한 비중 조절 및 자금 관리 행동 지침을 제시하십시오.',
    '',
    '# Writing Rules',
    '- **현업 비서 어조 유지**: "매니저님"이라는 호칭을 사용하며, 실제 펀드매니저에게 아침 보고를 하듯 빠르고, 명확하고, 실용적(Actionable)으로 작성하십시오.',
    '- **분량 조절**: 바쁜 현업 상황을 고려하여 너무 장황하지 않게, 전체 1,000~1,500 단어 내외로 핵심만 짚어서 출력하십시오.',
    '- **단호함**: 애매모호한 양비론(좋을 수도 있고 나쁠 수도 있다)을 버리고, 투자 여부에 대한 확고한 주장을 펼치십시오.',
  ].join('\n');
}
