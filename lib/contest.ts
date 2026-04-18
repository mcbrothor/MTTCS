import type {
  ContestCandidate,
  ContestMarket,
  ContestPromptCandidate,
  ContestReview,
  ContestReviewHorizon,
  ContestReviewStatus,
  MasterFilterResponse,
  ScannerUniverse,
} from '@/types';

const MAX_CANDIDATES = 10;
export const CONTEST_PROMPT_VERSION = 'mtn-contest-ko-v3-rs-htf';
export const CONTEST_RESPONSE_SCHEMA_VERSION = 'mtn-contest-json-v2';

export interface ContestSessionInput {
  market: ContestMarket;
  universe: ScannerUniverse | string;
  candidates: ContestPromptCandidate[];
  sessionId?: string | null;
  marketContext?: Partial<MasterFilterResponse> | Record<string, unknown> | null;
  llmProvider?: string | null;
}

export interface ParsedLlmRanking {
  candidate_id: string | null;
  ticker: string;
  rank: number;
  comment: string | null;
  scores: Record<string, unknown> | null;
  analysis: Record<string, unknown>;
}

type ExpectedCandidate = string | { id?: string | null; ticker: string };

export function validateContestCandidates(candidates: ContestPromptCandidate[]) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('At least one contest candidate is required.');
  }
  if (candidates.length > MAX_CANDIDATES) {
    throw new Error('A beauty contest session can include at most 10 candidates.');
  }

  const seen = new Set<string>();
  return candidates.map((candidate, index) => {
    const ticker = String(candidate.ticker || '').trim().toUpperCase();
    const exchange = String(candidate.exchange || '').trim().toUpperCase();
    if (!ticker || !exchange) {
      throw new Error(`Candidate ${index + 1} must include ticker and exchange.`);
    }
    const key = `${exchange}:${ticker}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate candidate detected: ${ticker}.`);
    }
    seen.add(key);

    return {
      ...candidate,
      ticker,
      exchange,
      name: candidate.name || ticker,
      user_rank: Number(candidate.user_rank) || index + 1,
      recommendation_tier: candidate.recommendation_tier || null,
      recommendation_reason: candidate.recommendation_reason || null,
      exception_signals: Array.isArray(candidate.exception_signals) ? candidate.exception_signals : [],
      source: candidate.source || 'MTN scanner',
    };
  });
}

function compactMarketContext(input: ContestSessionInput['marketContext']) {
  if (!input || typeof input !== 'object') return null;
  const context = input as Partial<MasterFilterResponse> & { metrics?: Record<string, unknown> };
  const metrics = context.metrics as Record<string, unknown> | undefined;
  return {
    state: context.state || null,
    market: context.market || null,
    p3Score: metrics?.p3Score ?? null,
    insightLog: context.insightLog || null,
    indicators: {
      followThroughDay: metrics?.ftd || null,
      distributionPressure: metrics?.distribution || null,
      newHighLowProxy: metrics?.newHighLow || null,
      above200d: metrics?.above200d || null,
      sectorRotation: metrics?.sectorRotation || null,
    },
  };
}

