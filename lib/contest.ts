import type {
  ContestCandidate,
  ContestMarket,
  ContestPromptCandidate,
  ContestReview,
  ContestReviewHorizon,
  ContestReviewStatus,
  ScannerUniverse,
} from '@/types';

const MAX_CANDIDATES = 10;

export interface ContestSessionInput {
  market: ContestMarket;
  universe: ScannerUniverse | string;
  candidates: ContestPromptCandidate[];
  llmProvider?: string | null;
}

export interface ParsedLlmRanking {
  ticker: string;
  rank: number;
  comment: string | null;
}

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
      source: candidate.source || 'MTN scanner',
    };
  });
}

export function buildContestPrompt(input: ContestSessionInput) {
  const candidates = validateContestCandidates(input.candidates);
  const payload = {
    task: 'Rank the 10 momentum candidates from best to worst for a SEPA/VCP trader.',
    market: input.market,
    universe: input.universe,
    selected_at: new Date().toISOString(),
    scoring_context: {
      rank_1_meaning: 'highest priority breakout candidate',
      focus: ['relative strength', 'VCP quality', 'dry-up volume', 'pivot proximity', 'liquidity', 'risk/reward'],
      output_contract: {
        rankings: [
          {
            ticker: 'string',
            rank: 'integer 1-10',
            comment: 'short reason in Korean',
          },
        ],
      },
    },
    candidates,
  };

  const llmPrompt = [
    'You are a strict Mark Minervini SEPA/VCP momentum trading reviewer.',
    'Compare the candidates below and return ONLY valid JSON with this shape:',
    '{"rankings":[{"ticker":"NVDA","rank":1,"comment":"short Korean reason"}]}',
    'Rules: ranks must be unique integers from 1 to N, every ticker must appear exactly once, do not add markdown.',
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n');

  return { payload: candidates, llmPrompt };
}

function coerceRankingItem(item: unknown): ParsedLlmRanking | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const ticker = String(row.ticker || row.symbol || '').trim().toUpperCase();
  const rank = Number(row.rank ?? row.llm_rank);
  if (!ticker || !Number.isInteger(rank) || rank < 1 || rank > MAX_CANDIDATES) return null;
  const comment = row.comment === undefined || row.comment === null ? null : String(row.comment).slice(0, 1000);
  return { ticker, rank, comment };
}

export function parseLlmRankings(raw: string, expectedTickers: string[]) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('LLM response must be valid JSON.');
  }

  const rankingsSource = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.rankings)
      ? ((parsed as Record<string, unknown>).rankings as unknown[])
      : null;

  if (!rankingsSource) {
    throw new Error('LLM response must include a rankings array.');
  }

  const expected = expectedTickers.map((ticker) => ticker.toUpperCase());
  const expectedSet = new Set(expected);
  const rows = rankingsSource.map(coerceRankingItem);
  if (rows.some((row) => row === null)) {
    throw new Error('Each ranking must include ticker and rank.');
  }

  const rankings = rows as ParsedLlmRanking[];
  const tickerSet = new Set<string>();
  const rankSet = new Set<number>();

  for (const row of rankings) {
    if (!expectedSet.has(row.ticker)) throw new Error(`Unexpected ticker in LLM response: ${row.ticker}.`);
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
