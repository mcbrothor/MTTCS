import type {
  ContestCandidate,
  ContestLlmOverall,
  ContestLlmRecommendation,
} from '../types/index.ts';

const VALID_OVERALL: ContestLlmOverall[] = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];
const VALID_RECOMMENDATION: ContestLlmRecommendation[] = ['PROCEED', 'WATCH', 'SKIP'];

export interface ContestStructuredVerdict {
  overall: ContestLlmOverall | null;
  keyStrength: string | null;
  keyRisk: string | null;
  recommendation: ContestLlmRecommendation | null;
  confidence: number | null;
  comment: string | null;
  hasStructuredData: boolean;
}

function normalizeText(value: unknown, max = 1000) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function normalizeOverall(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return VALID_OVERALL.includes(text as ContestLlmOverall) ? text as ContestLlmOverall : null;
}

function normalizeRecommendation(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return VALID_RECOMMENDATION.includes(text as ContestLlmRecommendation) ? text as ContestLlmRecommendation : null;
}

function normalizeConfidence(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function getContestStructuredVerdict(candidate: ContestCandidate): ContestStructuredVerdict {
  const analysis = candidate.llm_analysis && typeof candidate.llm_analysis === 'object'
    ? candidate.llm_analysis as Record<string, unknown>
    : null;

  const overall = normalizeOverall(analysis?.overall);
  const keyStrength = normalizeText(analysis?.key_strength) || normalizeText(analysis?.investment_thesis);
  const keyRisk = normalizeText(analysis?.key_risk);
  const recommendation = normalizeRecommendation(analysis?.recommendation);
  const confidence = normalizeConfidence(analysis?.confidence);
  const comment = normalizeText(candidate.llm_comment) || normalizeText(analysis?.comment) || keyStrength;

  return {
    overall,
    keyStrength,
    keyRisk,
    recommendation,
    confidence,
    comment,
    hasStructuredData: Boolean(overall || keyStrength || keyRisk || recommendation || confidence !== null),
  };
}
