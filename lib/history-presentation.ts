import type {
  ContestLlmRecommendation,
  Trade,
  TradeEntrySnapshot,
} from '../types/index.ts';

export type HistoryReviewTone = 'positive' | 'mixed' | 'negative' | 'neutral';
export type HistoryOutcomeState = 'gain' | 'loss' | 'flat' | 'open' | 'unknown';

export interface HistoryChecklistSummary {
  passed: number;
  failed: number;
  total: number;
  passRate: number;
}

export interface HistoryComparisonSummary {
  tone: HistoryReviewTone;
  outcome: HistoryOutcomeState;
  headline: string;
  detail: string;
}

function hasPlanViolation(trade: Pick<Trade, 'mistake_tags'>) {
  return (trade.mistake_tags || []).includes('plan_violation');
}

function getDisciplinePenalty(trade: Pick<Trade, 'final_discipline' | 'mistake_tags'>) {
  if (hasPlanViolation(trade)) return 2;
  if (typeof trade.final_discipline === 'number' && trade.final_discipline < 60) return 2;
  if (typeof trade.final_discipline === 'number' && trade.final_discipline < 80) return 1;
  return 0;
}

function downgradeTone(tone: HistoryReviewTone, penalty: number): HistoryReviewTone {
  if (penalty <= 0) return tone;
  if (penalty === 1) {
    if (tone === 'positive') return 'mixed';
    if (tone === 'mixed') return 'negative';
    return tone;
  }
  if (tone === 'positive') return 'negative';
  if (tone === 'neutral') return 'mixed';
  return 'negative';
}

function getOutcomeState(trade: Pick<Trade, 'status' | 'metrics' | 'result_amount'>): HistoryOutcomeState {
  if (trade.status !== 'COMPLETED') return 'open';

  const rMultiple = trade.metrics?.rMultiple;
  if (typeof rMultiple === 'number') {
    if (rMultiple > 0.1) return 'gain';
    if (rMultiple < -0.1) return 'loss';
    return 'flat';
  }

  const realizedPnL = trade.metrics?.realizedPnL ?? trade.result_amount;
  if (typeof realizedPnL !== 'number') return 'unknown';
  if (realizedPnL > 0) return 'gain';
  if (realizedPnL < 0) return 'loss';
  return 'flat';
}

function getDisciplineText(trade: Pick<Trade, 'final_discipline' | 'mistake_tags'>) {
  if (hasPlanViolation(trade)) return 'Plan-violation tag was recorded.';
  if (typeof trade.final_discipline === 'number') {
    if (trade.final_discipline >= 80) return `Discipline held at ${trade.final_discipline}pt.`;
    return `Discipline slipped to ${trade.final_discipline}pt.`;
  }
  return 'Discipline score was not recorded.';
}

function getRecommendationText(recommendation: ContestLlmRecommendation | null | undefined) {
  if (recommendation === 'PROCEED') return 'LLM wanted to proceed.';
  if (recommendation === 'WATCH') return 'LLM stayed cautious.';
  if (recommendation === 'SKIP') return 'LLM preferred to skip.';
  return 'No structured LLM recommendation was stored.';
}

export function getHistoryChecklistSummary(snapshot: TradeEntrySnapshot | null | undefined): HistoryChecklistSummary {
  const values = snapshot ? Object.values(snapshot.checklist) : [];
  const total = values.length;
  const passed = values.filter(Boolean).length;
  const failed = total - passed;

  return {
    passed,
    failed,
    total,
    passRate: total > 0 ? passed / total : 0,
  };
}

export function formatHistoryConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return '-';
  return `${Math.round(confidence * 100)}%`;
}

export function getHistoryComparisonSummary(
  trade: Pick<Trade, 'status' | 'metrics' | 'result_amount' | 'final_discipline' | 'mistake_tags' | 'llm_verdict'>
): HistoryComparisonSummary {
  const outcome = getOutcomeState(trade);
  const recommendation = trade.llm_verdict?.recommendation;
  const disciplineText = getDisciplineText(trade);
  const recommendationText = getRecommendationText(recommendation);
  const penalty = getDisciplinePenalty(trade);

  if (outcome === 'open') {
    return {
      tone: 'neutral',
      outcome,
      headline: 'Outcome is still open.',
      detail: `${recommendationText} Actual result is not final yet.`,
    };
  }

  if (!recommendation) {
    if (outcome === 'gain') {
      return {
        tone: downgradeTone('positive', penalty),
        outcome,
        headline: 'Trade finished green without a stored LLM verdict.',
        detail: `${disciplineText}`,
      };
    }

    if (outcome === 'loss') {
      return {
        tone: downgradeTone('mixed', penalty),
        outcome,
        headline: 'Trade finished red without a stored LLM verdict.',
        detail: `${disciplineText}`,
      };
    }

    return {
      tone: downgradeTone('neutral', penalty),
      outcome,
      headline: 'Result is recorded, but no structured verdict is available.',
      detail: `${disciplineText}`,
    };
  }

  if (recommendation === 'PROCEED' && outcome === 'gain') {
    return {
      tone: downgradeTone('positive', penalty),
      outcome,
      headline: 'Pre-trade conviction and actual outcome aligned.',
      detail: `${recommendationText} ${disciplineText}`,
    };
  }

  if (recommendation === 'PROCEED' && outcome === 'loss') {
    return {
      tone: downgradeTone('negative', penalty),
      outcome,
      headline: 'Contest conviction did not survive execution.',
      detail: `${recommendationText} ${disciplineText}`,
    };
  }

  if (recommendation === 'WATCH' && outcome === 'gain') {
    return {
      tone: downgradeTone('mixed', penalty),
      outcome,
      headline: 'A cautious verdict still turned into a gain.',
      detail: `${recommendationText} ${disciplineText}`,
    };
  }

  if (recommendation === 'WATCH' && outcome === 'loss') {
    return {
      tone: downgradeTone('positive', penalty),
      outcome,
      headline: 'The cautious verdict matched a fragile result.',
      detail: `${recommendationText} ${disciplineText}`,
    };
  }

  if (recommendation === 'SKIP' && outcome === 'gain') {
    return {
      tone: downgradeTone('mixed', penalty),
      outcome,
      headline: 'Trade outperformed a conservative verdict.',
      detail: `${recommendationText} ${disciplineText}`,
    };
  }

  if (recommendation === 'SKIP' && outcome === 'loss') {
    return {
      tone: downgradeTone('positive', penalty),
      outcome,
      headline: 'The skip verdict matched the weak outcome.',
      detail: `${recommendationText} ${disciplineText}`,
    };
  }

  return {
    tone: downgradeTone('neutral', penalty),
    outcome,
    headline: 'Plan, verdict, and outcome are all recorded.',
    detail: `${recommendationText} ${disciplineText}`,
  };
}
