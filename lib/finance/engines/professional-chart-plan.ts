import type { MarketAnalysisResponse } from '@/types';

export type ProfessionalSetupGrade = 'A' | 'B' | 'C' | 'D';
export type TradeReadiness = 'ACTIONABLE' | 'NEAR_TRIGGER' | 'EARLY' | 'EXTENDED' | 'INVALID';
export type ProfessionalVerdict = 'BUY' | 'WATCH' | 'AVOID';
export type ProfessionalEntryMode = 'BREAKOUT' | 'PULLBACK' | 'WAIT_FOR_BASE' | 'NO_TRADE';

export interface ProfessionalChartPlan {
  setupGrade: ProfessionalSetupGrade;
  readiness: TradeReadiness;
  verdict: ProfessionalVerdict;
  trendScore: number;
  trendSummary: string;
  entryMode: ProfessionalEntryMode;
  currentPrice: number | null;
  triggerPrice: number | null;
  referenceResistance: number | null;
  entryPrice: number | null;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  entryDistancePct: number | null;
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

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function trustedTrigger(input: MarketAnalysisResponse) {
  if (input.vcpAnalysis.entrySource === 'VCP_PIVOT' && positive(input.vcpAnalysis.pivotPrice)) {
    return input.vcpAnalysis.pivotPrice;
  }
  if (input.vcpAnalysis.entrySource === 'HIGH_TIGHT_FLAG' && input.vcpAnalysis.highTightFlag?.passed) {
    const baseHigh = input.vcpAnalysis.highTightFlag.baseHigh;
    return positive(baseHigh) ? baseHigh : null;
  }
  return null;
}

function nearestSupport(input: MarketAnalysisResponse, currentPrice: number | null, movingAverages: Array<number | null>) {
  if (currentPrice === null) return null;
  const structural = (input.chartPatterns || [])
    .filter((pattern) => pattern.type === 'SUPPORT_RESISTANCE')
    .flatMap((pattern) => pattern.lines)
    .filter((line) => line.category === 'risk' || /^S\d/i.test(line.label))
    .map((line) => line.points.at(-1)?.price)
    .filter((value): value is number => positive(value) && value < currentPrice);
  return [...structural, ...movingAverages.filter((value): value is number => positive(value) && value < currentPrice)]
    .sort((left, right) => right - left)[0] ?? null;
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
  const triggerPrice = trustedTrigger(input);
  const referenceResistance = input.vcpAnalysis.entrySource === 'RECENT_HIGH_FALLBACK'
    ? input.vcpAnalysis.referenceHighPrice
    : null;
  const entryWindowHigh = triggerPrice === null ? null : triggerPrice * 1.025;
  const nearestSupportPrice = nearestSupport(input, currentPrice, [ma20, ma50]);
  const extendedFromTrigger = currentPrice !== null && triggerPrice !== null && currentPrice > triggerPrice * 1.05;
  const extendedFromMa50 = currentPrice !== null && ma50 !== null && ((currentPrice - ma50) / ma50) * 100 > 15;
  const extended = extendedFromTrigger || extendedFromMa50;
  const entryMode: ProfessionalEntryMode = riskGateBlocked(input) && triggerPrice !== null
    ? 'NO_TRADE'
    : triggerPrice === null
      ? 'WAIT_FOR_BASE'
      : extended && nearestSupportPrice !== null
        ? 'PULLBACK'
        : extended ? 'NO_TRADE' : 'BREAKOUT';
  const pullbackBand = nearestSupportPrice !== null
    ? Math.max(input.riskPlan.atr * 0.5, nearestSupportPrice * 0.008)
    : null;
  const entryZoneLow = entryMode === 'BREAKOUT' ? triggerPrice
    : entryMode === 'PULLBACK' && nearestSupportPrice !== null && pullbackBand !== null
      ? Math.max(0, nearestSupportPrice - pullbackBand * 0.25)
      : null;
  const entryZoneHigh = entryMode === 'BREAKOUT' ? entryWindowHigh
    : entryMode === 'PULLBACK' && nearestSupportPrice !== null && pullbackBand !== null
      ? nearestSupportPrice + pullbackBand * 0.5
      : null;
  const entryPrice = entryMode === 'BREAKOUT' ? triggerPrice
    : entryMode === 'PULLBACK' ? entryZoneHigh : null;
  const structuralStop = input.riskPlan.selectedStopPrice ?? input.riskPlan.stopLossPrice ?? input.vcpAnalysis.invalidationPrice ?? null;
  const pullbackStop = entryMode === 'PULLBACK' && nearestSupportPrice !== null
    ? nearestSupportPrice - Math.max(input.riskPlan.atr * 0.75, nearestSupportPrice * 0.015)
    : null;
  const stopPrice = entryPrice !== null
    ? [structuralStop, pullbackStop]
      .filter((value): value is number => positive(value) && value < entryPrice)
      .sort((left, right) => right - left)[0] ?? null
    : null;
  const stopDistancePct = entryPrice !== null && stopPrice !== null && entryPrice > stopPrice
    ? ((entryPrice - stopPrice) / entryPrice) * 100
    : null;
  const targetPrice = entryPrice !== null && stopPrice !== null ? entryPrice + (entryPrice - stopPrice) * 2 : null;
  const rewardRiskRatio = targetPrice !== null && entryPrice !== null && stopPrice !== null ? 2 : null;
  const entryDistancePct = currentPrice !== null && entryPrice !== null
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : null;
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
  const confirmedBase = (input.chartPatterns || []).some((pattern) => (
    ['VCP', 'HIGH_TIGHT_FLAG', 'CUP_WITH_HANDLE', 'DOUBLE_BOTTOM'].includes(pattern.type)
      && (pattern.status === 'CONFIRMED' || pattern.status === 'FORMING')
  ));
  const volumeConfirmed = input.vcpAnalysis.breakoutVolumeStatus === 'confirmed'
    || (relativeVolume !== null && relativeVolume >= 1.4);
  const breakout = currentPrice !== null && triggerPrice !== null && currentPrice >= triggerPrice;
  const containedRisk = stopDistancePct !== null && stopDistancePct >= 2.5 && stopDistancePct <= 8;
  const rewardAdequate = rewardRiskRatio !== null && rewardRiskRatio >= 2;
  const blocked = currentPrice === null || (triggerPrice !== null && riskGateBlocked(input));
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
    entryPrice !== null && !containedRisk ? `초기 손절 폭 ${percent(stopDistancePct)}는 표준 위험 범위(2.5~8%) 밖입니다.` : null,
    entryPrice !== null && !rewardAdequate ? `목표 기준 R배수 ${number(rewardRiskRatio)}는 2R 미만입니다.` : null,
    !volumeConfirmed ? '돌파 거래량이 아직 확인되지 않았습니다.' : null,
    trendScore < 4 ? `추세 정렬이 ${trendScore}/5로 완전하지 않습니다.` : null,
    !confirmedBase ? '확정 또는 형성 중인 베이스 신호가 약합니다.' : null,
    extended ? '피벗 대비 과열 구간으로 추격 진입 위험이 큽니다.' : null,
    ...(input.warnings || []).filter((warning) => !warning.includes('최근 고점')).slice(0, 2),
  ].filter((value): value is string => Boolean(value));

