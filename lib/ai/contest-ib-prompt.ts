import type { BeautyContestSession, ContestCandidate, MasterFilterResponse } from '@/types';

export const IB_PROMPT_VERSION = 'mtn-ib-committee-v2-narrative';
export const IB_RESPONSE_SCHEMA_VERSION = 'mtn-ib-committee-markdown-v1';

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
[SYSTEM-LIMITATION DISCLOSURE - 반드시 평가에 반영하라]

MTN 정량 점수(VCP, RS, SEPA, Momentum, Technical Quality)는 다음 구조적 한계를 가진다.
이는 일부 데이터 결함이 아니라 정량 엔진의 의도된 범위(scope)이므로, 위원회는 외부 LLM 상세 평가에서 반드시 보강해야 한다.

(L-1) SEPA 점수는 가격 패턴 기반이다. EPS 컨센서스 리비전, 가이던스 톤, 백로그/매출 비율은 자동 반영되지 않는다.
(L-2) RS는 universe-relative proxy이며 IBD Official RS Rating이 아니다.
(L-3) Moat / 경쟁우위 자동 평가가 없다.
(L-4) 회계 품질과 earnings quality 점수(Beneish, Altman, Piotroski)가 없다.
(L-5) 향후 30일 이벤트 리스크 캘린더가 없다.
(L-6) Fama-French/Barra 팩터 노출도와 momentum vs mean-reversion regime classifier가 없다.
(L-7) 테마 / 매크로 클러스터 집중도 자동 경고가 제한적이다.
(L-8) 외부 LLM 판단은 최종 투자 계획에 중대한 영향을 주는 상세 평가 레이어다. MTN 점수와 충돌하면 위원회 판단의 근거와 최종 채택 기준을 명시하라.
`.trim();

const DECISION_HIERARCHY = `
[DECISION HIERARCHY - MTN은 1차 평가, 외부 LLM은 상세 투자 판단 레이어]

MTN Rule Engine의 순위, 점수, 추천, confidence는 최종 투자 결정이 아니라
후보를 걸러내기 위한 1차 정량 평가(preliminary quantitative screen)다.

위원회는 MTN 결과를 존중하되 그대로 승인하지 말고, 펀더멘털·이벤트 리스크·
회계 품질·경쟁우위·테마 집중·집행 가능성을 독립적으로 검토해야 한다.

최종 투자 계획 결정에는 위원회의 상세 평가가 중대한 영향을 미친다.
따라서 위원회는 다음을 반드시 수행하라.

1. MTN 순위와 자신의 최종 순위가 일치하는지 명시하라.
2. 일치하지 않으면 upgrade/downgrade/rerank 사유를 구체적으로 설명하라.
3. MTN 점수는 높지만 외부 검토상 투자 부적합한 후보를 명시적으로 걸러내라.
4. MTN 점수는 낮지만 외부 검토상 투자 가치가 있는 후보가 있으면 근거를 제시하라.
5. 최종 투자 계획에 대한 위원회 판단 영향도를 LOW / MEDIUM / HIGH로 표시하라.
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
    exception_signals: snap.exception_signals,
  };
}

