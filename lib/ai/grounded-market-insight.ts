import type {
  AiInsightEvidence,
  GroundedMarketInsight,
  GroundedMarketInsightActionCode,
  GroundedMarketInsightValidation,
  MasterFilterMetricDetail,
} from '@/types';

export const MARKET_INSIGHT_EVIDENCE_KEYS = [
  'trend',
  'breadth',
  'volatility',
  'adr',
  'distribution',
  'ftd',
  'newHighLow',
  'sectorRotation',
  'totalScore',
] as const;

const STANCES = new Set(['NORMAL', 'CAUTIOUS', 'DEFENSIVE']);
const ACTION_CODES = new Set(['SCAN_NORMALLY', 'REDUCE_POSITION_SIZE', 'PAUSE_NEW_BUYS']);
const EXACT_KEYS = new Set(['schemaVersion', 'headline', 'stance', 'evidenceKeys', 'actionCode', 'commentary']);
const NUMERIC_TEXT = /[0-9\uFF10-\uFF19]/u;

const ACTION_TEXT: Record<GroundedMarketInsightActionCode, string> = {
  SCAN_NORMALLY: '계획한 종목을 정상 비중 범위에서 검토합니다.',
  REDUCE_POSITION_SIZE: '신규 포지션 크기를 줄이고 실패 신호에 빠르게 대응합니다.',
  PAUSE_NEW_BUYS: '신규 매수를 멈추고 현금과 기존 포지션 방어를 우선합니다.',
};