  let readiness: TradeReadiness = 'EARLY';
  if (blocked) readiness = 'INVALID';
  else if (extended) readiness = 'EXTENDED';
  else if (breakout && entryWindowHigh !== null && currentPrice !== null && currentPrice <= entryWindowHigh && volumeConfirmed) readiness = 'ACTIONABLE';
  else if (triggerPrice !== null && currentPrice !== null && currentPrice >= triggerPrice * 0.97 && currentPrice <= triggerPrice * 1.025) readiness = 'NEAR_TRIGGER';

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
    triggerPrice === null ? '명확한 베이스와 유효 피벗 확정' : null,
    triggerPrice !== null && !breakout ? `돌파 기준 ${number(triggerPrice)}의 종가 기준 돌파` : null,
    triggerPrice !== null && !volumeConfirmed ? '50일 평균 대비 1.4배 이상의 거래량 확장' : null,
    readiness === 'EXTENDED' ? '추격 매수 대신 재정비 또는 새 진입 구간 형성' : null,
    riskGateBlocked(input) ? '위험 게이트 해제' : null,
  ].filter((value): value is string => Boolean(value));
  const trendSummary = `추세 조건 5개 중 ${trendScore}개 충족 · 현재가가 20/50/200일선 ${aboveMa20 ? '위' : '아래'}/${aboveMa50 ? '위' : '아래'}/${aboveMa200 ? '위' : '아래'}`;

  const executionRule = entryMode === 'WAIT_FOR_BASE'
    ? `최근 고점 ${number(referenceResistance)}은 저항선일 뿐 매수가가 아닙니다. 베이스가 형성되고 피벗이 확정되기 전에는 진입가를 제시하지 않습니다.`
    : entryMode === 'PULLBACK' && entryZoneLow !== null && entryZoneHigh !== null
      ? `현재가는 추격 구간입니다. ${number(entryZoneLow)}~${number(entryZoneHigh)} 눌림 구간에서 지지 후 전일 고가 회복 또는 강한 종가 반전을 확인할 때만 진입을 재검토합니다.`
      : entryMode === 'NO_TRADE'
        ? '현재는 실행 가능한 진입 시나리오가 없습니다. 구조가 재정비될 때까지 거래하지 않습니다.'
        : `종가가 돌파 기준 ${number(triggerPrice)}를 넘고 거래량이 50일 평균의 1.4배 이상일 때만 진입을 검토합니다. 허용 추격 상단은 ${number(entryWindowHigh)}입니다.`;

  return {
    setupGrade,
    readiness,
    verdict,
    trendScore,
    trendSummary,
    entryMode,
    currentPrice,
    triggerPrice,
    referenceResistance,
    entryPrice,
    entryZoneLow,
    entryZoneHigh,
    entryDistancePct,
    entryWindowHigh,
    stopPrice,
    targetPrice,
    stopDistancePct,
    rewardRiskRatio,
    relativeVolume,
    executionRule,
    addRule: '초기 위험이 제거된 뒤, 첫 추가는 손절선을 최소 손익분기 이상으로 올릴 수 있을 때만 검토합니다.',
    exitRule: stopPrice === null
      ? '진입 계획이 없으므로 손절가도 제시하지 않습니다. 임의의 가격으로 진입하지 마십시오.'
      : `${number(stopPrice)} 종가 이탈은 가설 무효화로 취급합니다. 목표가 도달 전에도 분배·추세 훼손을 별도로 점검합니다.`,
    confirmations,
    risks,
    noTradeBefore,
  };
}