export function buildIbValidationPrompt(
  session: BeautyContestSession,
  candidates: ContestCandidate[],
  marketContext?: MasterFilterResponse | null,
): string {
  const ranked = [...candidates].sort(
    (a, b) => (a.llm_rank ?? 99) - (b.llm_rank ?? 99),
  );

  const candidateBlock = ranked.map((c) => {
    const snap = compactSnapshot((c.snapshot ?? {}) as Record<string, unknown>);
    const scores = extractScores(c);
    const analysis = extractAnalysis(c);
    const totalScore = scores.vcp + scores.rs + scores.sepa + scores.momentum + scores.technical;
    return {
      ticker: c.ticker,
      name: c.name,
      mtn_rank: c.llm_rank,
      score_total: Math.round(totalScore * 10) / 10,
      score_breakdown: scores,
      mtn_key_strength: analysis.key_strength ?? null,
      mtn_key_risk: analysis.key_risk ?? null,
      mtn_recommendation: analysis.recommendation ?? null,
      mtn_confidence: analysis.confidence ?? null,
      technical_data: snap,
    };
  });

  const marketBlock = marketContext ? {
    state: marketContext.state,
    p3Score: marketContext.metrics?.p3Score ?? null,
    insightLog: marketContext.insightLog ?? null,
  } : null;

  const dataPayload = JSON.stringify({
    decision_context: {
      mtn_role: 'PRELIMINARY_SCREEN',
      committee_role: 'DECISION_INFLUENCING_REVIEW',
      final_decision_note: 'MTN 정량 결과는 1차 후보 선별이며, 외부 LLM 상세 평가는 최종 투자 계획 결정에 중대한 영향을 준다.',
    },
    universe: session.universe,
    market: session.market,
    selected_at: session.selected_at,
    market_context: marketBlock,
    mtn_ranked_candidates: candidateBlock,
  }, null, 2);

  const tickerList = ranked.map(c => c.ticker).join(', ');

  return [
    SYSTEM_LIMITATION_DISCLOSURE,
    ``,
    DECISION_HIERARCHY,
    ``,
    `# 역할 (Role)`,
    ``,
    `당신은 **Goldman Sachs · Morgan Stanley 수준의 글로벌 IB(Investment Bank) 투자 심의 위원회(Investment Committee)** 입니다.`,
    `오늘 위원회는 MTN 내부 정량 시스템이 1차 선별한 후보 종목군에 대해 펀더멘털·매크로·집행·리스크 측면의 독립 검증을 수행하고, 투자 계획 결정에 중대한 영향을 주는 **공식 위원회 리포트(Investment Committee Memorandum)** 를 작성합니다.`,
    ``,
    `리포트는 실제 IB의 시니어 PM, 연기금/패밀리오피스의 투자위원회 의사결정자에게 전달되는 수준이어야 하며, 다음 요건을 충족해야 합니다:`,
    ``,
    `- 단순 점수표·체크리스트가 아닌 **서술형 분석 내러티브** 중심`,
    `- 각 종목에 대해 **투자 논거(Investment Thesis), 펀더멘털 드라이버, 촉매(Catalysts), 리스크, 밸류에이션 시각, 집행 전략**을 모두 포괄`,
    `- 위원 5인이 각자의 전문 영역에서 **다른 관점**을 제시하고, 그 의견들이 별첨에 명시적으로 기록되어야 함`,
    `- 모든 narrative는 **한국어**, 정량 수치는 그대로(영문/숫자)`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `## 위원회 구성 (Investment Committee Members)`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `**① David Kim, CFA** — Head of Portfolio Construction`,
    `   포지션 사이징, 상대가치, 섹터·팩터 집중 리스크, 포트폴리오 내 자리매김`,
    ``,
    `**② Sarah Chen** — Senior Equity Research Analyst`,
    `   EPS/매출 컨센서스 추정, 경쟁 해자(Economic Moat), 산업 구조, 기업 펀더멘털`,
    ``,
    `**③ Alex Novak, Ph.D.** — Head of Quantitative Strategies`,
    `   MTN 정량 결과 독립 검증, 팩터 노출도(Value/Growth/Quality/Momentum), 통계적 유의성`,
    ``,
    `**④ Michael Torres** — Chief Risk Officer`,
    `   하방 시나리오, 손절 규율, 테일 리스크, 정량이 포착 못한 회계·거버넌스·정치 리스크`,
    ``,
    `**⑤ James Liu** — Head of Trading & Execution`,
    `   유동성·슬리피지, 진입·분할 전략, 섹터 로테이션 타이밍, 실제 집행 가능성`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `## 입력 데이터 (Input Data)`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `MTN Rule Engine 채점 기준: VCP 품질(25) + RS 리더십(25) + SEPA 충족률(20) + 모멘텀(15) + 기술 구조(15) = 100점`,
    ``,
    '```json',
    dataPayload,
    '```',
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `## 출력 형식 (Output Format) — 반드시 준수`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `출력은 정확히 다음 두 부분으로 구성합니다:`,
    ``,
    `**Part 1.** 응답 첫 줄부터 \`\`\`json 펜스로 시작하는 메타데이터 블록 (UI 렌더링용)`,
    `**Part 2.** 그 다음에 마크다운으로 작성한 **공식 IB 위원회 리포트 본문**`,
    ``,
    `절대 금지: 메타데이터 블록 외의 JSON 출력, 코드펜스 안에 리포트 본문 넣기, 영문 전체 작성, 짧은 요약만 작성.`,
    ``,
    `### Part 1 — 메타데이터 블록 (필수, 정확히 이 스키마)`,
    ``,
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
    `    "regime_label": "<현재 시장 국면 한 줄>",`,
    `    "override_reason": "<MTN 결과와 다르면 필수. 같으면 null>"`,
    `  },`,
    `  "candidates": [`,
    `    {`,
    `      "ticker": "...",`,
    `      "mtn_rank": <int>,`,
    `      "ib_rank": <int>,`,
    `      "ib_verdict": "STRONG_BUY | BUY | HOLD | SELL | STRONG_SELL",`,
    `      "price_target_12m": "$XXX or null",`,
    `      "eps_growth_estimate": "+XX% or null",`,
    `      "revenue_growth_estimate": "+XX% or null",`,
    `      "moat_assessment": "WIDE | NARROW | NONE | UNKNOWN",`,
    `      "mtn_alignment": "CONFIRMS | UPGRADES | DOWNGRADES",`,
    `      "final_decision_impact": "LOW | MEDIUM | HIGH",`,
    `      "override_reason": "<MTN 순위/추천과 다르면 필수. 같으면 null>"`,
    `    }`,
    `    // … 입력된 모든 후보 (${ranked.length}개) 포함`,
    `  ]`,
    `}`,
    '```',
    ``,
    `### Part 2 — 마크다운 위원회 리포트 본문 (필수 구조)`,
    ``,
    `메타데이터 블록을 닫은 직후 빈 줄 한 줄 두고 아래 구조의 마크다운 리포트를 작성하세요. 각 섹션은 IB 시니어 애널리스트가 작성한 수준의 깊이와 분량으로:`,
    ``,
    '```',
    `# Investment Committee Memorandum`,
    `**Universe**: ${session.universe} · **Market**: ${session.market} · **Date**: <YYYY-MM-DD>`,
    `**Committee**: D. Kim (PM) · S. Chen (Research) · A. Novak (Quant) · M. Torres (Risk) · J. Liu (Execution)`,
    `**Coverage**: ${tickerList}`,
    ``,
    `---`,
    ``,
    `## I. Executive Summary`,
    ``,
    `(4~6문장. 위원회의 종합 결론, 시장 국면 진단, MTN 순위와의 정합성 또는 재조정 사유, 최우선 Top 3 및 그 핵심 근거.)`,
    ``,
    `## II. Market Regime & Macro Overlay`,
    ``,
    `(2~3 문단. 현재 시장 국면(추세/조정/리스크 온오프), 금리·달러·실적 시즌·매크로 이벤트가 후보 종목군에 미치는 함의. MTN의 시장 상태 시그널과 IB 위원회의 거시 판단을 비교.)`,
    ``,
    `## III. Top Picks — In-Depth Analysis`,
    ``,
    `### Pick #1 — <TICKER> (<회사명>)`,
    ``,
    `> **IB Verdict**: <STRONG_BUY/BUY> · **12M Target**: <$XXX> · **EPS Growth FY+1**: <+XX%> · **Moat**: <WIDE/NARROW>`,
    ``,
    `**Investment Thesis** — (3~5문장의 서술형 논거. 왜 지금 이 종목인가, 시장이 아직 가격에 반영하지 않은 무엇을 위원회가 보고 있는가.)`,
    ``,
    `**Fundamental Drivers** — (실적 모멘텀, 가이던스 추세, 비즈니스 모델의 구조적 우위, 산업 사이클 위치를 2~3 문단으로.)`,
    ``,
    `**Key Catalysts (Next 3 Months)**`,
    `- (실적 발표일/제품 출시/규제 결정 등 구체적 이벤트, 대략적 시점, 영향)`,
    `- ...`,
    ``,
    `**Material Risks**`,
    `- (펀더멘털·거시·집행 리스크 각 1개 이상)`,
    `- ...`,
    ``,
    `**Technical Confirmation (MTN Cross-Check)** — (MTN의 1차 정량 평가와 위원회 시각이 어떻게 정합/배치되는지 1~2문장.)`,
    ``,
    `**MTN System Alignment**: CONFIRMS / UPGRADES / DOWNGRADES — (이유와 final decision impact)`,
    ``,
    `### Pick #2 — <TICKER> (<회사명>)`,
    `(동일 구조)`,
    ``,
    `### Pick #3 — <TICKER> (<회사명>)`,
    `(동일 구조)`,
    ``,
    `## IV. Other Candidates — Summary Assessment`,
    ``,
    `(Top3 외 종목들에 대해 ticker 별로 1~2문장의 위원회 의견. MTN 정량 점수 대비 외부 LLM의 최종 판단 영향을 반드시 포함. 표 형식 권장.)`,
    ``,
    `| Ticker | IB Rank | Verdict | MTN 대비 판단 영향 | 핵심 의견 |`,
    `| --- | --- | --- | --- | --- |`,
    `| ... | ... | ... | ... | ... |`,
    ``,
    `## V. Sector Rotation & Final Conclusion`,
    ``,
    `(2~3 문단. 위원회의 섹터 로테이션 판단, 이 후보군이 그 안에서 어떻게 위치하는지, 최종 권고와 시간 지평.)`,
    ``,
    `---`,
    ``,
    `# 별첨 A — 위원회 토론 기록 (Committee Discussion Notes)`,
    ``,
    `*아래는 본 심의 회의에서 5인 위원이 각자 영역에서 제시한 주요 의견과 발언 요지입니다. 의견 간 합치되는 부분과 불일치하는 부분을 모두 기록합니다.*`,
    ``,
    `## ① David Kim, CFA — Head of Portfolio Construction`,
    ``,
    `(David의 시각으로 2~4문단. 종목별 포지션 비중 권고, 상대가치 판단, 섹터/팩터 집중 우려, 포트폴리오 내 어떤 슬리브에 들어가야 하는지. 종목명 직접 언급하며 구체적으로.)`,
    ``,
    `## ② Sarah Chen — Senior Equity Research Analyst`,
    ``,
    `(Sarah의 시각으로 2~4문단. EPS/매출 컨센서스 추정 vs 가이던스, 경쟁 해자 분석, 산업 구조의 변화, 펀더멘털 모멘텀의 지속 가능성. 종목별로.)`,
    ``,
    `## ③ Alex Novak, Ph.D. — Head of Quantitative Strategies`,
    ``,
    `(Alex의 시각으로 2~4문단. MTN 정량 시스템의 결과를 어떻게 검증했는지, 팩터 노출도, 모멘텀의 통계적 유의성, 이상치 탐지. 정량 관점에서 종목별 평가.)`,
    ``,
    `## ④ Michael Torres — Chief Risk Officer`,
    ``,
    `(Michael의 시각으로 2~4문단. 하방 시나리오, 종목별 손절 규율, 테일 리스크, MTN이 포착 못한 회계/거버넌스/정치 리스크. 가장 강한 우려와 그 근거.)`,
    ``,
    `## ⑤ James Liu — Head of Trading & Execution`,
    ``,
    `(James의 시각으로 2~4문단. 종목별 유동성 평가, 슬리피지 추정, 진입 분할 전략, 섹터 로테이션 타이밍, 실제 집행 시 주의점.)`,
    ``,
    `---`,
    ``,
    `# 별첨 B — 반대 의견 및 보류 견해 (Dissenting Views)`,
    ``,
    `(만약 특정 종목에 대해 한 위원이 합의된 등급과 다른 견해를 제시했다면 여기에 명시. 형식: "**[위원명]** — **[티커]**: 견해.")`,
    ``,
    `---`,
    ``,
    `# 별첨 C — 데이터 소스 및 면책 조항 (Data Sources & Disclaimer)`,
    ``,
    `본 리포트는 MTN Rule Engine v1의 1차 정량 평가와 외부 LLM 기반 상세 검토로 구성됩니다. MTN 점수는 최종 투자 결정의 충분조건이 아니며, 위원회 판단은 투자 계획 결정에 중대한 영향을 주는 2차 평가입니다. 단, 본 위원회 의견은 단일 LLM 호출의 페르소나 시뮬레이션 결과이며 일부 수치는 추정치(estimate)로서 실제 컨센서스와 다를 수 있습니다. 투자 의사결정의 최종 책임은 투자자 본인에게 있습니다.`,
    '```',
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `## 작성 지침 (Writing Guidelines)`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `1. **분량**: Top3 각각 최소 6~8 문단. 별첨 A의 위원별 의견은 종목명을 구체적으로 언급하며 2~4 문단.`,
    `2. **톤**: 전문 IB 리포트 톤. "추측됩니다" 같은 약한 표현 대신 "위원회는 …로 판단합니다" "리스크는 …이다" 와 같이 단정적·분석적.`,
    `3. **숫자**: 가능한 한 구체적 수치(목표가, EPS%, 매출%, 거래량 등)를 명시. 추정치는 "Est." 라벨.`,
    `4. **차별화**: 위원 5인의 의견은 반드시 서로 다른 관점을 보여야 함. 같은 말 반복 금지.`,
    `5. **MTN 정량과의 관계**: MTN 점수를 그대로 복창하지 말고, 1차 평가로 취급한 뒤 펀더멘털·매크로 레이어를 얹어 보강하거나 도전.`,
    `6. **언어**: 모든 narrative는 한국어. 영어 고유명사·티커·수치는 영문 그대로.`,
    `7. **금지**: 마크다운 본문 안에 또 다른 JSON 블록을 넣지 말 것. 메타데이터 블록은 응답 맨 처음 단 1회만.`,
    ``,
    `이제 위 형식대로 응답을 시작하세요. 첫 출력은 \`\`\`json 펜스부터 시작합니다.`,
  ].join('\n');
}
