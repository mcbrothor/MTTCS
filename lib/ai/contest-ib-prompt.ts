import type { BeautyContestSession, ContestCandidate, MasterFilterResponse } from '@/types';

export const IB_PROMPT_VERSION = 'mtn-ib-committee-v1';
export const IB_RESPONSE_SCHEMA_VERSION = 'mtn-ib-committee-json-v1';

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
    rs_percentile: snap.rs_percentile,
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

function buildResponseSchema(sessionId: string) {
  return {
    type: 'object',
    required: ['schema_version', 'session_id', 'committee_consensus', 'candidate_analyses'],
    properties: {
      schema_version: { type: 'string', enum: [IB_RESPONSE_SCHEMA_VERSION] },
      session_id: { type: 'string' },
      analysis_date: { type: 'string' },
      market_context_summary: { type: 'string' },
      committee_consensus: {
        type: 'object',
        required: ['executive_summary', 'top3_tickers'],
        properties: {
          executive_summary: { type: 'string', description: '3-5문장 한국어 종합 결론' },
          top3_tickers: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
            description: 'IB 위원회 최종 Top3 티커 (순위 순)',
          },
          mtn_alignment: {
            type: 'string',
            enum: ['CONFIRMS', 'PARTIAL_RERANK', 'SIGNIFICANT_RERANK'],
          },
          regime_assessment: { type: 'string', description: '현재 시장 국면에 대한 위원회 공동 의견' },
        },
      },
      candidate_analyses: {
        type: 'array',
        items: {
          type: 'object',
          required: ['ticker', 'mtn_rank', 'ib_rank', 'ib_verdict', 'final_narrative'],
          properties: {
            ticker: { type: 'string' },
            mtn_rank: { type: 'integer' },
            ib_rank: { type: 'integer' },
            ib_verdict: {
              type: 'string',
              enum: ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'],
            },
            price_target_12m: { type: ['string', 'null'], description: '12개월 목표가 (예: $215 or null)' },
            eps_growth_estimate: { type: ['string', 'null'], description: '차기 회계연도 EPS 성장률 추정 (예: +18%)' },
            revenue_growth_estimate: { type: ['string', 'null'] },
            catalyst_events: {
              type: 'array',
              items: { type: 'string' },
              description: '향후 3개월 내 주요 촉매 이벤트',
            },
            key_risks_fundamental: {
              type: 'array',
              items: { type: 'string' },
              description: '내부 정량 시스템이 포착하지 못한 펀더멘털 리스크',
            },
            moat_assessment: {
              type: 'string',
              enum: ['WIDE', 'NARROW', 'NONE', 'UNKNOWN'],
            },
            committee_notes: {
              type: 'object',
              properties: {
                portfolio_construction: { type: 'string', description: 'David Kim 관점' },
                equity_research: { type: 'string', description: 'Sarah Chen 관점' },
                quant_validation: { type: 'string', description: 'Alex Novak 관점' },
                risk_assessment: { type: 'string', description: 'Michael Torres 관점' },
                execution_note: { type: 'string', description: 'James Liu 관점' },
              },
            },
            mtn_alignment: {
              type: 'string',
              enum: ['CONFIRMS', 'UPGRADES', 'DOWNGRADES'],
              description: 'IB 판단이 MTN 내부 순위를 확인/상향/하향하는지',
            },
            final_narrative: { type: 'string', description: '3-5문장 한국어 최종 투자 내러티브' },
          },
        },
      },
      dissenting_views: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            analyst: { type: 'string' },
            ticker: { type: 'string' },
            view: { type: 'string' },
          },
        },
      },
      sector_context: { type: 'string', description: '해당 유니버스/섹터 전반 동향 및 시사점' },
      macro_overlay: { type: 'string', description: '금리, 달러, 실적 시즌 등 매크로 오버레이' },
    },
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

  const schema = buildResponseSchema(session.id);

  const systemPrompt = [
    `당신은 Goldman Sachs / Morgan Stanley 수준의 글로벌 IB 투자 심의 위원회(Investment Committee)입니다.`,
    `아래 5인의 시니어 전문가가 MTN 내부 정량 시스템의 후보 종목 순위를 검토하고,`,
    `각자의 전문 영역(펀더멘털·계량·리스크·집행)에서 보완 분석을 수행한 뒤,`,
    `합의를 통해 최종 판단을 도출합니다.`,
    ``,
    `━━━ 위원회 구성 ━━━`,
    `① David Kim, CFA — Head of Portfolio Construction`,
    `   임무: 후보 간 상대가치, 포트폴리오 내 포지션 비중, 섹터 집중 리스크 평가`,
    ``,
    `② Sarah Chen — Senior Equity Research Analyst`,
    `   임무: EPS/매출 컨센서스, 펀더멘털 모멘텀, 경쟁 해자(Economic Moat), 신용 및 재무 건전성`,
    ``,
    `③ Alex Novak, Ph.D. — Head of Quantitative Strategies`,
    `   임무: 내부 정량 결과 독립 검증, 팩터 노출도, 모멘텀 지속성, 이상 신호 탐지`,
    ``,
    `④ Michael Torres — Chief Risk Officer`,
    `   임무: 하방 시나리오, 손절 규율, 섹터/종목 상관관계, 정량 시스템이 포착 못한 테일 리스크`,
    ``,
    `⑤ James Liu — Head of Trading & Execution`,
    `   임무: 유동성 및 슬리피지, 최적 진입 전략, 섹터 로테이션 타이밍, 실제 집행 가능성`,
    ``,
    `━━━ 내부 정량 시스템(MTN Rule Engine) 결과 ━━━`,
    `채점 기준: VCP 품질(25pt) + RS 리더십(25pt) + SEPA 충족률(20pt) + 모멘텀(15pt) + 기술 구조(15pt) = 총 100pt`,
    ``,
    JSON.stringify({ universe: session.universe, market: session.market, selected_at: session.selected_at, market_context: marketBlock, mtn_ranked_candidates: candidateBlock }, null, 2),
    ``,
    `━━━ 위원회 임무 ━━━`,
    `각 위원은 자신의 영역에서 아래를 분석하라:`,
    `1. 최근 EPS 및 매출 실적 발표 내용, 차기 가이던스 및 컨센서스 추정치`,
    `2. 업계 경쟁 구도, 기술적 해자, 시장점유율 동향`,
    `3. 향후 3개월 내 주요 촉매 이벤트(실적 발표일, 제품 출시, 규제 이슈)`,
    `4. MTN 내부 시스템이 포착하지 못한 거시·섹터·기업 특유 리스크`,
    `5. 현재 시장 국면에서의 섹터 로테이션 방향 및 이 종목들의 위치`,
    `6. MTN 순위와 다른 판단이 있다면 반드시 근거와 함께 제시`,
    ``,
    `━━━ 출력 요구사항 ━━━`,
    `- 모든 narrative 필드는 반드시 한국어로 작성`,
    `- 불확실한 정보는 "추정" 또는 "확인 필요"로 명시`,
    `- 반드시 유효한 JSON만 반환 (markdown, prose, code fence 사용 금지)`,
    `- schema_version은 반드시 "${IB_RESPONSE_SCHEMA_VERSION}"`,
    `- 모든 후보를 candidate_analyses에 포함시키고 ib_rank를 1~N으로 고유 부여`,
    ``,
    `JSON 응답 스키마:`,
    JSON.stringify(schema, null, 2),
  ].join('\n');

  return systemPrompt;
}
