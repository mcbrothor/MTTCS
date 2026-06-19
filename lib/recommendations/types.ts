import type { OHLCData } from '@/types';

export type RecommendationMarket = 'US' | 'KR';
export type RecommendationHorizon = 'LIVE' | 'D5' | 'D20' | 'D60';
export type RecommendationQuality = 'FULL' | 'FALLBACK' | 'UNADJUSTED' | 'ANOMALY' | 'MISSING';
export type RecommendationCause =
  | 'MARKET_REGIME'
  | 'SELECTION'
  | 'ENTRY_TIMING'
  | 'SIGNAL_SOURCE'
  | 'CONCENTRATION'
  | 'DATA_QUALITY';

export interface RecommendationBar extends OHLCData {
  qualityStatus?: RecommendationQuality;
}

export interface RecommendationPerformanceResult {
  horizon: RecommendationHorizon;
  status: 'PENDING' | 'MATURED' | 'EXCLUDED' | 'ERROR';
  sessionCount: number;
  entryDate: string | null;
  entryPrice: number | null;
  evaluationDate: string | null;
  evaluationPrice: number | null;
  benchmarkEntryPrice: number | null;
  benchmarkEvaluationPrice: number | null;
  returnPct: number | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  mfePct: number | null;
  maePct: number | null;
  qualityStatus: RecommendationQuality;
  errorMessage: string | null;
}

export interface DiagnosticInput {
  pickId: string;
  publicationId: string;
  market: RecommendationMarket;
  horizon: RecommendationHorizon;
  source: string;
  sector: string | null;
  rank: number;
  confidence: number;
  entryGapPct: number | null;
  returnPct: number | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  mfePct: number | null;
  maePct: number | null;
  qualityStatus: RecommendationQuality;
  performanceStatus?: RecommendationPerformanceResult['status'];
  runDate: string;
}

export interface DiagnosticFinding {
  publicationId: string | null;
  pickId: string | null;
  market: RecommendationMarket;
  horizon: RecommendationHorizon;
  scopeType: 'PICK' | 'COHORT' | 'SEGMENT';
  scopeKey: string;
  causeCode: RecommendationCause;
  findingStatus: 'HYPOTHESIS' | 'CONFIRMED';
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  confidence: number;
  sampleSize: number;
  summaryKo: string;
  evidence: Record<string, unknown>;
  affectedPickIds: string[];
}
