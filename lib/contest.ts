import type {
  ContestCandidate,
  ContestLlmOverall,
  ContestLlmRanking,
  ContestLlmRecommendation,
  ContestLlmResponse,
  ContestMarket,
  ContestPromptCandidate,
  ContestReview,
  ContestReviewHorizon,
  ContestReviewStatus,
  MasterFilterResponse,
  ScannerUniverse,
} from '../types/index.ts';
import { extractStructuredJson } from './ai/gemini.ts';

const MAX_CANDIDATES = 10;
const VALID_LLM_OVERALL: ContestLlmOverall[] = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];
const VALID_LLM_RECOMMENDATIONS: ContestLlmRecommendation[] = ['PROCEED', 'WATCH', 'SKIP'];

export const CONTEST_PROMPT_VERSION = 'mtn-contest-ko-v3-rs-htf';
export const CONTEST_RESPONSE_SCHEMA_VERSION = 'mtn-contest-json-v3';

export interface ContestSessionInput {
  market: ContestMarket;
  universe: ScannerUniverse | string;
  candidates: ContestPromptCandidate[];
  sessionId?: string | null;
  marketContext?: Partial<MasterFilterResponse> | Record<string, unknown> | null;
  llmProvider?: string | null;
}

export type ParsedLlmRanking = ContestLlmRanking;

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

export function buildContestResponseSchema(sessionId?: string | null) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['response_schema_version', 'session_id', 'rankings'],
    properties: {
      response_schema_version: {
        type: 'string',
        enum: [CONTEST_RESPONSE_SCHEMA_VERSION],
      },
      session_id: {
        type: ['string', 'null'],
        description: sessionId ? `Must equal ${sessionId}` : 'Contest session id from the prompt payload.',
      },
      rankings: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_CANDIDATES,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'session_id',
            'candidate_id',
            'ticker',
            'rank',
            'overall',
            'key_strength',
            'key_risk',
            'recommendation',
            'confidence',
          ],
          properties: {
            session_id: { type: ['string', 'null'] },
            candidate_id: { type: ['string', 'null'] },
            ticker: { type: 'string' },
            rank: { type: 'integer', minimum: 1, maximum: MAX_CANDIDATES },
            overall: { type: 'string', enum: VALID_LLM_OVERALL },
            key_strength: { type: 'string', minLength: 1, maxLength: 1000 },
            key_risk: { type: 'string', minLength: 1, maxLength: 1000 },
            recommendation: { type: 'string', enum: VALID_LLM_RECOMMENDATIONS },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            comment: { type: ['string', 'null'] },
            scores: { type: ['object', 'null'] },
            analysis: { type: ['object', 'null'] },
          },
        },
      },
    },
  };
}