interface MetricCatalogInput {
  trend: MasterFilterMetricDetail;
  breadth: MasterFilterMetricDetail;
  volatility: MasterFilterMetricDetail;
  adr?: MasterFilterMetricDetail;
  distribution: MasterFilterMetricDetail;
  ftd: MasterFilterMetricDetail;
  newHighLow: MasterFilterMetricDetail;
  sectorRotation: MasterFilterMetricDetail;
  totalScore: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function metricEvidence(key: string, metric: MasterFilterMetricDetail): AiInsightEvidence {
  return {
    key,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    threshold: metric.threshold,
    source: metric.source,
  };
}

export function buildMarketInsightEvidenceCatalog(metrics: MetricCatalogInput): AiInsightEvidence[] {
  const catalog = [
    metricEvidence('trend', metrics.trend),
    metricEvidence('breadth', metrics.breadth),
    metricEvidence('volatility', metrics.volatility),
    ...(metrics.adr ? [metricEvidence('adr', metrics.adr)] : []),
    metricEvidence('distribution', metrics.distribution),
    metricEvidence('ftd', metrics.ftd),
    metricEvidence('newHighLow', metrics.newHighLow),
    metricEvidence('sectorRotation', metrics.sectorRotation),
    {
      key: 'totalScore',
      label: '종합 점수',
      value: metrics.totalScore,
      unit: 'score',
      threshold: null,
      source: 'MTN',
    },
  ];
  return catalog;
}

export function validateGroundedMarketInsight(
  payload: unknown,
  knownEvidenceKeys: ReadonlySet<string>,
): GroundedMarketInsight {
  if (!isRecord(payload)) throw new Error('Insight must be a JSON object.');

  const unexpectedKeys = Object.keys(payload).filter((key) => !EXACT_KEYS.has(key));
  const missingKeys = Array.from(EXACT_KEYS).filter((key) => !(key in payload));
  if (unexpectedKeys.length > 0 || missingKeys.length > 0) {
    throw new Error(`Insight schema mismatch (missing: ${missingKeys.join(', ') || 'none'}; unexpected: ${unexpectedKeys.join(', ') || 'none'}).`);
  }
  if (payload.schemaVersion !== '1') throw new Error('Unsupported insight schemaVersion.');
  if (typeof payload.headline !== 'string' || !payload.headline.trim() || payload.headline.length > 80) {
    throw new Error('Insight headline must be a non-empty string of at most 80 characters.');
  }
  if (typeof payload.commentary !== 'string' || !payload.commentary.trim() || payload.commentary.length > 800) {
    throw new Error('Insight commentary must be a non-empty string of at most 800 characters.');
  }
  if (NUMERIC_TEXT.test(payload.commentary)) {
    throw new Error('Insight commentary must not contain numeric claims; cite evidenceKeys instead.');
  }
  if (typeof payload.stance !== 'string' || !STANCES.has(payload.stance)) throw new Error('Invalid insight stance.');
  if (typeof payload.actionCode !== 'string' || !ACTION_CODES.has(payload.actionCode)) throw new Error('Invalid insight actionCode.');
  if (!Array.isArray(payload.evidenceKeys) || payload.evidenceKeys.length === 0) {
    throw new Error('Insight evidenceKeys must contain at least one known metric key.');
  }
  if (payload.evidenceKeys.some((key) => typeof key !== 'string' || !knownEvidenceKeys.has(key))) {
    throw new Error('Insight contains an unknown evidence key.');
  }

  return {
    schemaVersion: '1',
    headline: payload.headline.trim(),
    stance: payload.stance as GroundedMarketInsight['stance'],
    evidenceKeys: Array.from(new Set(payload.evidenceKeys as string[])),
    actionCode: payload.actionCode as GroundedMarketInsightActionCode,
    commentary: payload.commentary.trim(),
  };
}

export function renderGroundedMarketInsight(
  insight: GroundedMarketInsight,
  evidenceCatalog: AiInsightEvidence[],
): string {
  const byKey = new Map(evidenceCatalog.map((item) => [item.key, item]));
  const evidenceLines = insight.evidenceKeys
    .map((key) => byKey.get(key))
    .filter((item): item is AiInsightEvidence => Boolean(item))
    .map((item) => {
      const unit = item.unit && item.unit !== 'binary' && item.unit !== 'status' ? item.unit : '';
      const threshold = item.threshold === null || item.threshold === '' ? '' : ` / 기준 ${String(item.threshold)}`;
      return `• ${item.label}: ${String(item.value ?? '데이터 없음')}${unit}${threshold}`;
    });

  return [
    insight.headline,
    insight.commentary,
    ACTION_TEXT[insight.actionCode],
    ...evidenceLines,
  ].filter(Boolean).join('\n\n');
}

export function buildRuleBasedGroundedInsight(marketState: string): GroundedMarketInsight {
  if (marketState === 'GREEN') {
    return {
      schemaVersion: '1',
      headline: '시장 환경이 우호적입니다',
      stance: 'NORMAL',
      evidenceKeys: ['trend', 'breadth', 'sectorRotation'],
      actionCode: 'SCAN_NORMALLY',
      commentary: '시장 내부 강도와 섹터 흐름을 확인하며 돌파 후보를 선별합니다.',
    };
  }
  if (marketState === 'RED') {
    return {
      schemaVersion: '1',
      headline: '시장 방어가 우선입니다',
      stance: 'DEFENSIVE',
      evidenceKeys: ['trend', 'breadth', 'distribution', 'volatility'],
      actionCode: 'PAUSE_NEW_BUYS',
      commentary: '시장 압력이 높아 공격적인 진입보다 기존 위험을 낮추는 대응이 필요합니다.',
    };
  }
  return {
    schemaVersion: '1',
    headline: '선별적인 대응이 필요합니다',
    stance: 'CAUTIOUS',
    evidenceKeys: ['trend', 'breadth', 'distribution'],
    actionCode: 'REDUCE_POSITION_SIZE',
    commentary: '상승 시도와 위험 신호가 함께 나타나므로 확인된 기회만 신중하게 다룹니다.',
  };
}

export function validationResult(
  status: GroundedMarketInsightValidation['status'],
  rejectionReasons: string[] = [],
): GroundedMarketInsightValidation {
  return { status, rejectionReasons };
}
