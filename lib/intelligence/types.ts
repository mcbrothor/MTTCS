export type IntelligenceMarket = 'GLOBAL' | 'US' | 'KR';

export type IntelligenceEventType =
  | 'MACRO_RELEASE'
  | 'CENTRAL_BANK'
  | 'REGULATORY'
  | 'FILING'
  | 'EARNINGS'
  | 'NEWS';

export type IntelligenceSeverity = 'INFO' | 'WATCH' | 'RISK';
export type IntelligenceDirection = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'UNKNOWN';

export interface IntelligenceAnalysis {
  modelVersion: string;
  methodology: 'SOURCE_AND_KEYWORD_RISK_ONLY' | 'SEQUENTIAL_CHANGE_WITHOUT_CONSENSUS';
  confidence: number;
  impact: IntelligenceDirection;
  whyItMatters: string;
  requiresReview: boolean;
  limitations: string[];
}

export interface IntelligenceEvent {
  source: string;
  externalId: string;
  sourceTier: 'PRIMARY' | 'SECONDARY';
  market: IntelligenceMarket;
  eventType: IntelligenceEventType;
  severity: IntelligenceSeverity;
  direction: IntelligenceDirection;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  observedAt: string;
  symbols: string[];
  topics: string[];
  contentHash: string;
  payload: Record<string, unknown>;
  analysis: IntelligenceAnalysis;
}

export interface StoredIntelligenceEvent extends IntelligenceEvent {
  id: string;
  isRevision: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface IntelligenceSourceResult {
  source: string;
  status: 'SUCCESS' | 'FAILED';
  eventCount: number;
  error?: string;
}

export type DecisionReadinessStatus = 'READY' | 'CAUTION' | 'BLOCKED';

export interface IntelligenceSourceHealth {
  source: string;
  status: 'FRESH' | 'STALE' | 'FAILED' | 'MISSING';
  lastAttemptAt: string | null;
  lastSuccessfulAt: string | null;
  ageSeconds: number | null;
  staleAfterSeconds: number;
  error: string | null;
}

export interface DecisionReadiness {
  status: DecisionReadinessStatus;
  advisoryRiskMultiplier: 0 | 0.5 | 0.75 | 1;
  reasons: string[];
  lastSuccessfulIngestionAt: string | null;
  ingestionAgeSeconds: number | null;
  recentRiskEvents: number;
  recentWatchEvents: number;
  sourceHealth: IntelligenceSourceHealth[];
}

export interface IntelligenceFeedResponse {
  events: StoredIntelligenceEvent[];
  readiness: DecisionReadiness;
}
