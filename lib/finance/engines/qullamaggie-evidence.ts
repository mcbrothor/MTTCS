import type { OHLCData } from '@/types';
import type {
  QullamaggieAnalysis,
  QullamaggieSetup,
} from './qullamaggie-score';

export interface EvidenceRef {
  snapshotId: string | null;
  availability: 'ready' | 'legacy' | 'unavailable';
  asOfBarDate: string | null;
}

export type CriterionRole = 'required' | 'score' | 'context' | 'warning';
export type CriterionResult = 'pass' | 'fail' | 'unknown';

export interface RuleExpression {
  expression: string;
  targetSetup: QullamaggieSetup;
  operator: '>=' | '<=' | '==' | 'between' | 'in';
  thresholdText: string;
}

export interface MetricInput {
  name: string;
  value: number | boolean | string | null;
  unit?: string;
  periodBars?: number;
  description?: string;
}

export interface SetupCriterion {
  id: string;
  setup: QullamaggieSetup;
  name: string;
  role: CriterionRole;
  result: CriterionResult;
  actual: number | boolean | null;
  rule: RuleExpression;
  inputs: MetricInput[];
  annotationIds: string[];
}

export type AnnotationType =
  | 'price-line'
  | 'price-zone'
  | 'price-marker'
  | 'volume-window'
  | 'volume-average';

export interface BaseAnnotation {
  id: string;
  criterionId: string;
  type: AnnotationType;
  label: string;
  color: string;
}