export function buildContestPrompt(input: ContestSessionInput) {
  const candidates = validateContestCandidates(input.candidates);
  const marketContext = compactMarketContext(input.marketContext);
  const responseExample = {
    rankings: candidates.map((candidate, index) => ({
      session_id: input.sessionId || 'session-id',
      candidate_id: candidate.candidate_id || 'candidate-id',
      ticker: candidate.ticker,
      rank: index + 1,
      scores: {
        technical: 0,
        fundamental: 0,
        earnings_growth: 0,
        moat: 0,
        market_fit: 0,
        risk_reward: 0,
      },
      investment_thesis: '한국어 투자 가설',
      technical_view: 'SEPA/VCP/피벗/거래량 관점',
      fundamental_view: '재무 건전성과 사업 품질 관점',
      earnings_growth_view: '최근 매출, 이익 성장과 추정치 변화',
      moat_view: '경쟁우위, 시장지위, 지속가능성',
      market_context: '마스터 필터와 현재 시장 국면에 대한 적합성',
      risks: ['핵심 리스크'],
      catalysts: ['상승 촉매'],
      comment: '짧은 최종 사유',
    })),
  };

  const payload = {
    task: 'MTN scanner candidates hedge-fund style comparison',
    prompt_version: CONTEST_PROMPT_VERSION,
    response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
    session_id: input.sessionId || null,
    market: input.market,
    universe: input.universe,
    selected_at: new Date().toISOString(),
    market_context: marketContext,
    market_context_guide: {
      p3Score: '마스터 필터 총점입니다. GREEN/YELLOW/RED 판단의 핵심 배경으로 사용하세요.',
      followThroughDay: '기관 매수 재개 신호입니다.',
      distributionPressure: '기관 매도 압력입니다. 높을수록 보수적으로 평가하세요.',
      newHighLowProxy: '시장 참여 폭과 내부 강도 proxy입니다.',
      above200d: '주요 ETF가 200일선 위에 있는 비율입니다.',
      sectorRotation: '성장/경기민감 섹터 주도 여부입니다.',
      redMarketRule: 'RED 국면이어도 후보 비교는 하되 포지션 크기, 손절, 진입 타이밍을 더 보수적으로 평가하세요.',
    },
    scoring_context: {
      rank_1_meaning: '가장 우선 비교할 돌파/주도주 후보',
      compare_axes: [
        '기술적 구조와 VCP 품질',
        'Base_Type: Standard_VCP와 High_Tight_Flag는 리스크 가정과 손절 기준을 분리해 비교',
        'RS Proxy: 동일 유니버스 순위, 3/6/9/12개월 가중 모멘텀, RS Line 신고가/근접 여부',
        '테니스 공 액션: 시장 하락일에 덜 빠지거나 상승 마감한 방어력',
        'HTF 후보는 거래량 건조화와 타이트 손절 조건을 반드시 별도 평가',
        'SEPA 조건 충족도와 예외 신호',
        '최근 매출과 이익 성장',
        '펀더멘털 품질과 재무 안정성',
        '해자와 시장 지위',
        '최근 뉴스와 애널리스트 판단 변화',
        '마스터 필터 시장 국면 적합성',
        '리스크 대비 보상',
      ],
      output_contract: responseExample,
    },
    candidates,
  };

  const llmPrompt = [
    '당신은 월가 IB 애널리스트와 헤지펀드 포트폴리오 매니저의 관점으로 MTN 후보 종목을 비교하는 한국어 리서치 엔진입니다.',
    '아래 payload의 후보들은 SEPA/VCP 스캐너에서 나온 종목입니다. Recommended와 Partial은 시스템이 비교 가치가 있다고 본 후보입니다.',
    '내부 뉴스 API는 제공되지 않으므로, 최근 뉴스와 애널리스트 판단 변화는 당신이 접근 가능한 웹/지식 기반으로 보완해 주세요.',
    '마스터 필터가 RED이면 후보를 배제하지 말고, 포지션 크기와 손절 조건을 더 보수적으로 평가하세요.',
    'payload의 rs_rating, rs_rank, weighted_momentum_score, rs_line_new_high, tennis_ball_count, base_type, momentum_branch, high_tight_flag를 반드시 기술적 평가에 반영하세요.',
    'High_Tight_Flag는 강한 주도주의 예외 패턴입니다. 거래량 건조화가 없거나 stopPlan이 불리하면 순위를 낮추세요.',
    '최종 응답은 JSON만 출력하세요. 설명 문장, markdown, 코드블록을 붙이지 마세요.',
    '모든 후보가 정확히 한 번씩 등장해야 하며 rank는 1부터 N까지 중복 없이 부여해야 합니다.',
    '필수 매핑 필드인 session_id, candidate_id, ticker를 그대로 유지하세요.',
    '',
    '요구 JSON 예시:',
    JSON.stringify(responseExample, null, 2),
    '',
    '분석 payload:',
    JSON.stringify(payload, null, 2),
  ].join('\n');

  return { payload: candidates, llmPrompt, promptPayload: payload };
}

function parseJsonCandidate(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractJsonPayload(raw: string) {
  const trimmed = raw.trim();
  const direct = parseJsonCandidate(trimmed);
  if (direct) return direct;

  const fences = Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  for (const fence of fences) {
    const parsed = parseJsonCandidate((fence[1] || '').trim());
    if (parsed) return parsed;
  }

  for (let start = 0; start < trimmed.length; start += 1) {
    const open = trimmed[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === open) depth += 1;
      if (char === close) depth -= 1;
      if (depth === 0) {
        const parsed = parseJsonCandidate(trimmed.slice(start, index + 1));
        if (parsed) return parsed;
        break;
      }
    }
  }

  throw new Error('LLM response must include a valid JSON object or JSON code block.');
}