export function buildContestPrompt(input: ContestSessionInput) {
  const candidates = validateContestCandidates(input.candidates);
  const marketContext = compactMarketContext(input.marketContext);
  const sessionId = input.sessionId || 'session-id';
  const responseSchema = buildContestResponseSchema(input.sessionId || null);
  const responseExample: ContestLlmResponse = {
    response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
    session_id: sessionId,
    rankings: candidates.map((candidate, index) => ({
      session_id: sessionId,
      candidate_id: candidate.candidate_id || 'candidate-id',
      ticker: candidate.ticker,
      rank: index + 1,
      overall: index === 0 ? 'POSITIVE' : index === candidates.length - 1 ? 'NEGATIVE' : 'NEUTRAL',
      key_strength: 'Short sentence describing the strongest reason.',
      key_risk: 'Short sentence describing the main risk.',
      recommendation: index === 0 ? 'PROCEED' : index === candidates.length - 1 ? 'SKIP' : 'WATCH',
      confidence: 0.72,
      comment: 'One-line summary.',
      scores: {
        technical: 0,
        fundamental: 0,
        earnings_growth: 0,
        moat: 0,
        market_fit: 0,
        risk_reward: 0,
      },
      analysis: {},
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
      p3Score: 'Use the macro score as a background constraint rather than as the only reason.',
      followThroughDay: 'Treat follow-through as a positive confirmation signal.',
      distributionPressure: 'High distribution pressure should reduce aggressiveness.',
      newHighLowProxy: 'Use it as a participation proxy.',
      above200d: 'Use it as a breadth proxy.',
      sectorRotation: 'Use it to judge whether leadership is risk-on or defensive.',
      redMarketRule: 'In RED conditions, be more conservative on recommendation, stop discipline, and sizing.',
    },
    scoring_context: {
      rank_1_meaning: 'Best relative candidate among the submitted names.',
      compare_axes: [
        'Technical structure and VCP quality',
        'Base type and High Tight Flag edge cases',
        'RS Rating and universe-relative leadership',
        'IBD proxy and Mansfield RS strength',
        'Macro action level and market regime fit',
        'SEPA pass/fail details and exception signals',
        'Recent sales and earnings growth',
        'Moat, industry leadership, and risk/reward',
      ],
      output_contract: responseExample,
      output_schema: responseSchema,
    },
    candidates,
  };

  const llmPrompt = [
    'You are MTN beauty contest analyst.',
    'Write the reasoning in Korean, but return only valid JSON.',
    `response_schema_version must be "${CONTEST_RESPONSE_SCHEMA_VERSION}".`,
    'Do not return markdown, prose, or code fences.',
    'Every ranking must include session_id, candidate_id, ticker, rank, overall, key_strength, key_risk, recommendation, and confidence.',
    'Use overall from POSITIVE | NEUTRAL | NEGATIVE.',
    'Use recommendation from PROCEED | WATCH | SKIP.',
    'confidence must be a number between 0.0 and 1.0.',
    'All submitted candidates must be ranked exactly once with unique ranks from 1 to N.',
    '',
    'JSON schema:',
    JSON.stringify(responseSchema, null, 2),
    '',
    'JSON example:',
    JSON.stringify(responseExample, null, 2),
    '',
    'Analysis payload:',
    JSON.stringify(payload, null, 2),
  ].join('\n');

  return { payload: candidates, llmPrompt, promptPayload: payload };
}

export function extractJsonPayload(raw: string) {
  return extractStructuredJson(raw);
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
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function objectOrNull(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayOrSingleText(value: unknown) {
  if (Array.isArray(value)) {
    const rows = value
      .map((item) => stringOrNull(item, 500))
      .filter((item): item is string => Boolean(item));
    return rows.length > 0 ? rows : null;
  }
  return stringOrNull(value, 500);
}

function normalizeOverall(value: unknown): ContestLlmOverall | null {
  const text = String(value || '').trim().toUpperCase();
  return VALID_LLM_OVERALL.includes(text as ContestLlmOverall) ? (text as ContestLlmOverall) : null;
}

function normalizeRecommendation(value: unknown): ContestLlmRecommendation | null {
  const text = String(value || '').trim().toUpperCase();
  return VALID_LLM_RECOMMENDATIONS.includes(text as ContestLlmRecommendation)
    ? (text as ContestLlmRecommendation)
    : null;
}

function inferRecommendation(overall: ContestLlmOverall | null): ContestLlmRecommendation {
  if (overall === 'POSITIVE') return 'PROCEED';
  if (overall === 'NEGATIVE') return 'SKIP';
  return 'WATCH';
}

function confidenceOrNull(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function coerceRankingItem(item: unknown, fallbackSessionId: string | null): ParsedLlmRanking | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const ticker = String(row.ticker || row.symbol || '').trim().toUpperCase();
  const candidateId = row.candidate_id === undefined || row.candidate_id === null ? null : String(row.candidate_id);
  const sessionId = row.session_id === undefined || row.session_id === null
    ? fallbackSessionId
    : String(row.session_id);
  const rank = Number(row.rank ?? row.llm_rank);
  const overall = normalizeOverall(row.overall);
  const recommendation = normalizeRecommendation(row.recommendation) || inferRecommendation(overall);
  const keyStrength = stringOrNull(row.key_strength, 1000)
    || stringOrNull(row.investment_thesis, 1000)
    || stringOrNull(row.comment, 1000);
  const keyRisk = stringOrNull(row.key_risk, 1000)
    || (Array.isArray(row.risks) ? stringOrNull(row.risks[0], 1000) : stringOrNull(row.risks, 1000));
  const confidence = confidenceOrNull(row.confidence);

  if (!ticker || !Number.isInteger(rank) || rank < 1 || rank > MAX_CANDIDATES) return null;
  if (!overall || !keyStrength || !keyRisk || confidence === null) return null;

  const comment = stringOrNull(row.comment, 1000) || keyStrength;
  const scores = objectOrNull(row.scores);
  const analysis = {
    overall,
    key_strength: keyStrength,
    key_risk: keyRisk,
    recommendation,
    confidence,
    investment_thesis: stringOrNull(row.investment_thesis),
    technical_view: stringOrNull(row.technical_view),
    fundamental_view: stringOrNull(row.fundamental_view),
    earnings_growth_view: stringOrNull(row.earnings_growth_view),
    moat_view: stringOrNull(row.moat_view),
    market_context: stringOrNull(row.market_context),
    risks: arrayOrSingleText(row.risks),
    catalysts: arrayOrSingleText(row.catalysts),
    raw: row,
  };

  return {
    session_id: sessionId,
    candidate_id: candidateId,
    ticker,
    rank,
    overall,
    key_strength: keyStrength,
    key_risk: keyRisk,
    recommendation,
    confidence,
    comment,
    scores,
    analysis,
  };
}

export function normalizeContestLlmResponse(
  raw: string,
  expectedCandidates: ExpectedCandidate[],
  expectedSessionId?: string | null
): ContestLlmResponse {
  const parsed = extractJsonPayload(raw);
  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const rankingsSource = Array.isArray(parsed)
    ? parsed
    : Array.isArray(root?.rankings)
      ? (root?.rankings as unknown[])
      : null;

  if (!rankingsSource) {
    throw new Error('LLM response must include a rankings array.');
  }

  const rootSessionId = typeof root?.session_id === 'string' && root.session_id.trim()
    ? root.session_id.trim()
    : null;
  const responseSchemaVersion = typeof root?.response_schema_version === 'string' && root.response_schema_version.trim()
    ? root.response_schema_version.trim()
    : CONTEST_RESPONSE_SCHEMA_VERSION;

  if (expectedSessionId && rootSessionId && expectedSessionId !== rootSessionId) {
    throw new Error(`LLM response session_id mismatch: expected ${expectedSessionId}, received ${rootSessionId}.`);
  }

  const expected = normalizeExpected(expectedCandidates);
  const expectedTickerSet = new Set(expected.map((candidate) => candidate.ticker));
  const expectedIdSet = new Set(expected.map((candidate) => candidate.id).filter(Boolean));
  const rows = rankingsSource.map((item) => coerceRankingItem(item, rootSessionId || expectedSessionId || null));
  if (rows.some((row) => row === null)) {
    throw new Error('Each ranking must include ticker, rank, overall, key_strength, key_risk, recommendation, and confidence.');
  }

  const rankings = rows as ParsedLlmRanking[];
  const tickerSet = new Set<string>();
  const rankSet = new Set<number>();

  for (const row of rankings) {
    if (expectedSessionId && row.session_id && row.session_id !== expectedSessionId) {
      throw new Error(`LLM response session_id mismatch: expected ${expectedSessionId}, received ${row.session_id}.`);
    }
    if (!expectedTickerSet.has(row.ticker)) {
      throw new Error(`Unexpected ticker in LLM response: ${row.ticker}.`);
    }
    if (row.candidate_id && expectedIdSet.size > 0 && !expectedIdSet.has(row.candidate_id)) {
      throw new Error(`Unexpected candidate_id in LLM response: ${row.candidate_id}.`);
    }
    if (tickerSet.has(row.ticker)) {
      throw new Error(`Duplicate ticker in LLM response: ${row.ticker}.`);
    }
    if (rankSet.has(row.rank)) {
      throw new Error(`Duplicate rank in LLM response: ${row.rank}.`);
    }
    tickerSet.add(row.ticker);
    rankSet.add(row.rank);
  }

  if (rankings.length !== expected.length) {
    throw new Error('LLM response must rank every selected candidate.');
  }

  const rankingSessionIds = Array.from(new Set(rankings
    .map((row) => row.session_id)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
  const resolvedSessionId = expectedSessionId || rootSessionId || (rankingSessionIds.length === 1 ? rankingSessionIds[0] : null);

  if (expectedSessionId && resolvedSessionId && expectedSessionId !== resolvedSessionId) {
    throw new Error(`LLM response session_id mismatch: expected ${expectedSessionId}, received ${resolvedSessionId}.`);
  }

  return {
    response_schema_version: responseSchemaVersion === CONTEST_RESPONSE_SCHEMA_VERSION
      ? responseSchemaVersion
      : CONTEST_RESPONSE_SCHEMA_VERSION,
    session_id: resolvedSessionId,
    rankings: rankings
      .map((row) => ({
        ...row,
        session_id: row.session_id || resolvedSessionId,
      }))
      .sort((a, b) => a.rank - b.rank),
  };
}

export function parseLlmRankings(raw: string, expectedCandidates: ExpectedCandidate[]) {
  return normalizeContestLlmResponse(raw, expectedCandidates).rankings;
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
