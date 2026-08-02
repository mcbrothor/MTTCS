import crypto from 'node:crypto';
import type {
  DecisionReadiness,
  IntelligenceAnalysis,
  IntelligenceEvent,
  IntelligenceMarket,
  IntelligenceSeverity,
  IntelligenceSourceHealth,
  StoredIntelligenceEvent,
} from './types.ts';

export const INTELLIGENCE_MODEL_VERSION = 'market-intelligence-rules-2026.07-v1';
export const INGESTION_STALE_AFTER_SECONDS = 45 * 60;
export const EVENT_RISK_WINDOW_SECONDS = 6 * 60 * 60;

const RISK_PATTERNS = [
  /fomc statement/i,
  /economic projections/i,
  /emergency/i,
  /trading suspension/i,
  /market suspension/i,
  /통화정책방향/,
  /기준금리/,
  /긴급/,
  /거래정지/,
];

const WATCH_PATTERNS = [
  /minutes of the federal open market committee/i,
  /discount rate meeting/i,
  /inflation/i,
  /consumer price/i,
  /employment situation/i,
  /금융통화위원회.*의사록/,
  /물가/,
  /고용/,
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function compactText(value: unknown, maxLength = 600) {
  const text = String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function stableHash(...parts: unknown[]) {
  return crypto
    .createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('\u001f'))
    .digest('hex');
}

export function normalizePublishedAt(value: unknown, observedAt: string) {
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? observedAt : parsed.toISOString();
}

export function classifyHeadline(
  headline: string,
  defaultSeverity: IntelligenceSeverity,
) {
  if (RISK_PATTERNS.some((pattern) => pattern.test(headline))) return 'RISK' as const;
  if (WATCH_PATTERNS.some((pattern) => pattern.test(headline))) return 'WATCH' as const;
  return defaultSeverity;
}

export function buildSourceAnalysis(input: {
  whyItMatters: string;
  severity: IntelligenceSeverity;
}): IntelligenceAnalysis {
  return {
    modelVersion: INTELLIGENCE_MODEL_VERSION,
    methodology: 'SOURCE_AND_KEYWORD_RISK_ONLY',
    confidence: input.severity === 'RISK' ? 0.82 : input.severity === 'WATCH' ? 0.72 : 0.62,
    impact: 'UNKNOWN',
    whyItMatters: input.whyItMatters,
    requiresReview: true,
    limitations: [
      '원문 출처와 제목으로 중요도만 분류하며 호재·악재 방향을 자동 확정하지 않습니다.',
      '시장 예상치 대비 서프라이즈와 가격 반응은 별도 확인이 필요합니다.',
    ],
  };
}

export function buildIndicatorAnalysis(input: {
  whyItMatters: string;
  severity: IntelligenceSeverity;
  confidence?: number;
}): IntelligenceAnalysis {
  return {
    modelVersion: INTELLIGENCE_MODEL_VERSION,
    methodology: 'SEQUENTIAL_CHANGE_WITHOUT_CONSENSUS',
    confidence: clamp(input.confidence ?? 0.78, 0, 1),
    impact: 'UNKNOWN',
    whyItMatters: input.whyItMatters,
    requiresReview: true,
    limitations: [
      '직전 관측치 대비 변화만 계산하며 시장 컨센서스 대비 서프라이즈는 포함하지 않습니다.',
      '지표 개정치가 들어오면 동일 관측기간의 값이 갱신될 수 있습니다.',
    ],
  };
}

export function dedupeEvents(events: IntelligenceEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.source}\u001f${event.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function computeDecisionReadiness(input: {
  events: Array<Pick<StoredIntelligenceEvent, 'severity' | 'publishedAt'> &
    Partial<Pick<StoredIntelligenceEvent, 'firstSeenAt' | 'payload' | 'isRevision'>>>;
  lastSuccessfulIngestionAt: string | null;
  sourceHealth?: IntelligenceSourceHealth[];
  market?: IntelligenceMarket;
  now?: Date;
  staleAfterSeconds?: number;
}): DecisionReadiness {
  const now = input.now ?? new Date();
  const staleAfterSeconds = input.staleAfterSeconds ?? INGESTION_STALE_AFTER_SECONDS;
  const lastSuccessful = input.lastSuccessfulIngestionAt
    ? new Date(input.lastSuccessfulIngestionAt)
    : null;
  const ingestionAgeSeconds = lastSuccessful && !Number.isNaN(lastSuccessful.getTime())
    ? Math.max(0, Math.floor((now.getTime() - lastSuccessful.getTime()) / 1000))
    : null;

  const sourceHealth = input.sourceHealth ?? [];
  const unhealthySources = sourceHealth.filter((source) => source.status !== 'FRESH');

  if (unhealthySources.length > 0) {
    return {
      status: 'BLOCKED',
      advisoryRiskMultiplier: 0,
      reasons: unhealthySources.map((source) => {
        if (source.status === 'MISSING') return `${source.source} 수집 성공 이력이 없습니다.`;
        if (source.status === 'FAILED') return `${source.source} 최근 수집이 실패했습니다${source.error ? `: ${source.error}` : '.'}`;
        return `${source.source} 수집 지연이 SLA ${Math.floor(source.staleAfterSeconds / 60)}분을 초과했습니다.`;
      }),
      lastSuccessfulIngestionAt: input.lastSuccessfulIngestionAt,
      ingestionAgeSeconds,
      recentRiskEvents: 0,
      recentWatchEvents: 0,
      sourceHealth,
    };
  }

  if (sourceHealth.length === 0 && (ingestionAgeSeconds === null || ingestionAgeSeconds > staleAfterSeconds)) {
    return {
      status: 'BLOCKED',
      advisoryRiskMultiplier: 0,
      reasons: [ingestionAgeSeconds === null
        ? '실시간 인텔리전스 수집 성공 이력이 없습니다.'
        : `수집 지연이 SLA ${Math.floor(staleAfterSeconds / 60)}분을 초과했습니다.`],
      lastSuccessfulIngestionAt: input.lastSuccessfulIngestionAt,
      ingestionAgeSeconds,
      recentRiskEvents: 0,
      recentWatchEvents: 0,
      sourceHealth,
    };
  }

  const cutoff = now.getTime() - EVENT_RISK_WINDOW_SECONDS * 1000;
  const recent = input.events.filter((event) => {
    const timestampQuality = event.payload?.timestampQuality;
    const decisionTimestamp = (event.isRevision || timestampQuality === 'OBSERVATION_PERIOD_END') && event.firstSeenAt
      ? event.firstSeenAt
      : event.publishedAt;
    const timestamp = new Date(decisionTimestamp).getTime();
    return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now.getTime() + 60_000;
  });
  const recentRiskEvents = recent.filter((event) => event.severity === 'RISK').length;
  const recentWatchEvents = recent.filter((event) => event.severity === 'WATCH').length;

  if (recentRiskEvents > 0) {
    return {
      status: 'CAUTION',
      advisoryRiskMultiplier: 0.5,
      reasons: [`최근 6시간 내 고중요도 이벤트 ${recentRiskEvents}건을 원문 확인해야 합니다.`],
      lastSuccessfulIngestionAt: input.lastSuccessfulIngestionAt,
      ingestionAgeSeconds,
      recentRiskEvents,
      recentWatchEvents,
      sourceHealth,
    };
  }

  if (recentWatchEvents > 0) {
    return {
      status: 'CAUTION',
      advisoryRiskMultiplier: 0.75,
      reasons: [`최근 6시간 내 주의 이벤트 ${recentWatchEvents}건이 있습니다.`],
      lastSuccessfulIngestionAt: input.lastSuccessfulIngestionAt,
      ingestionAgeSeconds,
      recentRiskEvents,
      recentWatchEvents,
      sourceHealth,
    };
  }

  return {
    status: 'READY',
    advisoryRiskMultiplier: 1,
    reasons: ['수집 SLA가 정상이며 최근 고중요도 이벤트가 없습니다.'],
    lastSuccessfulIngestionAt: input.lastSuccessfulIngestionAt,
    ingestionAgeSeconds,
    recentRiskEvents,
    recentWatchEvents,
    sourceHealth,
  };
}
