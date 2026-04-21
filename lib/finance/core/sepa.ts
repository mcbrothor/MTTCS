import type {
  AssessmentStatus,
  FundamentalSnapshot,
  OHLCData,
  SepaCriterion,
  SepaEvidence,
} from '../../../types/index.ts';
import { calculateRsMetrics } from '../market/rs-proxy.ts';
import { round } from './_shared.ts';
import { calculateAvgVolume, calculateMovingAverage } from './moving-average.ts';

function criterion(
  id: string,
  label: string,
  status: AssessmentStatus,
  actual: number | string | null,
  threshold: string,
  description: string
): SepaCriterion {
  return { id, label, status, actual, threshold, description };
}

function passFail(value: boolean): AssessmentStatus {
  return value ? 'pass' : 'fail';
}

function evaluableCriterion(
  id: string,
  label: string,
  actual: number | string | null,
  canEvaluate: boolean,
  value: boolean,
  threshold: string,
  description: string,
  missingDataMsg?: string
) {
  return criterion(
    id,
    label,
    canEvaluate ? passFail(value) : 'info',
    actual,
    canEvaluate ? threshold : `${threshold} (데이터 부족, 저장 차단 제외)`,
    canEvaluate ? description : (missingDataMsg || '필요한 가격 이력이 부족해 정보 항목으로만 표시합니다.')
  );
}

function calculateRsProxy(data: OHLCData[], benchmarkData?: OHLCData[]) {
  const rs = calculateRsMetrics(data, benchmarkData);
  return {
    ...rs,
    stockReturn: rs.stockReturn26Week,
    benchmarkReturn: rs.benchmarkReturn26Week,
    rsScore: rs.benchmarkRelativeScore,
  };
}

/**
 * 기본적 분석 필터 — 항상 info(참고 정보)로 처리.
 * Minervini SEPA 판정(pass/fail)에 영향을 주지 않고 UI 참고용으로만 노출합니다.
 */
function analyzeFundamentals(fundamentals?: FundamentalSnapshot | null) {
  if (!fundamentals) {
    return criterion(
      'fundamentals',
      'EPS/매출/ROE/부채 기본 필터',
      'info',
      '기본적 데이터 미제공',
      'EPS 20%+, 매출 15%+, ROE 17%+, 부채 40%-',
      '가격과 거래량 기반 SEPA 판정과 분리해 참고 정보로 표시합니다.'
    );
  }

  const knownValues = [
    fundamentals.epsGrowthPct,
    fundamentals.revenueGrowthPct,
    fundamentals.roePct,
    fundamentals.debtToEquityPct,
  ].filter((value) => value !== null);

  if (knownValues.length === 0) {
    return criterion(
      'fundamentals',
      'EPS/매출/ROE/부채 기본 필터',
      'info',
      '기본적 데이터 미제공',
      'EPS 20%+, 매출 15%+, ROE 17%+, 부채 40%-',
      '가격과 거래량 기반 SEPA 판정과 분리해 참고 정보로 표시합니다.'
    );
  }

  const items: string[] = [];
  if (fundamentals.epsGrowthPct !== null) {
    const ok = fundamentals.epsGrowthPct >= 20;
    items.push(`EPS ${fundamentals.epsGrowthPct}% ${ok ? '✅' : '⚠️'}`);
  } else {
    items.push('EPS —');
  }
  if (fundamentals.revenueGrowthPct !== null) {
    const ok = fundamentals.revenueGrowthPct >= 15;
    items.push(`매출 ${fundamentals.revenueGrowthPct}% ${ok ? '✅' : '⚠️'}`);
  } else {
    items.push('매출 —');
  }
  if (fundamentals.roePct !== null) {
    const ok = fundamentals.roePct >= 17;
    items.push(`ROE ${fundamentals.roePct}% ${ok ? '✅' : '⚠️'}`);
  } else {
    items.push('ROE —');
  }
  if (fundamentals.debtToEquityPct !== null) {
    const ok = fundamentals.debtToEquityPct <= 40;
    items.push(`부채 ${fundamentals.debtToEquityPct}% ${ok ? '✅' : '⚠️'}`);
  } else {
    items.push('부채 —');
  }

  const actual = items.join(', ');

  const sourceNote = knownValues.length < 4
    ? `${fundamentals.source}에서 일부 항목만 확인 — 참고용으로 표시합니다.`
    : `${fundamentals.source}에서 확인한 기본적 지표입니다. 저장을 차단하지 않으며 투자 판단의 참고용입니다.`;

  return criterion(
    'fundamentals',
    'EPS/매출/ROE/부채 기본 필터',
    'info',
    actual,
    'EPS 20%+, 매출 15%+, ROE 17%+, 부채 40%-',
    sourceNote
  );
}

