import type { MarketAnalysisResponse } from '@/types';

export type ProfessionalSetupGrade = 'A' | 'B' | 'C' | 'D';
export type TradeReadiness = 'ACTIONABLE' | 'NEAR_TRIGGER' | 'EARLY' | 'EXTENDED' | 'INVALID';
export type ProfessionalVerdict = 'BUY' | 'WATCH' | 'AVOID';
export type ProfessionalEntryMode = 'BREAKOUT' | 'PULLBACK' | 'WAIT_FOR_BASE' | 'NO_TRADE';
export type ProfessionalTrendState = 'UPTREND' | 'MIXED' | 'DOWNTREND' | 'INSUFFICIENT';
export type TimeframeAlignment = 'BULLISH_ALIGNED' | 'MIXED' | 'BEARISH_CONFLICT' | 'INSUFFICIENT';

export interface ProfessionalConfluenceFactor {
  id: 'DAILY_TREND' | 'WEEKLY_TREND' | 'BASE_QUALITY' | 'VOLUME' | 'RISK' | 'REWARD';
  label: string;
  status: 'PASS' | 'PARTIAL' | 'FAIL' | 'NA';
  score: number;
  maxScore: number;
  detail: string;
}

export interface ProfessionalTradeScenario {
  id: 'PRIMARY' | 'ALTERNATE' | 'FAILURE';
  label: string;
  condition: string;
  action: string;
  zoneLow: number | null;
  zoneHigh: number | null;
}