export function extractLlmSessionId(raw: string) {
  try {
    const parsed = extractJsonPayload(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rootSessionId = (parsed as Record<string, unknown>).session_id;
      if (typeof rootSessionId === 'string' && rootSessionId.trim()) return rootSessionId.trim();

      const rankings = (parsed as Record<string, unknown>).rankings;
      if (Array.isArray(rankings)) {
        const sessionIds = Array.from(new Set(rankings
          .map((item) => item && typeof item === 'object' ? (item as Record<string, unknown>).session_id : null)
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim())));
        if (sessionIds.length === 1) return sessionIds[0];
      }
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeExpected(expected: ExpectedCandidate[]) {
  return expected.map((candidate) => {
    if (typeof candidate === 'string') return { id: null, ticker: candidate.toUpperCase() };
    return { id: candidate.id || null, ticker: String(candidate.ticker).toUpperCase() };
  });
}

function stringOrNull(value: unknown, max = 4000) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

function objectOrNull(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function coerceRankingItem(item: unknown): ParsedLlmRanking | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const ticker = String(row.ticker || row.symbol || '').trim().toUpperCase();
  const candidate_id = row.candidate_id === undefined || row.candidate_id === null ? null : String(row.candidate_id);
  const rank = Number(row.rank ?? row.llm_rank);
  if (!ticker || !Number.isInteger(rank) || rank < 1 || rank > MAX_CANDIDATES) return null;

  const comment = stringOrNull(row.comment, 1000) || stringOrNull(row.investment_thesis, 1000);
  const scores = objectOrNull(row.scores);
  const analysis = {
    investment_thesis: stringOrNull(row.investment_thesis),
    technical_view: stringOrNull(row.technical_view),
    fundamental_view: stringOrNull(row.fundamental_view),
    earnings_growth_view: stringOrNull(row.earnings_growth_view),
    moat_view: stringOrNull(row.moat_view),
    market_context: stringOrNull(row.market_context),
    risks: Array.isArray(row.risks) ? row.risks : stringOrNull(row.risks),
    catalysts: Array.isArray(row.catalysts) ? row.catalysts : stringOrNull(row.catalysts),
    raw: row,
  };
  return { candidate_id, ticker, rank, comment, scores, analysis };
}

export function parseLlmRankings(raw: string, expectedCandidates: ExpectedCandidate[]) {
  const parsed = extractJsonPayload(raw);
  const rankingsSource = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.rankings)
      ? ((parsed as Record<string, unknown>).rankings as unknown[])
      : null;

  if (!rankingsSource) {
    throw new Error('LLM response must include a rankings array.');
  }

  const expected = normalizeExpected(expectedCandidates);
  const expectedTickerSet = new Set(expected.map((candidate) => candidate.ticker));
  const expectedIdSet = new Set(expected.map((candidate) => candidate.id).filter(Boolean));
  const rows = rankingsSource.map(coerceRankingItem);
  if (rows.some((row) => row === null)) {
    throw new Error('Each ranking must include ticker and rank.');
  }

  const rankings = rows as ParsedLlmRanking[];
  const tickerSet = new Set<string>();
  const rankSet = new Set<number>();

  for (const row of rankings) {
    if (!expectedTickerSet.has(row.ticker)) throw new Error(`Unexpected ticker in LLM response: ${row.ticker}.`);
    if (row.candidate_id && expectedIdSet.size > 0 && !expectedIdSet.has(row.candidate_id)) {
      throw new Error(`Unexpected candidate_id in LLM response: ${row.candidate_id}.`);
    }
    if (tickerSet.has(row.ticker)) throw new Error(`Duplicate ticker in LLM response: ${row.ticker}.`);
    if (rankSet.has(row.rank)) throw new Error(`Duplicate rank in LLM response: ${row.rank}.`);
    tickerSet.add(row.ticker);
    rankSet.add(row.rank);
  }

  if (rankings.length !== expected.length) {
    throw new Error('LLM response must rank every selected candidate.');
  }

  return rankings.sort((a, b) => a.rank - b.rank);
}

export function reviewDueDate(selectedAt: string | Date, horizon: ContestReviewHorizon) {
  const date = selectedAt instanceof Date ? new Date(selectedAt) : new Date(selectedAt);
  date.setUTCDate(date.getUTCDate() + (horizon === 'W1' ? 7 : 30));
  return date.toISOString().slice(0, 10);
}

export function calculateReturnPct(basePrice: number | null | undefined, reviewPrice: number | null | undefined) {
  if (!basePrice || !reviewPrice || basePrice <= 0) return null;
  const value = ((reviewPrice - basePrice) / basePrice) * 100;
  return Math.round((value + 1e-9) * 100) / 100;
}

export function isReviewDue(review: Pick<ContestReview, 'due_date' | 'status'>, now = new Date()) {
  if (review.status !== 'PENDING' && review.status !== 'ERROR') return false;
  const due = new Date(`${review.due_date}T00:00:00.000Z`);
  return due.getTime() <= now.getTime();
}

export function summarizeContestReview(candidates: (ContestCandidate & { reviews?: ContestReview[] })[]) {
  const allReviews = candidates.flatMap((candidate) =>
    (candidate.reviews || []).map((review) => ({ candidate, review }))
  );
  const updated = allReviews.filter((item) => item.review.status === 'UPDATED' || item.review.status === 'MANUAL');
  const best = [...updated].sort((a, b) => (b.review.return_pct ?? -Infinity) - (a.review.return_pct ?? -Infinity))[0];
  const worst = [...updated].sort((a, b) => (a.review.return_pct ?? Infinity) - (b.review.return_pct ?? Infinity))[0];
  const missedLeaders = updated.filter((item) => !item.candidate.actual_invested && (item.review.return_pct || 0) > 10);
  const avoidedLosses = updated.filter((item) => !item.candidate.actual_invested && (item.review.return_pct || 0) < -5);

  return {
    updatedCount: updated.length,
    best: best ? { ticker: best.candidate.ticker, returnPct: best.review.return_pct } : null,
    worst: worst ? { ticker: worst.candidate.ticker, returnPct: worst.review.return_pct } : null,
    missedLeaders: missedLeaders.map((item) => item.candidate.ticker),
    avoidedLosses: avoidedLosses.map((item) => item.candidate.ticker),
  };
}

export function normalizeReviewStatus(value: unknown): ContestReviewStatus {
  return value === 'UPDATED' || value === 'ERROR' || value === 'MANUAL' || value === 'PENDING' ? value : 'PENDING';
}