export function analyzeSepa(
  data: OHLCData[],
  options: {
    benchmarkData?: OHLCData[];
    benchmarkTicker?: string | null;
    fundamentals?: FundamentalSnapshot | null;
    preCalculatedRs?: number;
  } = {}
): SepaEvidence {
  const last = data.at(-1);
  const lastClose = last?.close ?? null;
  const ma50 = calculateMovingAverage(data, 50);
  const ma150 = calculateMovingAverage(data, 150);
  const ma200 = calculateMovingAverage(data, 200);
  const ma200PrevMonth = data.length >= 221 ? calculateMovingAverage(data.slice(0, -21), 200) : null;
  const high52Week = data.length >= 252 ? round(Math.max(...data.slice(-252).map((d) => d.high))) : null;
  const distanceFromHigh52WeekPct =
    lastClose && high52Week ? round(((high52Week - lastClose) / high52Week) * 100) : null;
  const low52Week = data.length >= 252 ? round(Math.min(...data.slice(-252).map((d) => d.low))) : null;
  const distanceFromLow52WeekPct =
    lastClose && low52Week && low52Week > 0 ? round(((lastClose - low52Week) / low52Week) * 100) : null;
  const { avgDollarVolume } = calculateAvgVolume(data);
  const rs = calculateRsProxy(data, options.benchmarkData);

  const benchmarkLabel = (options.benchmarkTicker || 'SPY').replace('^KS200', 'KOSPI 200').replace('^KQ150', 'KOSDAQ 150').replace('^GSPC', 'S&P 500');

  const criteria: SepaCriterion[] = [
    evaluableCriterion(
      'price_gt_ma50',
      '현재가 > 50일 이동평균',
      ma50 ? `${round(lastClose ?? 0)} / MA50 ${ma50}` : null,
      lastClose !== null && ma50 !== null,
      Boolean(lastClose !== null && ma50 !== null && lastClose > ma50),
      '현재가가 50일선 위',
      '단기 추세가 살아 있는지 확인합니다.'
    ),
    evaluableCriterion(
      'price_gt_ma150',
      '현재가 > 150일 이동평균',
      ma150 ? `${round(lastClose ?? 0)} / MA150 ${ma150}` : null,
      lastClose !== null && ma150 !== null,
      Boolean(lastClose !== null && ma150 !== null && lastClose > ma150),
      '현재가가 150일선 위',
      '중기 추세 위에 있는 종목만 후보로 둡니다.'
    ),
    evaluableCriterion(
      'price_gt_ma200',
      '현재가 > 200일 이동평균',
      ma200 ? `${round(lastClose ?? 0)} / MA200 ${ma200}` : null,
      lastClose !== null && ma200 !== null,
      Boolean(lastClose !== null && ma200 !== null && lastClose > ma200),
      '현재가가 200일선 위',
      '장기 하락 추세 종목을 배제합니다.'
    ),
    evaluableCriterion(
      'ma50_gt_ma150',
      '50일선 > 150일선',
      ma50 && ma150 ? `${ma50} / ${ma150}` : null,
      ma50 !== null && ma150 !== null,
      Boolean(ma50 !== null && ma150 !== null && ma50 > ma150),
      'MA50이 MA150보다 높음',
      '단기 추세가 중기 추세보다 강한지 봅니다.'
    ),
    evaluableCriterion(
      'ma150_gt_ma200',
      '150일선 > 200일선',
      ma150 && ma200 ? `${ma150} / ${ma200}` : null,
      ma150 !== null && ma200 !== null,
      Boolean(ma150 !== null && ma200 !== null && ma150 > ma200),
      'MA150이 MA200보다 높음',
      '상승 추세의 정렬 상태를 확인합니다.'
    ),
    evaluableCriterion(
      'ma200_rising',
      '200일선 상승',
      ma200 && ma200PrevMonth ? `${ma200} / 1개월 전 ${ma200PrevMonth}` : null,
      ma200 !== null && ma200PrevMonth !== null,
      Boolean(ma200 !== null && ma200PrevMonth !== null && ma200 > ma200PrevMonth),
      '200일선이 최소 1개월 전보다 높음',
      '장기 추세가 우상향인지 확인합니다.'
    ),
    evaluableCriterion(
      'near_52w_high',
      '52주 고점 10% 이내',
      distanceFromHigh52WeekPct !== null ? `${distanceFromHigh52WeekPct}% 아래` : null,
      distanceFromHigh52WeekPct !== null,
      Boolean(distanceFromHigh52WeekPct !== null && distanceFromHigh52WeekPct <= 10),
      '52주 고점 대비 10% 이내 (오닐 표준)',
      '강한 종목이 고점 근처에서 신고가 돌파를 준비 중인지 확인합니다.'
    ),
    evaluableCriterion(
      'above_52w_low',
      '52주 저점 대비 +30% 이상',
      distanceFromLow52WeekPct !== null ? `+${distanceFromLow52WeekPct}%` : null,
      distanceFromLow52WeekPct !== null,
      Boolean(distanceFromLow52WeekPct !== null && distanceFromLow52WeekPct >= 30),
      '52주 저점 대비 +30% 이상 (미너비니 Stage 2)',
      '바닥에 묶여있는 종목이 템플릿을 통과하지 않도록 합니다.'
    ),
    criterion(
      'rs_rating',
      '상대강도 RS (주요 필터)',
      options.preCalculatedRs !== undefined ? passFail(options.preCalculatedRs >= 70) : (rs.rsScore !== null ? passFail(rs.rsScore >= 70) : 'info'),
      options.preCalculatedRs !== undefined
        ? `${options.preCalculatedRs}점 (DB 기준 공식 RS)`
        : (rs.rsScore !== null ? `${rs.rsScore}점 (종목 ${rs.stockReturn}%, ${benchmarkLabel} ${rs.benchmarkReturn}%)` : '벤치마크 데이터 부족'),
      '70점 이상 (권장)',
      options.preCalculatedRs !== undefined
        ? '데이터베이스에서 조회한 시장 전체 기준 공식 RS Rating입니다.'
        : `공식 RS Rating 대신 ${benchmarkLabel} 대비 6개월 초과수익률로 계산한 대체 지표입니다.`
    ),
    evaluableCriterion(
      'avg_dollar_volume',
      '20일 평균 거래대금',
      avgDollarVolume ? `$${avgDollarVolume.toLocaleString()}` : null,
      data.length >= 20,
      data.length >= 20 && avgDollarVolume >= 10_000_000,
      '$10,000,000 이상',
      '실제 거래가 활발하여 슬리피지 리스크가 낮은지 확인합니다.'
    ),
    (() => {
      const float = options.fundamentals?.floatShares;
      const price = lastClose;
      const dollarFloat = float && price ? float * price : null;
      return evaluableCriterion(
        'dollar_float',
        '유동 시총 (Dollar Float)',
        dollarFloat ? `$${(dollarFloat / 1_000_000_000).toFixed(2)}B` : '데이터 부족',
        Boolean(dollarFloat),
        Boolean(dollarFloat && dollarFloat <= 5_000_000_000),
        '$5B 이하 (매물 가벼움)',
        '유동물량이 너무 무거우면 상승에 큰 에너지가 필요합니다.',
        '펀더멘털 지표(유동주식수)가 부족해 정보 항목으로만 표시합니다.'
      );
    })(),
    analyzeFundamentals(options.fundamentals),
  ];

  const summary = {
    passed: criteria.filter((item) => item.status === 'pass').length,
    failed: criteria.filter((item) => item.status === 'fail').length,
    info: criteria.filter((item) => item.status === 'info').length,
    total: criteria.length,
  };

  let finalStatus: 'pass' | 'fail' | 'warning' = 'pass';
  if (summary.failed > 3) {
    finalStatus = 'fail';
  } else if (summary.failed > 0) {
    finalStatus = 'warning';
  }

  return {
    status: finalStatus,
    criteria,
    summary,
    metrics: {
      lastClose: lastClose ? round(lastClose) : null,
      ma50,
      ma150,
      ma200,
      high52Week,
      distanceFromHigh52WeekPct,
      low52Week,
      distanceFromLow52WeekPct,
      avgDollarVolume20: avgDollarVolume || null,
      rsRating: options.preCalculatedRs ?? rs.rsScore,
      rsSource: options.preCalculatedRs !== undefined ? 'UNIVERSE' : (rs.rsScore !== null ? 'BENCHMARK_PROXY' : null),
      internalRsRating: null,
      externalRsRating: null,
      rsRank: null,
      rsUniverseSize: null,
      rsPercentile: null,
      weightedMomentumScore: rs.weightedMomentumScore,
      ibdProxyScore: rs.ibdProxyScore,
      mansfieldRsFlag: rs.mansfieldRsFlag,
      mansfieldRsScore: rs.mansfieldRsScore,
      rsDataQuality: rs.rsDataQuality,
      macroActionLevel: null,
      benchmarkRelativeScore: rs.benchmarkRelativeScore,
      rsLineNewHigh: rs.rsLineNewHigh,
      rsLineNearHigh: rs.rsLineNearHigh,
      tennisBallCount: rs.tennisBallCount,
      tennisBallScore: rs.tennisBallScore,
      return3m: rs.return3m,
      return6m: rs.return6m,
      return9m: rs.return9m,
      return12m: rs.return12m,
      benchmarkReturn26Week: rs.benchmarkReturn,
      stockReturn26Week: rs.stockReturn,
    },
  };
}
