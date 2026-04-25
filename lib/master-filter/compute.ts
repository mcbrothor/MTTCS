import type { MarketState, MasterFilterMetricDetail } from '@/types';
import type { OHLCData } from '@/types';

export function average(values: number[]) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

export function movingAverage(data: { close: number }[], period: number) {
  if (data.length < period) return null;
  return average(data.slice(-period).map((d) => d.close));
}

export function movingAverageAt(data: { close: number }[], endIndex: number, period: number) {
  if (endIndex + 1 < period) return null;
  return average(data.slice(endIndex + 1 - period, endIndex + 1).map((d) => d.close));
}

export function percentReturn(data: { close: number }[], lookback: number) {
  if (data.length <= lookback) return null;
  const start = data[data.length - lookback - 1]?.close;
  const end = data.at(-1)?.close;
  if (!start || !end) return null;
  return ((end - start) / start) * 100;
}

export function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function statusFromScore(score: number): 'PASS' | 'WARNING' | 'FAIL' {
  if (score >= 16) return 'PASS';
  if (score >= 10) return 'WARNING';
  return 'FAIL';
}

// O'Neil 분산일 기준: 0.2% 이상 하락 + 전일 대비 거래량 증가
const DISTRIBUTION_MIN_DECLINE_PCT = 0.2;
// 6일 이상 누적(가중) 시 자동 RED veto
const DISTRIBUTION_VETO_THRESHOLD = 6;

export function calculateDistributionDays(
  data: { date: string; close: number; volume: number }[],
  lookback = 25
) {
  let count = 0;
  let weightedCount = 0;
  const details: { date: string; close: number; volume: number; pctChange: number; weight: number }[] = [];
  const startIdx = Math.max(1, data.length - lookback);

  for (let i = startIdx; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const pctChange = ((curr.close - prev.close) / prev.close) * 100;

    // 0.2% 이상 하락 + 전일 대비 거래량 증가 = 분산일
    if (pctChange <= -DISTRIBUTION_MIN_DECLINE_PCT && curr.volume > prev.volume) {
      // 시간 감쇠: 최근일 = 1.0, lookback일 전 = 0.0 (선형)
      const daysFromStart = i - startIdx;
      const weight = Number((daysFromStart / (lookback - 1)).toFixed(2));
      count++;
      weightedCount += weight;
      details.push({
        date: curr.date,
        close: curr.close,
        volume: curr.volume,
        pctChange: Number(pctChange.toFixed(2)),
        weight,
      });
    }
  }
  return { count, weightedCount: Number(weightedCount.toFixed(2)), details };
}

export function detectFollowThroughDay(data: Pick<OHLCData, 'close' | 'high' | 'low' | 'volume'>[]) {
  const lookback = data.slice(-30);
  if (lookback.length < 10) {
    return { found: false, daysAgo: null as number | null, reason: 'FTD 확인에 필요한 최근 거래일 데이터가 부족합니다.' };
  }

  let peak = lookback[0].high;
  let correctionLowIndex = -1;
  let correctionDepth = 0;

  for (let i = 1; i < lookback.length; i++) {
    peak = Math.max(peak, lookback[i].high);
    const drawdownPct = peak > 0 ? ((peak - lookback[i].low) / peak) * 100 : 0;
    if (drawdownPct >= 4 && drawdownPct >= correctionDepth) {
      correctionDepth = drawdownPct;
      correctionLowIndex = i;
    }
  }

  if (correctionLowIndex < 0) {
    return { found: false, daysAgo: null, reason: '최근 30거래일 안에서 4% 이상 조정 저점을 찾지 못했습니다.' };
  }

  const startIndex = correctionLowIndex + 4;
  if (startIndex >= lookback.length) {
    return { found: false, daysAgo: null, reason: '조정 저점 이후 FTD 확인 기준인 4거래일차가 아직 지나지 않았습니다.' };
  }

  let hadPriceGain = false;
  for (let i = startIndex; i < lookback.length; i++) {
    const prev = lookback[i - 1];
    const curr = lookback[i];
    const gainPct = ((curr.close - prev.close) / prev.close) * 100;
    if (gainPct >= 1.25) hadPriceGain = true;
    if (gainPct >= 1.25 && curr.volume > prev.volume) {
      return { found: true, daysAgo: lookback.length - 1 - i, reason: `${lookback.length - 1 - i}거래일 전 1.25% 이상 상승과 거래량 증가가 확인되었습니다.` };
    }
  }

  return {
    found: false,
    daysAgo: null,
    reason: hadPriceGain
      ? '1.25% 이상 상승일은 있었지만 전일 대비 거래량 증가가 동반되지 않았습니다.'
      : '조정 저점 이후 4거래일차부터 1.25% 이상 상승일을 찾지 못했습니다.',
  };
}

