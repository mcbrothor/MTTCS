import type { ChartPatternOverlay, MarketAnalysisResponse } from '@/types';
import { extractStructuredJson } from './gemini';

export type TechnicalChartVerdict = 'BUY' | 'WATCH' | 'AVOID';

export interface TechnicalChartAnalysis {
  verdict: TechnicalChartVerdict;
  confidence: number;
  summaryKo: string;
  referencedPatternIds: string[];
  entryCondition: string;
  invalidationCondition: string;
  patternRead: string;
  riskNotes: string[];
}

function compactBars(input: MarketAnalysisResponse) {
  return input.priceData.slice(-80).map((bar) => ({
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

function compactPatterns(patterns: ChartPatternOverlay[]) {
  return patterns.map((pattern) => ({
    id: pattern.id,
    type: pattern.type,
    label: pattern.label,
    confidence: pattern.confidence,
    status: pattern.status,
    dateRange: pattern.dateRange,
    priceRange: pattern.priceRange,
    anchors: pattern.anchors,
    lines: pattern.lines,
    zones: pattern.zones,
    markers: pattern.markers,
    evidence: pattern.evidence,
  }));
}

export function buildTechnicalChartAnalysisPrompt(input: MarketAnalysisResponse) {
  return [
    'You are MTN technical chart analyst. Write Korean. Return JSON only.',
    'Use only the supplied OHLCV, risk metrics, and chartPatterns.',
    'Do not invent chart coordinates, dates, prices, pattern ids, or support/resistance levels.',
    'If you reference a pattern, use only ids from chartPatterns.',
    '',
    'Required JSON shape:',
    '{"verdict":"BUY|WATCH|AVOID","confidence":0.75,"summaryKo":"...","referencedPatternIds":["pattern-vcp"],"entryCondition":"...","invalidationCondition":"...","patternRead":"...","riskNotes":["..."]}',
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
        details: input.vcpAnalysis.details.slice(0, 8),
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
        summary: input.sepaEvidence.summary,
        rsRating: input.sepaEvidence.metrics.rsRating,
        rsSource: input.sepaEvidence.metrics.rsSource,
      },
      chartPatterns: compactPatterns(input.chartPatterns ?? []),
      warnings: input.warnings,
      dataQuality: input.dataQuality,
    }, null, 2),
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
): TechnicalChartAnalysis {
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

export function parseTechnicalChartAnalysisResponse(raw: string, allowedPatternIds: string[]) {
  return validateTechnicalChartAnalysisPayload(extractStructuredJson(raw), allowedPatternIds);
}
