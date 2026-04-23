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

export function calculateDistributionDays(
  data: { date: string; close: number; volume: number }[],
  lookback = 25
) {
  let count = 0;
  const details: { date: string; close: number; volume: number; pctChange: number }[] = [];

  for (let i = Math.max(1, data.length - lookback); i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const pctChange = ((curr.close - prev.close) / prev.close) * 100;
    if (curr.close < prev.close && curr.volume > prev.volume) {
      count++;
      details.push({ date: curr.date, close: curr.close, volume: curr.volume, pctChange: Number(pctChange.toFixed(2)) });
    }
  }
  return { count, details };
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
  breadthRows: { symbol: string; above200: boolean; return20: number }[];
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
  above200Pct: number;
  newHighLowProxy: number;
  distributionDays: number;
  distributionDetails: { date: string; close: number; volume: number; pctChange: number }[];
  ftd: { found: boolean; daysAgo: number | null; reason: string };
  metrics: {
    trend: MasterFilterMetricDetail;
    breadth: MasterFilterMetricDetail;
    liquidity: MasterFilterMetricDetail;
    volatility: MasterFilterMetricDetail;
  };
  p3Metrics: {
    ftd: MasterFilterMetricDetail;
    distribution: MasterFilterMetricDetail;
    newHighLow: MasterFilterMetricDetail;
    above200d: MasterFilterMetricDetail;
    sectorRotation: MasterFilterMetricDetail;
  };
  mainHistory: { date: string; close: number }[];
  vixHistory: { date: string; close: number }[];
  movingAverageHistory: { date: string; ma50: number | null; ma200: number | null }[];
}

export function computeP3(
  mainData: OHLCData[],
  vixData: OHLCData[],
  breadthRows: { symbol: string; above200: boolean; return20: number }[],
  sectorRows: { symbol: string; name: string; return20: number; riskOn: boolean; rank: number }[],
  mainSymbol: string,
  breadthEtfs: string[]
): P3ComputeResult {
  const lastClose = mainData.at(-1)!.close;
  const ma50 = movingAverage(mainData, 50) ?? 0;
  const ma150 = movingAverage(mainData, 150) ?? 0;
  const ma200 = movingAverage(mainData, 200) ?? 0;
  const currentVix = vixData.at(-1)?.close ?? 20;

  const distributionInfo = calculateDistributionDays(
    mainData as { date: string; close: number; volume: number }[]
  );
  const distributionDays = distributionInfo.count;
  const ftd = detectFollowThroughDay(mainData);

  const above200Pct = breadthRows.length
    ? (breadthRows.filter((r) => r.above200).length / breadthRows.length) * 100
    : 0;
  const newHighLowProxy = Math.max(
    0,
    Math.min(3, above200Pct / 33 + ((percentReturn(mainData, 20) ?? 0) > 0 ? 0.5 : -0.5))
  );
  const leadingSectors = sectorRows.slice(0, 3);
  const sectorRiskOnCount = leadingSectors.filter((r) => r.riskOn).length;

  const trendScoreScaled = trendScore * 10; // 0~2 -> 0~20
  const volatilityScoreScaled = currentVix < 20 ? 20 : currentVix < 25 ? 12 : 5;

  const ftdScore = ftd.found ? 20 : 8;
  const distributionScore = distributionDays <= 3 ? 20 : distributionDays <= 5 ? 12 : 4;
  const newHighLowScore = newHighLowProxy >= 1.8 ? 20 : newHighLowProxy >= 1.2 ? 12 : 5;
  const above200Score = above200Pct >= 60 ? 20 : above200Pct >= 40 ? 12 : 5;
  const sectorScore = sectorRiskOnCount >= 2 ? 20 : sectorRiskOnCount === 1 ? 12 : 5;

  // 7개 항목 합산 (각 20점, 총 140점) 후 100점 만점으로 환산
  const totalRawScore = ftdScore + distributionScore + newHighLowScore + above200Score + sectorScore + trendScoreScaled + volatilityScoreScaled;
  const p3Score = Math.round((totalRawScore / 140) * 100);

  const trendScore = (lastClose > ma200 ? 1 : 0) + (lastClose > ma50 ? 0.5 : 0) + (ma50 > ma200 ? 0.5 : 0);
  const volatilityScore = currentVix < 20 ? 0.5 : 0;
  const legacyScore =
    trendScore +
    (above200Pct >= 40 ? 1 : 0) +
    (distributionDays < 5 ? 1 : 0) +
    volatilityScore +
    (sectorRiskOnCount >= 1 ? 0.5 : 0);

  let state: MarketState = 'RED';
  if (p3Score >= 75) state = 'GREEN';
  else if (p3Score >= 50) state = 'YELLOW';

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
      label: 'Market Breadth',
      value: Number(above200Pct.toFixed(0)),
      threshold: 50,
      status: (above200Pct >= 60 ? 'PASS' : above200Pct >= 40 ? 'WARNING' : 'FAIL') as 'PASS' | 'WARNING' | 'FAIL',
      unit: '%',
      description: `${breadthEtfs.join(', ')} 중 200일선 위에 있는 비율입니다.`,
      source: 'Yahoo Finance ETF proxy',
      score: above200Score,
      weight: 20,
    },
    liquidity: {
      label: 'Distribution Days',
      value: distributionDays,
      threshold: 5,
      status: (distributionDays <= 3 ? 'PASS' : distributionDays <= 5 ? 'WARNING' : 'FAIL') as 'PASS' | 'WARNING' | 'FAIL',
      unit: 'days',
      description: '최근 25거래일 중 하락일이면서 전일보다 거래량이 증가한 날을 누적합니다.',
      source: `Yahoo Finance ${mainSymbol} volume`,
      score: distributionScore,
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
  };

  const p3Metrics = {
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
    distribution: {
      label: 'Distribution Pressure',
      value: distributionDays,
      threshold: 5,
      status: statusFromScore(distributionScore),
      unit: 'days',
      description: '기관 매도 압력이 과도하게 누적되는지 확인합니다.',
      source: `${mainSymbol} volume proxy`,
      score: distributionScore,
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
    above200d: {
      label: 'Above 200D',
      value: Number(above200Pct.toFixed(0)),
      threshold: 60,
      status: statusFromScore(above200Score),
      unit: '%',
      description: '주요 지수/ETF 중 200일선 위에 있는 비율입니다.',
      source: 'Yahoo Finance ETF proxy',
      score: above200Score,
      weight: 20,
    },
    sectorRotation: {
      label: 'Sector Rotation',
      value: sectorRows.length ? `${sectorRows.length} sectors ranked` : 'N/A',
      threshold: 'Risk-on sectors in leadership',
      status: statusFromScore(sectorScore),
      unit: '',
      description: '전체 섹터를 20거래일 수익률순으로 비교해 성장/경기민감 섹터 주도 여부를 확인합니다.',
      source: 'Sector ETF proxy',
      score: sectorScore,
      weight: 20,
    },
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
    legacyScore, lastClose, ma50, ma150, ma200, currentVix, above200Pct, newHighLowProxy,
    distributionDays, distributionDetails: distributionInfo.details, ftd,
    metrics, p3Metrics, mainHistory, vixHistory, movingAverageHistory,
  };
}
