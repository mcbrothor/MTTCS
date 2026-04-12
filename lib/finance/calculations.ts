import type {
  AssessmentStatus,
  EntryTargets,
  OHLCData,
  RiskPlan,
  SepaCriterion,
  SepaEvidence,
  TrailingStops,
} from '@/types';

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  riskPercent: number = 0.01,
  atrMultiplier: number = 2
): {
  maxRisk: number;
  stopLossPrice: number;
  shares: number;
  riskPerShare: number;
} {
  if (totalEquity <= 0 || atr <= 0 || entryPrice <= 0) {
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

export function calculatePyramidPlan(totalEquity: number, entryPrice: number, atr: number): RiskPlan {
  const position = calculatePositionSize(totalEquity, entryPrice, atr);
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
    riskPercent: 0.01,
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

function passFail(value: boolean | null): AssessmentStatus {
  if (value === null) return 'unknown';
  return value ? 'pass' : 'fail';
}

export function analyzeSepa(data: OHLCData[]): SepaEvidence {
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

  const criteria: SepaCriterion[] = [
    criterion(
      'price_gt_ma50',
      '현재가 > 50일 이동평균',
      passFail(lastClose !== null && ma50 !== null ? lastClose > ma50 : null),
      ma50 ? `${round(lastClose ?? 0)} / MA50 ${ma50}` : null,
      '현재가가 50일선 위',
      '단기 추세가 살아 있는지 확인합니다.'
    ),
    criterion(
      'price_gt_ma150',
      '현재가 > 150일 이동평균',
      passFail(lastClose !== null && ma150 !== null ? lastClose > ma150 : null),
      ma150 ? `${round(lastClose ?? 0)} / MA150 ${ma150}` : null,
      '현재가가 150일선 위',
      '중기 추세 위에 있는 종목만 후보로 둡니다.'
    ),
    criterion(
      'price_gt_ma200',
      '현재가 > 200일 이동평균',
      passFail(lastClose !== null && ma200 !== null ? lastClose > ma200 : null),
      ma200 ? `${round(lastClose ?? 0)} / MA200 ${ma200}` : null,
      '현재가가 200일선 위',
      '장기 하락 추세 종목을 배제합니다.'
    ),
    criterion(
      'ma50_gt_ma150',
      '50일선 > 150일선',
      passFail(ma50 !== null && ma150 !== null ? ma50 > ma150 : null),
      ma50 && ma150 ? `${ma50} / ${ma150}` : null,
      'MA50이 MA150보다 높음',
      '단기 추세가 중기 추세보다 강한지 봅니다.'
    ),
    criterion(
      'ma150_gt_ma200',
      '150일선 > 200일선',
      passFail(ma150 !== null && ma200 !== null ? ma150 > ma200 : null),
      ma150 && ma200 ? `${ma150} / ${ma200}` : null,
      'MA150이 MA200보다 높음',
      '상승 추세의 정렬 상태를 확인합니다.'
    ),
    criterion(
      'ma200_rising',
      '200일선 상승',
      passFail(ma200 !== null && ma200PrevMonth !== null ? ma200 > ma200PrevMonth : null),
      ma200 && ma200PrevMonth ? `${ma200} / 1개월 전 ${ma200PrevMonth}` : null,
      '200일선이 최소 1개월 전보다 높음',
      '장기 추세가 우상향인지 확인합니다.'
    ),
    criterion(
      'near_52w_high',
      '52주 고점 25% 이내',
      passFail(distanceFromHigh52WeekPct !== null ? distanceFromHigh52WeekPct <= 25 : null),
      distanceFromHigh52WeekPct !== null ? `${distanceFromHigh52WeekPct}% 아래` : null,
      '52주 고점 대비 25% 이내',
      '강한 종목이 고점 근처에서 쉬고 있는지 봅니다.'
    ),
    criterion(
      'rs_rating',
      '상대강도 RS 70 이상',
      'unknown',
      null,
      'RS Rating >= 70',
      '현재 연동 API에서 공식 RS 값이 제공되지 않아 추후 보강 대상입니다.'
    ),
    criterion(
      'avg_dollar_volume',
      '20일 평균 거래대금',
      passFail(data.length >= 20 ? avgDollarVolume >= 10_000_000 : null),
      avgDollarVolume ? `$${avgDollarVolume.toLocaleString()}` : null,
      '$10,000,000 이상',
      '슬리피지와 체결 리스크가 낮은 유동성 종목인지 확인합니다.'
    ),
    criterion(
      'fundamentals',
      'EPS/매출/ROE/부채 기본적 필터',
      'unknown',
      null,
      'EPS 20%+, 매출 15%+, ROE 17%+, 부채 40%-',
      '현재 가격 API만 연동되어 기본적 데이터는 명시적으로 미확인 처리합니다.'
    ),
  ];

  const summary = {
    passed: criteria.filter((item) => item.status === 'pass').length,
    failed: criteria.filter((item) => item.status === 'fail').length,
    unknown: criteria.filter((item) => item.status === 'unknown').length,
    total: criteria.length,
  };

  return {
    status: summary.failed > 0 ? 'fail' : summary.unknown > 0 ? 'unknown' : 'pass',
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
      rsRating: null,
    },
  };
}