export interface P3ComputeInput {
  mainData: OHLCData[];
  vixData: OHLCData[];
  breadthRows: { symbol: string; above200: boolean; return20: number; nearHigh52?: boolean; nearLow52?: boolean }[];
  sectorRows: { symbol: string; return20: number; riskOn: boolean }[];
}

export interface P3ComputeResult {
  p3Score: number;
  state: MarketState;
  ftdScore: number;
  distributionScore: number;
  newHighLowScore: number;
  above200Score: number;
  sectorScore: number;
  trendScore: number;
  breadthScore: number;
  volatilityScore: number;
  liquidityScore: number;
  legacyScore: number;
  lastClose: number;
  ma50: number;
  ma150: number;
  ma200: number;
  currentVix: number;
  currentVix3m: number | null;
  vixTermRatio: number | null;
  above200Pct: number;
  newHighLowProxy: number;
  distributionDays: number;
  distributionWeighted: number;
  distributionDetails: { date: string; close: number; volume: number; pctChange: number; weight: number }[];
  ftd: { found: boolean; daysAgo: number | null; reason: string };
  foreignNetBuy5d: number | null;
  foreignNetBuyScore: number;
  metrics: {
    trend: MasterFilterMetricDetail;
    breadth: MasterFilterMetricDetail;
    volatility: MasterFilterMetricDetail;
    distribution: MasterFilterMetricDetail;
    ftd: MasterFilterMetricDetail;
    newHighLow: MasterFilterMetricDetail;
    sectorRotation: MasterFilterMetricDetail;
    p3Score: number;
  };
  mainHistory: { date: string; close: number }[];
  vixHistory: { date: string; close: number }[];
  movingAverageHistory: { date: string; ma50: number | null; ma200: number | null }[];
}

// VIX/VIX3M 비율 > 1.0 (백워데이션) = 단기 공포 급등 신호 → GREEN → YELLOW 강등
const VIX_TERM_BACKWARDATION_THRESHOLD = 1.0;

// 외국인 순매수 임계값 (억원). KR 전용 신호.
const FOREIGN_NET_BUY_THRESHOLD = 500;