export interface PriceLineAnnotation extends BaseAnnotation {
  type: 'price-line';
  startDate: string;
  endDate: string;
  price: number;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface PriceZoneAnnotation extends BaseAnnotation {
  type: 'price-zone';
  startDate: string;
  endDate: string;
  lowPrice: number;
  highPrice: number;
}

export interface PriceMarkerAnnotation extends BaseAnnotation {
  type: 'price-marker';
  date: string;
  price: number;
  shape: 'circle' | 'diamond' | 'triangleUp' | 'triangleDown';
}

export interface VolumeWindowAnnotation extends BaseAnnotation {
  type: 'volume-window';
  startDate: string;
  endDate: string;
}

export interface VolumeAverageAnnotation extends BaseAnnotation {
  type: 'volume-average';
  startDate: string;
  endDate: string;
  averageVolume: number;
}

export type SetupAnnotation =
  | PriceLineAnnotation
  | PriceZoneAnnotation
  | PriceMarkerAnnotation
  | VolumeWindowAnnotation
  | VolumeAverageAnnotation;

export interface BaseEvaluation {
  id: string;
  baseDays: number;
  startDate: string;
  endDate: string;
  pivotPrice: number;
  baseLow: number;
  baseRangePct: number;
  pullbackPct: number;
  priorMovePct: number | null;
  distanceToPivotPct: number;
  volumeDryUpRatio: number | null;
  higherLows: boolean;
  score: number;
  selected: boolean;
  selectionReason: string;
}

export interface ScoreContribution {
  name: string;
  key: string;
  score: number;
  weightPct: number;
  weightedScore: number;
  detail: string;
}

export interface SetupEvidenceSnapshot {
  schemaVersion: '1';
  snapshotId: string;
  symbol: {
    ticker: string;
    exchange: string;
    currency: string;
  };
  provenance: {
    engineVersion: string;
    paramsHash: string;
    provider: string;
    adjustment: 'adjusted' | 'unadjusted' | 'unknown';
    timeframe: '1d';
    exchangeTimezone: string;
    asOfBarDate: string;
    calculatedAt: string;
    barStatus: 'closed' | 'partial' | 'unknown';
    barsHash: string;
    barCount: number;
  };
  bars: OHLCData[];
  analysis: QullamaggieAnalysis;
  decision: {
    primarySetup: QullamaggieSetup;
    matchedSetups: QullamaggieSetup[];
    selectedBranchIds: string[];
    selectedBaseId: string | null;
    selectionReason: string;
  };
  baseCandidates: BaseEvaluation[];
  criteria: SetupCriterion[];
  annotations: SetupAnnotation[];
  scoreTrace: ScoreContribution[];
}

export function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export interface BuildEvidenceOptions {
  market?: 'US' | 'KR';
  exchange?: string;
  ticker?: string;
  provider?: string;
}

/**
 * 쿨라매기 엔진의 계산 결과와 OHLCV 데이터로부터
 * 불변 SetupEvidenceSnapshot 객체를 구축합니다.
 */
export function buildQullamaggieEvidenceSnapshot(
  data: OHLCData[],
  analysis: QullamaggieAnalysis,
  options: BuildEvidenceOptions = {},
): SetupEvidenceSnapshot {
  const ticker = options.ticker || 'UNKNOWN';
  const exchange = options.exchange || (options.market === 'KR' ? 'KOSPI' : 'US');
  const currency = exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'KRW' : 'USD';
  const market = options.market ?? (exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'KR' : 'US');
  const provider = options.provider || 'MTN';

  const len = data.length;
  const lastBar = data[len - 1];
  const asOfBarDate = lastBar?.date || new Date().toISOString().slice(0, 10);
  const calculatedAt = new Date().toISOString();

  // Bars hash
  const barsContent = data.map((b) => `${b.date}:${b.close}:${b.volume}`).join('|');
  const barsHash = simpleHash(barsContent);
  const snapshotId = `qev_${ticker}_${asOfBarDate.replace(/-/g, '')}_${barsHash.slice(0, 8)}`;

  // 1. Base 후보군 평가 재현 (10, 15, 20, 30, 45)
  const baseCandidates: BaseEvaluation[] = [];
  const candidateDays = [10, 15, 20, 30, 45];
  let selectedBaseId: string | null = null;

  for (const bDays of candidateDays) {
    if (len < bDays + 25) continue;
    const baseSlice = data.slice(len - bDays - 1, len - 1);
    if (baseSlice.length < bDays) continue;

    const highs = baseSlice.map((b) => b.high);
    const lows = baseSlice.map((b) => b.low);
    const pPrice = Math.max(...highs);
    const bLow = Math.min(...lows);
    if (pPrice <= 0 || bLow <= 0) continue;

    const bRangePct = Math.round(((pPrice - bLow) / bLow) * 10000) / 100;
    const pPullbackPct = Math.round(((pPrice - bLow) / pPrice) * 10000) / 100;
    const distToPivot = Math.round(((lastBar.close - pPrice) / pPrice) * 10000) / 100;

    const priorSlice = data.slice(Math.max(0, len - bDays - 75), len - bDays - 1);
    const priorLow = priorSlice.length > 0 ? Math.min(...priorSlice.map((b) => b.low)) : null;
    const priorMove = priorLow && priorLow > 0 ? Math.round(((pPrice - priorLow) / priorLow) * 10000) / 100 : null;

    const half = Math.floor(baseSlice.length / 2);
    const firstHalf = baseSlice.slice(0, half);
    const secondHalf = baseSlice.slice(half);
    const higherLows = firstHalf.length > 0 && secondHalf.length > 0
      ? Math.min(...secondHalf.map((b) => b.low)) >= Math.min(...firstHalf.map((b) => b.low)) * 0.98
      : false;

    const recentVol = baseSlice.slice(-Math.min(8, baseSlice.length));
    const olderVol = data.slice(Math.max(0, len - bDays - 35), len - bDays - 1);
    const recentAvg = recentVol.reduce((s, b) => s + b.volume, 0) / Math.max(1, recentVol.length);
    const olderAvg = olderVol.reduce((s, b) => s + b.volume, 0) / Math.max(1, olderVol.length);
    const dryUpRatio = olderAvg > 0 ? Math.round((recentAvg / olderAvg) * 100) / 100 : null;

    const rangeScore = bRangePct <= 15 ? 100 : bRangePct <= 25 ? 78 : bRangePct <= 35 ? 58 : 25;
    const pullbackScore = pPullbackPct <= 18 ? 100 : pPullbackPct <= 28 ? 72 : pPullbackPct <= 38 ? 45 : 15;
    const dryUpScore = dryUpRatio === null ? 50 : dryUpRatio <= 0.65 ? 100 : dryUpRatio <= 0.85 ? 78 : dryUpRatio <= 1 ? 55 : 25;
    const pivotScore = distToPivot >= 0 && distToPivot <= 3
      ? 100
      : distToPivot >= -3 && distToPivot < 0
        ? 88
        : distToPivot > 3 && distToPivot <= 6
          ? 65
          : distToPivot >= -6 && distToPivot < -3
            ? 60
            : 20;

    const cScore = Math.round(
      rangeScore * 0.25 +
      pullbackScore * 0.2 +
      dryUpScore * 0.2 +
      pivotScore * 0.25 +
      (higherLows ? 100 : 35) * 0.1,
    );

    const isSelected = analysis.baseDays === bDays;
    const candidateId = `base_${bDays}d`;
    if (isSelected) selectedBaseId = candidateId;

    baseCandidates.push({
      id: candidateId,
      baseDays: bDays,
      startDate: baseSlice[0].date,
      endDate: baseSlice[baseSlice.length - 1].date,
      pivotPrice: Math.round(pPrice * 100) / 100,
      baseLow: Math.round(bLow * 100) / 100,
      baseRangePct: bRangePct,
      pullbackPct: pPullbackPct,
      priorMovePct: priorMove,
      distanceToPivotPct: distToPivot,
      volumeDryUpRatio: dryUpRatio,
      higherLows,
      score: cScore,
      selected: isSelected,
      selectionReason: isSelected
        ? `종합 베이스 점수 ${cScore}점으로 최적 베이스 선정`
        : `베이스 점수 ${cScore}점 (선정 후보 대비 탈락)`,
    });
  }

  // 2. 어노테이션 및 조건(Criteria) 생성
  const criteria: SetupCriterion[] = [];
  const annotations: SetupAnnotation[] = [];

  // 선택된 베이스 어노테이션
  const selectedBase = baseCandidates.find((c) => c.selected);
  if (selectedBase) {
    const baseZoneId = 'anno_base_zone';
    const pivotLineId = 'anno_pivot_line';

    annotations.push({
      id: baseZoneId,
      criterionId: 'crit_base_consolidation',
      type: 'price-zone',
      label: `${selectedBase.baseDays}봉 베이스 (${selectedBase.baseRangePct}%)`,
      color: 'rgba(56, 189, 248, 0.15)',
      startDate: selectedBase.startDate,
      endDate: selectedBase.endDate,
      lowPrice: selectedBase.baseLow,
      highPrice: selectedBase.pivotPrice,
    });

    annotations.push({
      id: pivotLineId,
      criterionId: 'crit_pivot_proximity',
      type: 'price-line',
      label: `피벗: ${selectedBase.pivotPrice}`,
      color: '#38bdf8',
      startDate: selectedBase.startDate,
      endDate: asOfBarDate,
      price: selectedBase.pivotPrice,
      style: 'solid',
    });

    // 베이스 기간 거래량 음영
    const volWindowId = 'anno_vol_base_window';
    annotations.push({
      id: volWindowId,
      criterionId: 'crit_volume_dryup',
      type: 'volume-window',
      label: '베이스 거래량 수축 구간',
      color: 'rgba(148, 163, 184, 0.2)',
      startDate: selectedBase.startDate,
      endDate: selectedBase.endDate,
    });
  }

  // 판정봉 마커
  const evalMarkerId = 'anno_eval_bar_marker';
  annotations.push({
    id: evalMarkerId,
    criterionId: 'crit_evaluation_bar',
    type: 'price-marker',
    label: `판정봉 (${lastBar.close})`,
    color: '#10b981',
    date: asOfBarDate,
    price: lastBar.close,
    shape: 'diamond',
  });

  // Criteria 리스트 구성
  // C1: 선행 상승 (Prior Move)
  const priorMin = market === 'KR' ? 20 : 30;
  const actualPrior = analysis.priorMovePct;
  const priorPass = actualPrior !== null && actualPrior >= priorMin;
  criteria.push({
    id: 'crit_prior_move',
    setup: 'BREAKOUT',
    name: '선행 상승 추세 (Prior Move)',
    role: 'required',
    result: priorPass ? 'pass' : actualPrior === null ? 'unknown' : 'fail',
    actual: actualPrior,
    rule: {
      expression: `priorMovePct >= ${priorMin}%`,
      targetSetup: 'BREAKOUT',
      operator: '>=',
      thresholdText: `${market} 기준 ${priorMin}% 이상`,
    },
    inputs: [
      { name: '실제 선행 상승률', value: actualPrior, unit: '%' },
      { name: '기준 임계값', value: priorMin, unit: '%' },
    ],
    annotationIds: selectedBase ? ['anno_base_zone'] : [],
  });

  // C2: 베이스 횡보 및 변동폭 (Base Range & Pullback)
  const baseRange = analysis.baseRangePct;
  const pullback = analysis.pullbackPct;
  const basePass = Boolean(baseRange !== null && baseRange <= 38 && pullback !== null && pullback <= 38);
  criteria.push({
    id: 'crit_base_consolidation',
    setup: 'BREAKOUT',
    name: '베이스 수축폭 (Range & Pullback)',
    role: 'required',
    result: basePass ? 'pass' : 'fail',
    actual: baseRange,
    rule: {
      expression: 'baseRangePct <= 38% AND pullbackPct <= 38%',
      targetSetup: 'BREAKOUT',
      operator: '<=',
      thresholdText: '변동폭 38% 이하',
    },
    inputs: [
      { name: '베이스 기간', value: analysis.baseDays, unit: '봉' },
      { name: '베이스 Range', value: baseRange, unit: '%' },
      { name: '풀백폭', value: pullback, unit: '%' },
    ],
    annotationIds: ['anno_base_zone'],
  });

  // C3: 피벗 근접도 (Distance to Pivot)
  const distPivot = analysis.distanceToPivotPct;
  const distPass = Boolean(distPivot !== null && distPivot >= -6 && distPivot <= 6);
  criteria.push({
    id: 'crit_pivot_proximity',
    setup: 'BREAKOUT',
    name: '피벗 근접도 (Distance to Pivot)',
    role: 'required',
    result: distPass ? 'pass' : 'fail',
    actual: distPivot,
    rule: {
      expression: '-6% <= distanceToPivotPct <= +6%',
      targetSetup: 'BREAKOUT',
      operator: 'between',
      thresholdText: '피벗 대비 -6% ~ +6% 구간',
    },
    inputs: [
      { name: '피벗 가격', value: analysis.pivotPrice, unit: currency },
      { name: '현재가', value: analysis.currentPrice, unit: currency },
      { name: '피벗 이격도', value: distPivot, unit: '%' },
    ],
    annotationIds: ['anno_pivot_line', evalMarkerId],
  });

  // C4: 추세 점수 (Trend Quality)
  const trend = analysis.breakdown.trendQuality;
  const trendPass = trend >= 65;
  criteria.push({
    id: 'crit_trend_quality',
    setup: 'BREAKOUT',
    name: '이평선 추세 배열 (Trend Score)',
    role: 'required',
    result: trendPass ? 'pass' : 'fail',
    actual: trend,
    rule: {
      expression: 'trendScore >= 65',
      targetSetup: 'BREAKOUT',
      operator: '>=',
      thresholdText: '추세 점수 65점 이상 (MA10/20/50 정배열 지지)',
    },
    inputs: [
      { name: '추세 점수', value: trend, unit: '점' },
    ],
    annotationIds: [evalMarkerId],
  });

  // C5: 유동성 기준 (Liquidity)
  const minPrice = market === 'KR' ? 1000 : 5;
  const minAvgVol = market === 'KR' ? 100000 : 300000;
  const minDollarVol = market === 'KR' ? 3000000000 : 20000000;
  const liquidPass = Boolean(
    (analysis.currentPrice ?? 0) >= minPrice &&
    (analysis.dollarVolume20d ?? 0) >= minDollarVol,
  );
  criteria.push({
    id: 'crit_liquidity',
    setup: 'BREAKOUT',
    name: '유동성 및 거래대금 (Liquidity Gate)',
    role: 'required',
    result: liquidPass ? 'pass' : 'fail',
    actual: analysis.dollarVolume20d,
    rule: {
      expression: `price >= ${minPrice} AND dollarVolume20d >= ${minDollarVol.toLocaleString()}`,
      targetSetup: 'BREAKOUT',
      operator: '>=',
      thresholdText: `${market} 기준 최소 가격 및 일일 거래대금 통과`,
    },
    inputs: [
      { name: '현재가', value: analysis.currentPrice, unit: currency },
      { name: '20일 평균 거래대금', value: analysis.dollarVolume20d, unit: currency },
    ],
    annotationIds: [],
  });

  // C6: 거래량 마름 (Volume Dry-up - 가점)
  const dryUp = selectedBase?.volumeDryUpRatio ?? null;
  const dryUpPass = dryUp !== null && dryUp <= 0.85;
  criteria.push({
    id: 'crit_volume_dryup',
    setup: 'BREAKOUT',
    name: '베이스 거래량 감소 (Dry-up 가점)',
    role: 'score',
    result: dryUpPass ? 'pass' : 'fail',
    actual: dryUp,
    rule: {
      expression: 'volumeDryUpRatio <= 0.85',
      targetSetup: 'BREAKOUT',
      operator: '<=',
      thresholdText: '선행 대비 베이스 최근 거래량 85% 이하',
    },
    inputs: [
      { name: '거래량 감소율', value: dryUp, unit: '배' },
    ],
    annotationIds: ['anno_vol_base_window'],
  });

  // C7: 저점 지지 구조 (Higher Lows - 가점)
  const higherLows = selectedBase?.higherLows ?? false;
  criteria.push({
    id: 'crit_higher_lows',
    setup: 'BREAKOUT',
    name: '전후반 저점 지지 (Higher Lows 가점)',
    role: 'score',
    result: higherLows ? 'pass' : 'fail',
    actual: higherLows,
    rule: {
      expression: 'secondHalfLow >= firstHalfLow * 0.98',
      targetSetup: 'BREAKOUT',
      operator: '>=',
      thresholdText: '베이스 후반부 최저가가 전반부 대비 지지',
    },
    inputs: [
      { name: '저점 지지 구조 충족', value: higherLows },
    ],
    annotationIds: ['anno_base_zone'],
  });

  // C8: EP 후보 조건
  const epGapMin = market === 'KR' ? 6 : 10;
  const epPass = Boolean(
    analysis.gapPct !== null &&
    analysis.gapPct >= epGapMin &&
    (analysis.rvol20 ?? 0) >= 3 &&
    (analysis.closeLocationPct ?? 0) >= 55,
  );
  criteria.push({
    id: 'crit_ep_setup',
    setup: 'EP',
    name: 'Episodic Pivot (시가 갭 & 대량 거래)',
    role: 'required',
    result: epPass ? 'pass' : 'fail',
    actual: analysis.gapPct,
    rule: {
      expression: `gapPct >= ${epGapMin}% AND rvol20 >= 3x AND closeLocationPct >= 55%`,
      targetSetup: 'EP',
      operator: '>=',
      thresholdText: `갭 ${epGapMin}% 이상, RVOL 3배 이상, 캔들 상단 55% 마감`,
    },
    inputs: [
      { name: '시가 갭', value: analysis.gapPct, unit: '%' },
      { name: 'RVOL (20일 대비)', value: analysis.rvol20, unit: '배' },
      { name: '종가 위치', value: analysis.closeLocationPct, unit: '%' },
    ],
    annotationIds: [evalMarkerId],
  });

  // C9: 과열 경고 (Parabolic Warning)
  const isParabolic = analysis.setupFlags.includes('PARABOLIC_WARNING');
  criteria.push({
    id: 'crit_parabolic_warning',
    setup: 'PARABOLIC_WARNING',
    name: '단기 과열 경고 (Parabolic Warning)',
    role: 'warning',
    result: isParabolic ? 'pass' : 'fail',
    actual: isParabolic,
    rule: {
      expression: '5d >= 45% OR 10d >= 75% OR 20d >= 120% OR price > MA10*1.35',
      targetSetup: 'PARABOLIC_WARNING',
      operator: '==',
      thresholdText: '단기 급등 이격 과열 여부',
    },
    inputs: [
      { name: '과열 플래그 활성', value: isParabolic },
    ],
    annotationIds: [],
  });

  // 3. 점수 기여도 트레이스 (Score Trace)
  const scoreTrace: ScoreContribution[] = [
    {
      name: '상대 강도 (RS / 수익률)',
      key: 'relativeStrength',
      score: analysis.breakdown.relativeStrength,
      weightPct: 25,
      weightedScore: Math.round(analysis.breakdown.relativeStrength * 0.25 * 10) / 10,
      detail: `1M(${analysis.return1mPct}%), 3M(${analysis.return3mPct}%), 6M(${analysis.return6mPct}%) 반영`,
    },
    {
      name: '베이스 품질 (Base Quality)',
      key: 'baseQuality',
      score: analysis.breakdown.baseQuality,
      weightPct: 25,
      weightedScore: Math.round(analysis.breakdown.baseQuality * 0.25 * 10) / 10,
      detail: selectedBase ? `${selectedBase.baseDays}봉 베이스 종합 평점` : '베이스 미달',
    },
    {
      name: '피벗 근접도 (Pivot Proximity)',
      key: 'pivotProximity',
      score: analysis.breakdown.pivotProximity,
      weightPct: 20,
      weightedScore: Math.round(analysis.breakdown.pivotProximity * 0.20 * 10) / 10,
      detail: `피벗 이격 ${analysis.distanceToPivotPct}%`,
    },
    {
      name: '거래량 & 유동성 (Volume)',
      key: 'volumeLiquidity',
      score: analysis.breakdown.volumeLiquidity,
      weightPct: 15,
      weightedScore: Math.round(analysis.breakdown.volumeLiquidity * 0.15 * 10) / 10,
      detail: `RVOL ${analysis.rvol20 ?? 0}x, 거래대금 점수 반영`,
    },
    {
      name: '이평선 추세 품질 (Trend)',
      key: 'trendQuality',
      score: analysis.breakdown.trendQuality,
      weightPct: 10,
      weightedScore: Math.round(analysis.breakdown.trendQuality * 0.10 * 10) / 10,
      detail: 'MA10, MA20, MA50 지지 및 정배열 점수',
    },
    {
      name: '모멘텀 / 촉매 프록시 (Catalyst)',
      key: 'catalystProxy',
      score: analysis.breakdown.catalystProxy,
      weightPct: 5,
      weightedScore: Math.round(analysis.breakdown.catalystProxy * 0.05 * 10) / 10,
      detail: analysis.primarySetup === 'EP' ? 'EP 가산' : '일반 돌파 프록시',
    },
  ];

  return {
    schemaVersion: '1',
    snapshotId,
    symbol: {
      ticker,
      exchange,
      currency,
    },
    provenance: {
      engineVersion: 'qullamaggie-v1.1-evidence',
      paramsHash: simpleHash(JSON.stringify({ market, minPrice, minAvgVol, minDollarVol })),
      provider,
      adjustment: 'adjusted',
      timeframe: '1d',
      exchangeTimezone: market === 'KR' ? 'Asia/Seoul' : 'America/New_York',
      asOfBarDate,
      calculatedAt,
      barStatus: 'closed',
      barsHash,
      barCount: len,
    },
    bars: data,
    analysis,
    decision: {
      primarySetup: analysis.primarySetup,
      matchedSetups: analysis.setupFlags,
      selectedBranchIds: criteria.filter((c) => c.result === 'pass').map((c) => c.id),
      selectedBaseId,
      selectionReason: `${analysis.primarySetup} (${analysis.grade} 등급, Q-Score ${analysis.qScore})`,
    },
    baseCandidates,
    criteria,
    annotations,
    scoreTrace,
  };
}
