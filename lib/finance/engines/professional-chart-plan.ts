import type { MarketAnalysisResponse } from '@/types';

export type ProfessionalSetupGrade = 'A' | 'B' | 'C' | 'D';
export type TradeReadiness = 'ACTIONABLE' | 'NEAR_TRIGGER' | 'EARLY' | 'EXTENDED' | 'INVALID';
export type ProfessionalVerdict = 'BUY' | 'WATCH' | 'AVOID';

export interface ProfessionalChartPlan {
  setupGrade: ProfessionalSetupGrade;
  readiness: TradeReadiness;
  verdict: ProfessionalVerdict;
  trendScore: number;
  trendSummary: string;
  entryPrice: number | null;
  entryWindowHigh: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  stopDistancePct: number | null;
  rewardRiskRatio: number | null;
  relativeVolume: number | null;
  executionRule: string;
  addRule: string;
  exitRule: string;
  confirmations: string[];
  risks: string[];
  noTradeBefore: string[];
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function movingAverage(values: number[], period: number, offset = 0) {
  const end = values.length - offset;
  if (end < period) return null;
  return average(values.slice(end - period, end));
}

function number(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value) ? '-' : value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function percent(value: number | null, digits = 1) {
  return value === null || !Number.isFinite(value) ? '-' : `${value.toFixed(digits)}%`;
}

function riskGateBlocked(input: MarketAnalysisResponse) {
  const status = input.riskPlan.riskGate?.status;
  return status === 'BLOCK';
}

export function buildProfessionalChartPlan(input: MarketAnalysisResponse): ProfessionalChartPlan {
  const bars = input.priceData;
  const latest = bars.at(-1) ?? null;
  const closes = bars.map((bar) => bar.close);
  const ma20 = movingAverage(closes, 20);
  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);
  const priorMa50 = movingAverage(closes, 50, 20);
  const currentPrice = latest?.close ?? null;
  const entryPrice = input.riskPlan.entryPrice ?? input.vcpAnalysis.pivotPrice ?? null;
  const stopPrice = input.riskPlan.selectedStopPrice ?? input.riskPlan.stopLossPrice ?? input.vcpAnalysis.invalidationPrice ?? null;
  const targetPrice = input.riskPlan.targetPrice ?? null;
  const entryWindowHigh = entryPrice === null ? null : entryPrice * 1.025;
  const stopDistancePct = entryPrice !== null && stopPrice !== null && entryPrice > stopPrice
    ? ((entryPrice - stopPrice) / entryPrice) * 100
    : null;
  const rewardRiskRatio = input.riskPlan.rewardRiskRatio ?? null;
  const recentVolume = typeof latest?.volume === 'number' ? latest.volume : null;
  const priorVolumes = bars.slice(-51, -1).map((bar) => bar.volume).filter((value): value is number => typeof value === 'number' && value > 0);
  const averageVolume = average(priorVolumes);
  const relativeVolume = recentVolume !== null && averageVolume !== null && averageVolume > 0 ? recentVolume / averageVolume : null;
  const aboveMa20 = currentPrice !== null && ma20 !== null && currentPrice > ma20;
  const aboveMa50 = currentPrice !== null && ma50 !== null && currentPrice > ma50;
  const aboveMa200 = currentPrice !== null && ma200 !== null && currentPrice > ma200;
  const ma50AboveMa200 = ma50 !== null && ma200 !== null && ma50 > ma200;
  const ma50Rising = ma50 !== null && priorMa50 !== null && ma50 > priorMa50;
  const trendScore = [aboveMa20, aboveMa50, aboveMa200, ma50AboveMa200, ma50Rising].filter(Boolean).length;
  const confirmedBase = input.chartPatterns.some((pattern) => (
    ['VCP', 'HIGH_TIGHT_FLAG', 'CUP_WITH_HANDLE', 'DOUBLE_BOTTOM'].includes(pattern.type)
      && (pattern.status === 'CONFIRMED' || pattern.status === 'FORMING')
  ));
  const volumeConfirmed = input.vcpAnalysis.breakoutVolumeStatus === 'confirmed'
    || (relativeVolume !== null && relativeVolume >= 1.4);
  const breakout = currentPrice !== null && entryPrice !== null && currentPrice >= entryPrice;
  const extended = currentPrice !== null && entryPrice !== null && currentPrice > entryPrice * 1.05
    || (currentPrice !== null && ma50 !== null && ((currentPrice - ma50) / ma50) * 100 > 15);
  const containedRisk = stopDistancePct !== null && stopDistancePct >= 2.5 && stopDistancePct <= 8;
  const rewardAdequate = rewardRiskRatio !== null && rewardRiskRatio >= 2;
  const blocked = riskGateBlocked(input) || entryPrice === null || stopPrice === null || stopDistancePct === null;
  const confirmations = [
    aboveMa20 ? '가격이 20일선 위에 있습니다.' : null,
    aboveMa50 ? '가격이 50일선 위에 있습니다.' : null,
    aboveMa200 ? '가격이 200일선 위에 있습니다.' : null,
    ma50AboveMa200 ? '50일선이 200일선 위에 있습니다.' : null,
    ma50Rising ? '50일선이 상승 기울기를 유지합니다.' : null,
    confirmedBase ? '확인 가능한 베이스 또는 수축 패턴이 있습니다.' : null,
    volumeConfirmed ? '돌파 거래량 조건이 확인됐습니다.' : null,
  ].filter((value): value is string => Boolean(value));
  const risks = [
    !containedRisk ? `초기 손절 폭 ${percent(stopDistancePct)}는 표준 위험 범위(2.5~8%) 밖입니다.` : null,
    !rewardAdequate ? `목표 기준 R배수 ${number(rewardRiskRatio)}는 2R 미만입니다.` : null,
    !volumeConfirmed ? '돌파 거래량이 아직 확인되지 않았습니다.' : null,
    trendScore < 4 ? `추세 정렬이 ${trendScore}/5로 완전하지 않습니다.` : null,
    !confirmedBase ? '확정 또는 형성 중인 베이스 신호가 약합니다.' : null,
    extended ? '피벗 대비 과열 구간으로 추격 진입 위험이 큽니다.' : null,
    ...input.warnings.slice(0, 2),
  ].filter((value): value is string => Boolean(value));