export interface ProfessionalChartPlan {
  setupGrade: ProfessionalSetupGrade;
  readiness: TradeReadiness;
  verdict: ProfessionalVerdict;
  trendScore: number;
  trendSummary: string;
  dailyTrend: ProfessionalTrendState;
  weeklyTrend: ProfessionalTrendState;
  timeframeAlignment: TimeframeAlignment;
  timeframeSummary: string;
  confluenceScore: number;
  confluenceFactors: ProfessionalConfluenceFactor[];
  entryMode: ProfessionalEntryMode;
  currentPrice: number | null;
  triggerPrice: number | null;
  referenceResistance: number | null;
  keySupport: number | null;
  keyResistance: number | null;
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
  scenarios: [ProfessionalTradeScenario, ProfessionalTradeScenario, ProfessionalTradeScenario];
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

function weeklyCloses(bars: MarketAnalysisResponse['priceData']) {
  const weeks = new Map<string, number>();
  for (const bar of bars) {
    const date = new Date(`${bar.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) continue;
    const daysFromMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysFromMonday);
    weeks.set(date.toISOString().slice(0, 10), bar.close);
  }
  return [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, close]) => close);
}

function classifyWeeklyTrend(bars: MarketAnalysisResponse['priceData']): ProfessionalTrendState {
  const closes = weeklyCloses(bars);
  const latest = closes.at(-1) ?? null;
  const ma10 = movingAverage(closes, 10);
  const ma30 = movingAverage(closes, 30);
  const priorMa30 = movingAverage(closes, 30, 4);
  if (latest === null || ma10 === null || ma30 === null || priorMa30 === null) return 'INSUFFICIENT';
  if (latest > ma10 && ma10 > ma30 && ma30 > priorMa30) return 'UPTREND';
  if (latest < ma10 && ma10 < ma30 && ma30 < priorMa30) return 'DOWNTREND';
  return 'MIXED';
}

function structuralLevelPrices(input: MarketAnalysisResponse) {
  return (input.chartPatterns || [])
    .filter((pattern) => pattern.type === 'SUPPORT_RESISTANCE')
    .flatMap((pattern) => pattern.lines)
    .map((line) => line.points.at(-1)?.price)
    .filter((value): value is number => positive(value));
}

function keyLevels(
  input: MarketAnalysisResponse,
  currentPrice: number | null,
  movingAverages: Array<number | null>,
) {
  if (currentPrice === null) return { support: null, resistance: null };
  const structural = structuralLevelPrices(input);
  const support = [...structural, ...movingAverages.filter((value): value is number => positive(value))]
    .filter((value) => value < currentPrice)
    .sort((left, right) => right - left)[0] ?? null;
  const resistance = [
    ...structural,
    input.vcpAnalysis.referenceHighPrice,
    trustedTrigger(input),
  ]
    .filter((value): value is number => positive(value) && value > currentPrice)
    .sort((left, right) => left - right)[0] ?? null;
  return { support, resistance };
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
  const levels = keyLevels(input, currentPrice, [ma20, ma50]);
  const nearestSupportPrice = levels.support;
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
  const dailyTrend: ProfessionalTrendState = trendScore >= 4 ? 'UPTREND' : trendScore <= 1 ? 'DOWNTREND' : 'MIXED';
  const weeklyTrend = classifyWeeklyTrend(bars);
  const timeframeAlignment: TimeframeAlignment = weeklyTrend === 'INSUFFICIENT'
    ? 'INSUFFICIENT'
    : dailyTrend === 'UPTREND' && weeklyTrend === 'UPTREND'
      ? 'BULLISH_ALIGNED'
      : dailyTrend === 'DOWNTREND' || weeklyTrend === 'DOWNTREND'
        ? 'BEARISH_CONFLICT'
        : 'MIXED';
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
  const confluenceFactors: ProfessionalConfluenceFactor[] = [
    {
      id: 'DAILY_TREND',
      label: '일봉 추세',
      status: trendScore >= 4 ? 'PASS' : trendScore >= 2 ? 'PARTIAL' : 'FAIL',
      score: trendScore * 6,
      maxScore: 30,
      detail: `추세 조건 ${trendScore}/5 충족`,
    },
    {
      id: 'WEEKLY_TREND',
      label: '주봉 추세',
      status: weeklyTrend === 'UPTREND' ? 'PASS' : weeklyTrend === 'MIXED' ? 'PARTIAL' : weeklyTrend === 'INSUFFICIENT' ? 'NA' : 'FAIL',
      score: weeklyTrend === 'UPTREND' ? 15 : weeklyTrend === 'MIXED' ? 7 : weeklyTrend === 'INSUFFICIENT' ? 5 : 0,
      maxScore: 15,
      detail: weeklyTrend === 'UPTREND' ? '10주선·30주선 상승 정렬' : weeklyTrend === 'MIXED' ? '주봉 정렬 혼조' : weeklyTrend === 'DOWNTREND' ? '주봉 하락 정렬' : '주봉 데이터 부족',
    },
    {
      id: 'BASE_QUALITY',
      label: '베이스 품질',
      status: confirmedBase ? 'PASS' : 'FAIL',
      score: confirmedBase ? 15 : 0,
      maxScore: 15,
      detail: confirmedBase ? '현재 유효한 베이스 확인' : '실행 가능한 베이스 미확정',
    },
    {
      id: 'VOLUME',
      label: '거래량 확인',
      status: volumeConfirmed ? 'PASS' : 'FAIL',
      score: volumeConfirmed ? 15 : 0,
      maxScore: 15,
      detail: volumeConfirmed ? `상대 거래량 ${number(relativeVolume, 1)}배` : `상대 거래량 ${number(relativeVolume, 1)}배 · 확장 미확인`,
    },
    {
      id: 'RISK',
      label: '손절 구조',
      status: entryPrice === null ? 'NA' : containedRisk ? 'PASS' : 'FAIL',
      score: containedRisk ? 15 : 0,
      maxScore: 15,
      detail: entryPrice === null ? '진입 미확정' : `초기 위험 ${percent(stopDistancePct)}`,
    },
    {
      id: 'REWARD',
      label: '보상비',
      status: entryPrice === null ? 'NA' : rewardAdequate ? 'PASS' : 'FAIL',
      score: rewardAdequate ? 10 : 0,
      maxScore: 10,
      detail: entryPrice === null ? '진입 미확정' : `${number(rewardRiskRatio, 1)}R`,
    },
  ];
  const confluenceScore = confluenceFactors.reduce((sum, factor) => sum + factor.score, 0);
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

  const setupGrade: ProfessionalSetupGrade = readiness === 'INVALID' ? 'D'
    : confluenceScore >= 80 ? 'A'
      : confluenceScore >= 65 ? 'B'
        : confluenceScore >= 45 ? 'C'
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
  const trendLabel = (trend: ProfessionalTrendState) => trend === 'UPTREND' ? '상승' : trend === 'DOWNTREND' ? '하락' : trend === 'MIXED' ? '혼조' : '데이터 부족';
  const alignmentLabel = timeframeAlignment === 'BULLISH_ALIGNED' ? '상승 정합' : timeframeAlignment === 'BEARISH_CONFLICT' ? '하락 충돌' : timeframeAlignment === 'MIXED' ? '부분 정합' : '판단 보류';
  const timeframeSummary = `일봉 ${trendLabel(dailyTrend)} · 주봉 ${trendLabel(weeklyTrend)} · ${alignmentLabel}`;

  const waitResistance = levels.resistance ?? referenceResistance;
  const executionRule = entryMode === 'WAIT_FOR_BASE'
    ? `핵심 저항 ${number(waitResistance)}은 매수가가 아닙니다. 베이스가 형성되고 피벗이 확정되기 전에는 진입가를 제시하지 않습니다.`
    : entryMode === 'PULLBACK' && entryZoneLow !== null && entryZoneHigh !== null
      ? `현재가는 추격 구간입니다. ${number(entryZoneLow)}~${number(entryZoneHigh)} 눌림 구간에서 지지 후 전일 고가 회복 또는 강한 종가 반전을 확인할 때만 진입을 재검토합니다.`
      : entryMode === 'NO_TRADE'
        ? '현재는 실행 가능한 진입 시나리오가 없습니다. 구조가 재정비될 때까지 거래하지 않습니다.'
        : `종가가 돌파 기준 ${number(triggerPrice)}를 넘고 거래량이 50일 평균의 1.4배 이상일 때만 진입을 검토합니다. 허용 추격 상단은 ${number(entryWindowHigh)}입니다.`;
  const primaryAction = entryMode === 'BREAKOUT' && entryZoneLow !== null && entryZoneHigh !== null
    ? `${number(entryZoneLow)}~${number(entryZoneHigh)}에서 계획 비중만 분할 진입합니다.`
    : entryMode === 'PULLBACK' && entryZoneLow !== null && entryZoneHigh !== null
      ? `${number(entryZoneLow)}~${number(entryZoneHigh)} 지지 확인 후에만 진입합니다.`
      : '현금을 유지하고 유효 피벗이 확정될 때까지 진입하지 않습니다.';
  const alternateCondition = triggerPrice !== null
    ? `돌파 후 ${number(triggerPrice)} 부근을 재시험하면서 거래량이 감소하고 종가가 다시 기준가 위로 회복합니다.`
    : levels.support !== null
      ? `핵심 지지 ${number(levels.support)}를 지킨 뒤 20일선을 회복하고 최소 3주 베이스를 완성합니다.`
      : '최소 3주 이상의 변동성 수축 베이스와 명확한 피벗을 새로 형성합니다.';
  const failureLevel = stopPrice ?? levels.support;
  const failureCondition = failureLevel !== null
    ? `${number(failureLevel)} 종가 이탈 또는 주봉 추세가 하락으로 전환되면 관찰 가설을 폐기합니다.`
    : '최근 스윙 저점 이탈 또는 주봉 추세 하락 전환 시 관찰 가설을 폐기합니다.';
  const scenarios: ProfessionalChartPlan['scenarios'] = [
    {
      id: 'PRIMARY',
      label: entryMode === 'PULLBACK' ? '기본 · 눌림 확인' : entryMode === 'BREAKOUT' ? '기본 · 거래량 돌파' : '기본 · 베이스 대기',
      condition: executionRule,
      action: primaryAction,
      zoneLow: entryZoneLow,
      zoneHigh: entryZoneHigh,
    },
    {
      id: 'ALTERNATE',
      label: '대안 · 재시험 후 회복',
      condition: alternateCondition,
      action: '반전 캔들 종가 확인 전에는 선진입하지 않습니다.',
      zoneLow: levels.support,
      zoneHigh: triggerPrice,
    },
    {
      id: 'FAILURE',
      label: '실패 · 가설 폐기',
      condition: failureCondition,
      action: '신규 진입을 취소하고 다음 베이스가 형성될 때까지 후보 우선순위를 내립니다.',
      zoneLow: failureLevel,
      zoneHigh: failureLevel,
    },
  ];

  return {
    setupGrade,
    readiness,
    verdict,
    trendScore,
    trendSummary,
    dailyTrend,
    weeklyTrend,
    timeframeAlignment,
    timeframeSummary,
    confluenceScore,
    confluenceFactors,
    entryMode,
    currentPrice,
    triggerPrice,
    referenceResistance,
    keySupport: levels.support,
    keyResistance: levels.resistance,
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
    scenarios,
  };
}
