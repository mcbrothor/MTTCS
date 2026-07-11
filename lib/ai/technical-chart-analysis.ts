import type { ChartPatternOverlay, MarketAnalysisResponse } from '@/types';
import { buildProfessionalChartPlan, type ProfessionalChartPlan, type ProfessionalSetupGrade, type TradeReadiness } from '@/lib/finance/engines/professional-chart-plan';
import { extractStructuredJson } from './gemini';

export type TechnicalChartVerdict = 'BUY' | 'WATCH' | 'AVOID';

export interface TechnicalChartNarrative {
  verdict: TechnicalChartVerdict;
  confidence: number;
  summaryKo: string;
  referencedPatternIds: string[];
  entryCondition: string;
  invalidationCondition: string;
  patternRead: string;
  riskNotes: string[];
}

export interface TechnicalChartAnalysis extends TechnicalChartNarrative {
  setupGrade: ProfessionalSetupGrade;
  readiness: TradeReadiness;
  professionalPlan: ProfessionalChartPlan;
}

function compactBars(input: MarketAnalysisResponse) {
  return input.priceData.slice(-40).map((bar) => ({
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

function compactPatterns(patterns: ChartPatternOverlay[]) {
  return patterns.slice(0, 6).map((pattern) => ({
    id: pattern.id,
    type: pattern.type,
    label: pattern.label,
    confidence: pattern.confidence,
    status: pattern.status,
    dateRange: pattern.dateRange,
    priceRange: pattern.priceRange,
    evidence: Object.fromEntries(Object.entries(pattern.evidence).slice(0, 5)),
  }));
}

export const technicalChartNarrativeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'confidence', 'summaryKo', 'referencedPatternIds', 'entryCondition', 'invalidationCondition', 'patternRead', 'riskNotes'],
  properties: {
    verdict: { type: 'string', enum: ['BUY', 'WATCH', 'AVOID'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    summaryKo: { type: 'string' },
    referencedPatternIds: { type: 'array', items: { type: 'string' } },
    entryCondition: { type: 'string' },
    invalidationCondition: { type: 'string' },
    patternRead: { type: 'string' },
    riskNotes: { type: 'array', items: { type: 'string' } },
  },
} as const;

export function buildTechnicalChartAnalysisPrompt(input: MarketAnalysisResponse) {
  const professionalPlan = buildProfessionalChartPlan(input);
  return [
    'You are MTN technical chart analyst. Write Korean. Return JSON only.',
    'You explain an existing professional trade plan. Do not invent chart coordinates, prices, pattern IDs, position sizes, or a new verdict.',
    'The deterministic professionalPlan is the execution authority. Explain why its readiness and grade are justified using only the provided evidence.',
    'Use only supplied OHLCV, risk metrics, chartPatterns, and professionalPlan.',
    'If you reference a pattern, use only ids from chartPatterns.',
    'Keep every field concise: summaryKo and patternRead are at most two short Korean sentences; riskNotes contains one to three short items.',
    'Keep the explanation conditional and execution-focused. Do not promise returns or use absolute language.',
    '',
    'Required JSON shape:',
    JSON.stringify(technicalChartNarrativeSchema),
    '',
    JSON.stringify({
      ticker: input.ticker,
      exchange: input.exchange,
      latestBar: input.priceData.at(-1) ?? null,
      ohlcv: compactBars(input),
      vcpAnalysis: {
        score: input.vcpAnalysis.score,
        grade: input.vcpAnalysis.grade,
        pivotPrice: input.vcpAnalysis.pivotPrice,
        invalidationPrice: input.vcpAnalysis.invalidationPrice,
        breakoutVolumeStatus: input.vcpAnalysis.breakoutVolumeStatus,
        details: input.vcpAnalysis.details.slice(0, 4),
      },
      riskPlan: {
        entryPrice: input.riskPlan.entryPrice,
        stopLossPrice: input.riskPlan.stopLossPrice,
        selectedStopPrice: input.riskPlan.selectedStopPrice,
        targetPrice: input.riskPlan.targetPrice,
        rewardRiskRatio: input.riskPlan.rewardRiskRatio,
        riskGate: input.riskPlan.riskGate?.status ?? null,
      },
      sepa: {
        status: input.sepaEvidence.status,
        rsRating: input.sepaEvidence.metrics.rsRating,
        macroActionLevel: input.sepaEvidence.metrics.macroActionLevel ?? null,
      },
      professionalPlan,
      chartPatterns: compactPatterns(input.chartPatterns ?? []),
      warnings: input.warnings.slice(0, 4),
      dataQuality: input.dataQuality,
    }),
  ].join('\n');
}

function assertString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function assertStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must be a string array.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function validateTechnicalChartAnalysisPayload(
  payload: unknown,
  allowedPatternIds: string[],
): TechnicalChartNarrative {
  if (!payload || typeof payload !== 'object') throw new Error('Technical chart analysis must be a JSON object.');
  const record = payload as Record<string, unknown>;
  const verdict = record.verdict;
  if (verdict !== 'BUY' && verdict !== 'WATCH' && verdict !== 'AVOID') {
    throw new Error('verdict must be BUY, WATCH, or AVOID.');
  }
  const confidence = Number(record.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('confidence must be between 0 and 1.');
  }

  const allowed = new Set(allowedPatternIds);
  const referencedPatternIds = assertStringArray(record.referencedPatternIds, 'referencedPatternIds');
  const invalidIds = referencedPatternIds.filter((id) => !allowed.has(id));
  if (invalidIds.length > 0) throw new Error(`Unknown chart pattern ids: ${invalidIds.join(', ')}`);

  return {
    verdict,
    confidence,
    summaryKo: assertString(record.summaryKo, 'summaryKo'),
    referencedPatternIds,
    entryCondition: assertString(record.entryCondition, 'entryCondition'),
    invalidationCondition: assertString(record.invalidationCondition, 'invalidationCondition'),
    patternRead: assertString(record.patternRead, 'patternRead'),
    riskNotes: assertStringArray(record.riskNotes, 'riskNotes'),
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function finalizeTechnicalChartAnalysis(
  input: MarketAnalysisResponse,
  narrative: TechnicalChartNarrative,
): TechnicalChartAnalysis {
  const professionalPlan = buildProfessionalChartPlan(input);
  return {
    ...narrative,
    verdict: professionalPlan.verdict,
    confidence: Math.min(0.95, Math.max(0.2, (professionalPlan.trendScore + (professionalPlan.setupGrade === 'A' ? 3 : professionalPlan.setupGrade === 'B' ? 2 : 1)) / 10)),
    setupGrade: professionalPlan.setupGrade,
    readiness: professionalPlan.readiness,
    professionalPlan,
    entryCondition: professionalPlan.executionRule,
    invalidationCondition: professionalPlan.exitRule,
    riskNotes: unique([...professionalPlan.risks, ...narrative.riskNotes]).slice(0, 5),
  };
}

export function buildRuleBasedTechnicalAnalysis(input: MarketAnalysisResponse): TechnicalChartAnalysis {
  const professionalPlan = buildProfessionalChartPlan(input);
  const patterns = input.chartPatterns || [];
  const labels = patterns.slice(0, 2).map((pattern) => pattern.label).join(', ') || '확정 패턴 부족';
  return {
    verdict: professionalPlan.verdict,
    confidence: Math.min(0.9, Math.max(0.25, (professionalPlan.trendScore + (professionalPlan.setupGrade === 'A' ? 3 : 1)) / 10)),
    setupGrade: professionalPlan.setupGrade,
    readiness: professionalPlan.readiness,
    professionalPlan,
    summaryKo: `${professionalPlan.setupGrade}등급 ${professionalPlan.readiness}: ${professionalPlan.trendSummary}. ${labels}를 실행 조건과 함께 평가합니다.`,
    referencedPatternIds: patterns.filter((pattern) => pattern.status !== 'INVALIDATED').map((pattern) => pattern.id),
    entryCondition: professionalPlan.executionRule,
    invalidationCondition: professionalPlan.exitRule,
    patternRead: `${labels}. ${professionalPlan.trendSummary}.`,
    riskNotes: professionalPlan.risks,
  };
}

export function parseTechnicalChartAnalysisResponse(raw: string, allowedPatternIds: string[]) {
  return validateTechnicalChartAnalysisPayload(extractStructuredJson(raw), allowedPatternIds);
}