  let readiness: TradeReadiness = 'EARLY';
  if (blocked) readiness = 'INVALID';
  else if (extended) readiness = 'EXTENDED';
  else if (breakout && entryWindowHigh !== null && currentPrice !== null && currentPrice <= entryWindowHigh && volumeConfirmed) readiness = 'ACTIONABLE';
  else if (entryPrice !== null && currentPrice !== null && currentPrice >= entryPrice * 0.97 && currentPrice < entryPrice) readiness = 'NEAR_TRIGGER';

  const qualityScore = trendScore + (confirmedBase ? 1 : 0) + (containedRisk ? 1 : 0) + (rewardAdequate ? 1 : 0) + (volumeConfirmed ? 1 : 0);
  const setupGrade: ProfessionalSetupGrade = readiness === 'INVALID' ? 'D'
    : qualityScore >= 8 ? 'A'
      : qualityScore >= 6 ? 'B'
        : qualityScore >= 4 ? 'C'
          : 'D';
  const verdict: ProfessionalVerdict = readiness === 'ACTIONABLE' && setupGrade === 'A' ? 'BUY'
    : readiness === 'INVALID' ? 'AVOID'
      : 'WATCH';
  const noTradeBefore = [
    !breakout ? `피벗 ${number(entryPrice)}의 종가 기준 돌파` : null,
    !volumeConfirmed ? '평균 대비 유의미한 거래량 확장' : null,
    readiness === 'EXTENDED' ? '추격 매수 대신 재정비 또는 새 진입 구간 형성' : null,
    riskGateBlocked(input) ? '위험 게이트 해제' : null,
  ].filter((value): value is string => Boolean(value));
  const trendSummary = `추세 정렬 ${trendScore}/5 · 20/50/200일선 ${aboveMa20 ? '상' : '하'}/${aboveMa50 ? '상' : '하'}/${aboveMa200 ? '상' : '하'}`;

  return {
    setupGrade,
    readiness,
    verdict,
    trendScore,
    trendSummary,
    entryPrice,
    entryWindowHigh,
    stopPrice,
    targetPrice,
    stopDistancePct,
    rewardRiskRatio,
    relativeVolume,
    executionRule: entryPrice === null
      ? '유효한 피벗이 확정되기 전에는 진입하지 않습니다.'
      : `종가가 ${number(entryPrice)}를 넘고 거래량 조건을 확인할 때만 진입을 검토합니다. 허용 추격 상단은 ${number(entryWindowHigh)}입니다.`,
    addRule: '초기 위험이 제거된 뒤, 첫 추가는 손절선을 최소 손익분기 이상으로 올릴 수 있을 때만 검토합니다.',
    exitRule: stopPrice === null
      ? '무효화 가격이 확정될 때까지 신규 포지션을 보류합니다.'
      : `${number(stopPrice)} 종가 이탈은 가설 무효화로 취급합니다. 목표가 도달 전에도 분배·추세 훼손을 별도로 점검합니다.`,
    confirmations,
    risks,
    noTradeBefore,
  };
}