export function computeP3(
  mainData: OHLCData[],
  vixData: OHLCData[],
  breadthRows: { symbol: string; above200: boolean; return20: number; nearHigh52?: boolean; nearLow52?: boolean }[],
  sectorRows: { symbol: string; name: string; return20: number; riskOn: boolean; rank: number }[],
  mainSymbol: string,
  breadthEtfs: string[],
  vix3mData?: OHLCData[],
  foreignNetBuy5d?: number
): P3ComputeResult {
  const lastClose = mainData.at(-1)!.close;
  const ma50 = movingAverage(mainData, 50) ?? 0;
  const ma150 = movingAverage(mainData, 150) ?? 0;
  const ma200 = movingAverage(mainData, 200) ?? 0;
  const currentVix = vixData.at(-1)?.close ?? 20;
  const currentVix3m = vix3mData?.at(-1)?.close ?? null;
  // VIX/VIX3M 비율: 1.0 초과(백워데이션)은 단기 공포 급등 신호
  const vixTermRatio = currentVix3m && currentVix3m > 0 ? currentVix / currentVix3m : null;

  const distributionInfo = calculateDistributionDays(
    mainData as { date: string; close: number; volume: number }[]
  );
  const distributionDays = distributionInfo.count;
  const distributionWeighted = distributionInfo.weightedCount;
  const ftd = detectFollowThroughDay(mainData);

  const above200Pct = breadthRows.length
    ? (breadthRows.filter((r) => r.above200).length / breadthRows.length) * 100
    : 0;

  // NH/NL: 실제 52주 고/저가 데이터가 있으면 사용, 없으면 proxy
  const hasRealNHNL = breadthRows.some((r) => r.nearHigh52 !== undefined);
  let newHighLowProxy: number;
  if (hasRealNHNL && breadthRows.length > 0) {
    const nearHighCount = breadthRows.filter((r) => r.nearHigh52).length;
    const nearLowCount = breadthRows.filter((r) => r.nearLow52).length;
    // 비율 차이를 0-3 스케일로 변환: 모두 고가권=3, 균형=1.5, 모두 저가권=0
    newHighLowProxy = Math.max(
      0,
      Math.min(3, ((nearHighCount - nearLowCount) / breadthRows.length) * 1.5 + 1.5)
    );
  } else {
    newHighLowProxy = Math.max(
      0,
      Math.min(3, above200Pct / 33 + ((percentReturn(mainData, 20) ?? 0) > 0 ? 0.5 : -0.5))
    );
  }

  // 외국인 순매수 5일 누적 점수 (KR 시장 전용 신호)
  // +500억원 초과 → 강한 수급 호재, -500억원 미만 → 강한 수급 악재
  let foreignNetBuyScore = 0;
  if (foreignNetBuy5d !== undefined && foreignNetBuy5d !== null) {
    if (foreignNetBuy5d > FOREIGN_NET_BUY_THRESHOLD) foreignNetBuyScore = 3;
    else if (foreignNetBuy5d > 0) foreignNetBuyScore = 1;
    else if (foreignNetBuy5d < -FOREIGN_NET_BUY_THRESHOLD) foreignNetBuyScore = -3;
    else if (foreignNetBuy5d < 0) foreignNetBuyScore = -1;
  }
  const leadingSectors = sectorRows.slice(0, 3);
  const sectorRiskOnCount = leadingSectors.filter((r) => r.riskOn).length;

  const trendScore = (lastClose > ma200 ? 1 : 0) + (lastClose > ma50 ? 0.5 : 0) + (ma50 > ma200 ? 0.5 : 0);
  const trendScoreScaled = trendScore * 10; // 0~2 -> 0~20
  const volatilityScore = currentVix < 20 ? 0.5 : 0;
  const volatilityScoreScaled = currentVix < 20 ? 20 : currentVix < 25 ? 12 : 5;

  const ftdScore = ftd.found ? 20 : 8;
  // 점수 산정은 시간 가중 카운트 사용 (최근 분산일에 더 높은 가중치)
  const distributionScore = distributionWeighted <= 3 ? 20 : distributionWeighted <= 5 ? 12 : 4;
  const newHighLowScore = newHighLowProxy >= 1.8 ? 20 : newHighLowProxy >= 1.2 ? 12 : 5;
  const above200Score = above200Pct >= 60 ? 20 : above200Pct >= 40 ? 12 : 5;
  const sectorScore = sectorRiskOnCount >= 2 ? 20 : sectorRiskOnCount === 1 ? 12 : 5;

  // 7개 항목 합산 (각 20점, 총 140점) 후 100점 만점으로 환산
  // 외국인 순매수는 소폭 보정 (+/-3점): KR 시장 수급 신호
  const totalRawScore = ftdScore + distributionScore + newHighLowScore + above200Score + sectorScore + trendScoreScaled + volatilityScoreScaled;
  const p3Score = Math.min(100, Math.max(0, Math.round((totalRawScore / 140) * 100) + foreignNetBuyScore));

  const legacyScore =
    trendScore +
    (above200Pct >= 40 ? 1 : 0) +
    (distributionDays < 5 ? 1 : 0) +
    volatilityScore +
    (sectorRiskOnCount >= 1 ? 0.5 : 0);

  // Trend Veto: 가격이 200MA 아래거나 50MA가 200MA 아래면 무조건 RED (추세추종 핵심 조건)
  // Distribution Veto: O'Neil 기준 6일+ 누적 분산일 시 자동 RED
  let state: MarketState = 'RED';
  if (lastClose < ma200 || ma50 < ma200) {
    state = 'RED'; // Trend veto
  } else if (distributionDays >= DISTRIBUTION_VETO_THRESHOLD) {
    state = 'RED'; // Distribution veto
  } else if (p3Score >= 75) {
    state = 'GREEN';
  } else if (p3Score >= 50) {
    state = 'YELLOW';
  }

  // VIX 텀 구조 강등: GREEN인 경우에만 적용 (YELLOW로만 강등, RED로는 강등 안 함)
  // VIX/VIX3M 백워데이션(>1.0) = 단기 공포가 장기보다 큼 → 진입 신중
  if (state === 'GREEN' && vixTermRatio !== null && vixTermRatio > VIX_TERM_BACKWARDATION_THRESHOLD) {
    state = 'YELLOW';
  }

  const metrics = {
    trend: {
      label: 'Trend Alignment',
      value: `${round(ma50)} / ${round(ma200)}`,
      threshold: '50D > 200D, price > 50D/200D',
      status: (lastClose > ma200 && ma50 > ma200 && lastClose > ma50 ? 'PASS' : lastClose > ma200 ? 'WARNING' : 'FAIL') as 'PASS' | 'WARNING' | 'FAIL',
      unit: '',
      description: `${mainSymbol} 현재가가 50일/200일 이평선 위에 있는지, 50일선이 200일선 위에 있는지 확인합니다. 현재가 ${round(lastClose)}.`,
      source: `Yahoo Finance ${mainSymbol}`,
      score: trendScoreScaled,
      weight: 20,
    },
    breadth: {
      label: 'Above 200D (Breadth)',
      value: Number(above200Pct.toFixed(0)),
      threshold: 60,
      status: statusFromScore(above200Score),
      unit: '%',
      description: `주요 지수/ETF 중 200일선 위에 있는 비율입니다. (${breadthEtfs.join(', ')})`,
      source: 'Yahoo Finance ETF proxy',
      score: above200Score,
      weight: 20,
    },
    volatility: {
      label: 'Volatility (VIX)',
      value: Number(currentVix.toFixed(2)),
      threshold: 20,
      status: (currentVix < 20 ? 'PASS' : currentVix < 25 ? 'WARNING' : 'FAIL') as 'PASS' | 'WARNING' | 'FAIL',
      unit: 'pts',
      description: 'VIX 20 미만은 정상 변동성, 20~25는 주의, 25 이상은 위험 구간으로 해석합니다.',
      source: 'CBOE via Yahoo',
      score: volatilityScoreScaled,
      weight: 20,
    },
    distribution: {
      label: 'Distribution Pressure',
      value: distributionDays,
      threshold: 5,
      status: statusFromScore(distributionScore),
      unit: 'days',
      description: '최근 25거래일 중 하락일이면서 전일보다 거래량이 증가한 날(분산일)을 누적합니다.',
      source: `${mainSymbol} volume proxy`,
      score: distributionScore,
      weight: 20,
    },
    ftd: {
      label: 'Follow-Through Day',
      value: ftd.found ? `${ftd.daysAgo} days ago` : 'Unconfirmed',
      threshold: 'Recent correction + day 4 rally',
      status: statusFromScore(ftdScore),
      unit: '',
      description: ftd.reason,
      source: `${mainSymbol} proxy`,
      score: ftdScore,
      weight: 20,
    },
    newHighLow: {
      label: 'NH/NL Proxy',
      value: Number(newHighLowProxy.toFixed(2)),
      threshold: 1.8,
      status: statusFromScore(newHighLowScore),
      unit: 'ratio',
      description: '주요 ETF의 200일선 참여 폭과 20일 수익률로 시장 내부 강도를 추정합니다.',
      source: 'ETF breadth proxy',
      score: newHighLowScore,
      weight: 20,
    },
    sectorRotation: {
      label: 'Sector Leadership',
      value: sectorRows.length ? `${sectorRows.length} sectors ranked` : 'N/A',
      threshold: 'Risk-on sectors in leadership',
      status: statusFromScore(sectorScore),
      unit: '',
      description: '전체 섹터를 20거래일 수익률순으로 비교해 성장/경기민감 섹터 주도 여부를 확인합니다.',
      source: 'Sector ETF proxy',
      score: sectorScore,
      weight: 20,
    },
    p3Score,
  };

  const mainHistory = mainData.slice(-50).map((d) => ({ date: d.date, close: d.close }));
  const vixHistory = vixData.slice(-50).map((d) => ({ date: d.date, close: d.close }));
  const movingAverageHistory = mainData.slice(-80).map((d) => {
    const idx = mainData.indexOf(d);
    return { date: d.date, ma50: movingAverageAt(mainData, idx, 50), ma200: movingAverageAt(mainData, idx, 200) };
  });

  return {
    p3Score, state, ftdScore, distributionScore, newHighLowScore, above200Score, sectorScore,
    trendScore, breadthScore: above200Pct, volatilityScore, liquidityScore: distributionDays,
    legacyScore, lastClose, ma50, ma150, ma200, currentVix, currentVix3m, vixTermRatio, above200Pct, newHighLowProxy,
    distributionDays, distributionWeighted, distributionDetails: distributionInfo.details, ftd,
    foreignNetBuy5d: foreignNetBuy5d ?? null, foreignNetBuyScore,
    metrics, mainHistory, vixHistory, movingAverageHistory,
  };
}
