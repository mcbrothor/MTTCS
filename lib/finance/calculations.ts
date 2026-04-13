import type {
  AssessmentStatus,
  EntryTargets,
  FundamentalSnapshot,
  OHLCData,
  RiskPlan,
  SepaCriterion,
  SepaEvidence,
  TrailingStops,
} from '@/types';

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentReturn(data: OHLCData[], lookback: number) {
  if (data.length < lookback + 1) return null;
  const start = data[data.length - lookback - 1]?.close;
  const end = data.at(-1)?.close;
  if (!start || !end) return null;
  return round(((end - start) / start) * 100);
}

export function calculateMovingAverage(data: OHLCData[], period: number): number | null {
  if (data.length < period) return null;
  return round(average(data.slice(-period).map((d) => d.close)));
}

export function calculateATR(data: OHLCData[], period: number = 20): number {
  if (data.length < period + 1) return 0;

  const trueRanges = data.map((d, i) => {
    if (i === 0) return d.high - d.low;
    const prevClose = data[i - 1].close;
    return Math.max(
      d.high - d.low,
      Math.abs(d.high - prevClose),
      Math.abs(d.low - prevClose)
    );
  });

  return round(average(trueRanges.slice(-period)));
}

export function calculateAvgVolume(data: OHLCData[], period: number = 20): {
  avgDollarVolume: number;
  passesFilter: boolean;
} {
  if (data.length < period) return { avgDollarVolume: 0, passesFilter: false };

  const avgDollarVolume = average(data.slice(-period).map((d) => d.close * d.volume));
  return { avgDollarVolume: round(avgDollarVolume, 0), passesFilter: avgDollarVolume >= 10_000_000 };
}

export function calculateEntryPrice(data: OHLCData[], period: number = 20): number {
  if (data.length < period) return 0;
  return round(Math.max(...data.slice(-period).map((d) => d.high)));
}

export function calculatePositionSize(
  totalEquity: number,
  entryPrice: number,
  atr: number,
  riskPercent: number = 0.03,
  atrMultiplier: number = 2
): {
  maxRisk: number;
  stopLossPrice: number;
  shares: number;
  riskPerShare: number;
} {
  if (totalEquity <= 0 || atr <= 0 || entryPrice <= 0 || riskPercent <= 0) {
    return { maxRisk: 0, stopLossPrice: 0, shares: 0, riskPerShare: 0 };
  }

  const maxRisk = totalEquity * riskPercent;
  const stopLossPrice = entryPrice - atr * atrMultiplier;
  const riskPerShare = entryPrice - stopLossPrice;
  const shares = Math.max(0, Math.floor(maxRisk / riskPerShare));

  return {
    maxRisk: round(maxRisk),
    stopLossPrice: round(stopLossPrice),
    shares,
    riskPerShare: round(riskPerShare),
  };
}

export function calculatePyramidPlan(
  totalEquity: number,
  entryPrice: number,
  atr: number,
  riskPercent: number = 0.03
): RiskPlan {
  const position = calculatePositionSize(totalEquity, entryPrice, atr, riskPercent);
  const first = Math.ceil(position.shares / 3);
  const second = Math.ceil((position.shares - first) / 2);
  const third = Math.max(0, position.shares - first - second);

  const entryTargets: EntryTargets = {
    e1: { label: '1차 돌파 진입', price: round(entryPrice), shares: first },
    e2: { label: '2차 피라미딩', price: round(entryPrice + atr * 0.5), shares: second },
    e3: { label: '3차 피라미딩', price: round(entryPrice + atr), shares: third },
  };

  const trailingStops: TrailingStops = {
    initial: position.stopLossPrice,
    afterEntry2: round(entryTargets.e2.price - atr * 2),
    afterEntry3: round(entryTargets.e3.price - atr * 2),
  };

  return {
    totalEquity,
    maxRisk: position.maxRisk,
    riskPercent,
    atr: round(atr),
    entryPrice: round(entryPrice),
    stopLossPrice: position.stopLossPrice,
    riskPerShare: position.riskPerShare,
    totalShares: position.shares,
    entryTargets,
    trailingStops,
  };
}

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
  description: string
) {
  return criterion(
    id,
    label,
    canEvaluate ? passFail(value) : 'info',
    actual,
    canEvaluate ? threshold : `${threshold} (데이터 부족, 저장 차단 제외)`,
    canEvaluate ? description : '필요한 가격 이력이 부족해 정보 항목으로만 표시합니다.'
  );
}

function calculateRsProxy(data: OHLCData[], benchmarkData?: OHLCData[]) {
  const stockReturn = percentReturn(data, 126);
  const benchmarkReturn = benchmarkData ? percentReturn(benchmarkData, 126) : null;

  if (stockReturn === null || benchmarkReturn === null) {
    return { stockReturn, benchmarkReturn, rsScore: null };
  }

  const outperformance = stockReturn - benchmarkReturn;
  const rsScore = round(clamp(50 + outperformance * 1.5, 1, 99), 0);
  return { stockReturn, benchmarkReturn, rsScore };
}

/**
 * 기본적 분석 필터 — 항상 info(참고 정보)로 처리
 *
 * 왜 info인가?
 * - Minervini SEPA는 가격/거래량 기반 기술적 판정이 핵심입니다.
 * - 기본적 분석(EPS, 매출, ROE, 부채)은 보조 참고 자료이며,
 *   이것이 fail이라고 해서 기술적 진입 자체를 차단하는 것은 과도합니다.
 * - 세부항목별 충족 여부는 UI에서 개별 표시하여 유저 판단을 돕습니다.
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

  // 개별 항목 충족 여부를 이모지로 표시하여 가독성 향상
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

  // 항상 info로 반환 → SEPA 판정(pass/fail)에 영향을 주지 않음
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
    fundamentals?: FundamentalSnapshot | null;
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
  const { avgDollarVolume } = calculateAvgVolume(data);
  const rs = calculateRsProxy(data, options.benchmarkData);

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
      '52주 고점 25% 이내',
      distanceFromHigh52WeekPct !== null ? `${distanceFromHigh52WeekPct}% 아래` : null,
      distanceFromHigh52WeekPct !== null,
      Boolean(distanceFromHigh52WeekPct !== null && distanceFromHigh52WeekPct <= 25),
      '52주 고점 대비 25% 이내',
      '강한 종목이 고점 근처에서 쉬고 있는지 봅니다.'
    ),
    criterion(
      'rs_rating',
      '상대강도 RS 프록시 70 이상',
      rs.rsScore !== null ? passFail(rs.rsScore >= 70) : 'info',
      rs.rsScore !== null
        ? `${rs.rsScore}점 (종목 ${rs.stockReturn}%, SPY ${rs.benchmarkReturn}%)`
        : '벤치마크 데이터 부족',
      '6개월 상대강도 프록시 >= 70',
      '공식 RS Rating 대신 SPY 대비 6개월 초과수익률로 계산한 대체 지표입니다.'
    ),
    evaluableCriterion(
      'avg_dollar_volume',
      '20일 평균 거래대금',
      avgDollarVolume ? `$${avgDollarVolume.toLocaleString()}` : null,
      data.length >= 20,
      data.length >= 20 && avgDollarVolume >= 10_000_000,
      '$10,000,000 이상',
      '슬리피지와 체결 리스크가 낮은 유동성 종목인지 확인합니다.'
    ),
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
      avgDollarVolume20: avgDollarVolume || null,
      rsRating: rs.rsScore,
      benchmarkReturn26Week: rs.benchmarkReturn,
      stockReturn26Week: rs.stockReturn,
    },
  };
}
