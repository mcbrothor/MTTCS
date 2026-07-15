import type {
  Direction,
  EntryTargets,
  HighTightFlagAnalysis,
  OHLCData,
  PyramidPlan,
  RiskPlan,
  RiskPolicy,
  RiskStrategy,
  StopQuality,
  TrailingStops,
} from '../../../types/index.ts';
import { round } from './_shared.ts';
import { calculateMovingAverage, recentSwingLow } from './moving-average.ts';
import { evaluateRiskGate } from './risk-gate.ts';
import { buildRiskPolicyForStrategy, getRiskStrategyConfig, resolveAppliedRiskStrategy } from './risk-policy.ts';

const DEFAULT_MINERVINI_RISK_PERCENT = 0.01;
const MINERVINI_MAX_LOSS_PCT = 0.08;
const ADD_ON_CANDIDATE_PCTS = [0.02, 0.04] as const;
const ONL_PYRAMID_LEG_WEIGHTS = [0.5, 0.3, 0.2] as const;
const ONL_PYRAMID_ADD_ON_TRIGGER_PCT = 0.025;
const ONL_PYRAMID_INITIAL_STOP_LOSS_PCT = 0.05;
const ONL_PYRAMID_MAX_CONCURRENT_POSITIONS = 4;

export function calculatePositionSize(
  totalEquity: number,
  entryPrice: number,
  stopLossPrice: number,
  riskPercent: number = DEFAULT_MINERVINI_RISK_PERCENT
): {
  maxRisk: number;
  stopLossPrice: number;
  shares: number;
  riskPerShare: number;
} {
  if (
    entryPrice <= 0 ||
    stopLossPrice <= 0 ||
    stopLossPrice >= entryPrice ||
    riskPercent <= 0
  ) {
    return { maxRisk: 0, stopLossPrice: 0, shares: 0, riskPerShare: 0 };
  }

  const maxRisk = totalEquity > 0 ? totalEquity * riskPercent : 0;
  const riskPerShare = entryPrice - stopLossPrice;
  const shares = maxRisk > 0 ? Math.max(0, Math.floor(maxRisk / riskPerShare)) : 0;

  return {
    maxRisk: round(maxRisk),
    stopLossPrice: round(stopLossPrice),
    shares,
    riskPerShare: round(riskPerShare),
  };
}

function chooseMinerviniStop(
  entryPrice: number,
  invalidationPrice?: number | null,
  data?: OHLCData[],
  maxLossPct: number = MINERVINI_MAX_LOSS_PCT
) {
  const cappedStop = round(entryPrice * (1 - maxLossPct));
  const fallbackLow = data ? recentSwingLow(data) : null;
  const hasVcpInvalidation =
    typeof invalidationPrice === 'number' && invalidationPrice > 0 && invalidationPrice < entryPrice;
  const patternStop = hasVcpInvalidation
    ? round(invalidationPrice)
    : fallbackLow && fallbackLow > 0 && fallbackLow < entryPrice
      ? fallbackLow
      : null;

  if (!patternStop) {
    return { stopLossPrice: cappedStop, stopSource: 'MAX_LOSS_CAP' as const, invalidationPrice: null };
  }

  const stopLossPrice = Math.max(patternStop, cappedStop);
  return {
    stopLossPrice: round(stopLossPrice),
    stopSource: stopLossPrice === patternStop
      ? hasVcpInvalidation
        ? 'VCP_INVALIDATION' as const
        : 'RECENT_LOW_FALLBACK' as const
      : 'MAX_LOSS_CAP' as const,
    invalidationPrice: patternStop,
  };
}

function chooseHighTightFlagStop(entryPrice: number, highTightFlag: HighTightFlagAnalysis) {
  const cappedStop = round(entryPrice * 0.93);
  const baseLowStop = highTightFlag.baseLow > 0 && highTightFlag.baseLow < entryPrice
    ? round(highTightFlag.baseLow)
    : null;
  const stopLossPrice = Math.max(baseLowStop ?? 0, cappedStop);
  return {
    stopLossPrice,
    stopSource: baseLowStop !== null && stopLossPrice === baseLowStop ? 'HTF_BASE_LOW' as const : 'HTF_MAX_LOSS_CAP' as const,
    invalidationPrice: baseLowStop,
  };
}

function chooseAtrStop(entryPrice: number, atr: number, maxLossPct: number, atrStopMultiple: number, patternStop?: number | null) {
  const cappedStop = round(entryPrice * (1 - maxLossPct));
  const atrStop = atr > 0 ? round(entryPrice - atr * atrStopMultiple) : null;
  const candidates = [cappedStop, atrStop, patternStop].filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value < entryPrice
  );
  const stopLossPrice = candidates.length > 0 ? Math.max(...candidates) : cappedStop;
  const stopSource =
    atrStop !== null && stopLossPrice === atrStop
      ? 'ATR_STOP' as const
      : patternStop && stopLossPrice === patternStop
        ? 'VCP_INVALIDATION' as const
        : 'MAX_LOSS_CAP' as const;
  return {
    stopLossPrice: round(stopLossPrice),
    stopSource,
    atrStopPrice: atrStop,
    patternStopPrice: patternStop ?? null,
  };
}

function classifyStopQuality(entryPrice: number, stopLossPrice: number, atr: number): StopQuality {
  if (entryPrice <= 0 || stopLossPrice <= 0 || stopLossPrice >= entryPrice) return 'INVALID';
  if (atr <= 0) return 'UNKNOWN';
  const stopDistanceAtr = (entryPrice - stopLossPrice) / atr;
  if (stopDistanceAtr < 0.5) return 'TOO_TIGHT';
  if (stopDistanceAtr > 2.5) return 'TOO_WIDE';
  return 'VALID';
}

function classifyManualStopQuality(direction: Direction, entryPrice: number, stopLossPrice: number, atr: number): StopQuality {
  const riskPerShare = direction === 'SHORT' ? stopLossPrice - entryPrice : entryPrice - stopLossPrice;
  if (entryPrice <= 0 || stopLossPrice <= 0 || riskPerShare <= 0) return 'INVALID';
  if (atr <= 0) return 'UNKNOWN';
  const stopDistanceAtr = riskPerShare / atr;
  if (stopDistanceAtr < 0.5) return 'TOO_TIGHT';
  if (stopDistanceAtr > 2.5) return 'TOO_WIDE';
  return 'VALID';
}

function sharesForAmount(amount: number, price: number) {
  if (amount <= 0 || price <= 0) return 0;
  return Math.max(0, Math.floor(amount / price));
}

function weightedAverageCost(legs: { price: number; shares: number }[]) {
  const totalShares = legs.reduce((sum, leg) => sum + leg.shares, 0);
  if (totalShares <= 0) return 0;
  const totalCost = legs.reduce((sum, leg) => sum + leg.price * leg.shares, 0);
  return totalCost / totalShares;
}

export function calculateOnlPyramidPlan(
  totalEquity: number,
  entryPrice: number,
  riskPercent: number = DEFAULT_MINERVINI_RISK_PERCENT
): PyramidPlan | null {
  if (totalEquity <= 0 || entryPrice <= 0 || riskPercent <= 0) return null;

  const maxRiskAmount = totalEquity * riskPercent;
  const completedPositionAmount = maxRiskAmount / ONL_PYRAMID_INITIAL_STOP_LOSS_PCT;
  const prices = [
    entryPrice,
    entryPrice * (1 + ONL_PYRAMID_ADD_ON_TRIGGER_PCT),
    entryPrice * (1 + ONL_PYRAMID_ADD_ON_TRIGGER_PCT) ** 2,
  ];
  const plannedAmounts = ONL_PYRAMID_LEG_WEIGHTS.map((weight) => completedPositionAmount * weight);
  const initialStopPrice = entryPrice * (1 - ONL_PYRAMID_INITIAL_STOP_LOSS_PCT);

  let cumulativeShares = 0;
  let cumulativeAmount = 0;
  const executedLegs: { price: number; shares: number }[] = [];
  const rawLegs = prices.map((price, index) => {
    const shares = sharesForAmount(plannedAmounts[index], price);
    const actualAmount = shares * price;
    cumulativeShares += shares;
    cumulativeAmount += actualAmount;
    executedLegs.push({ price, shares });
    const averagePrice = weightedAverageCost(executedLegs);
    return {
      index,
      price,
      shares,
      actualAmount,
      cumulativeShares,
      cumulativeAmount,
      averagePrice,
    };
  });

  const completed = rawLegs[2];
  const minimumStopAfterEntry3 = completed.cumulativeShares > 0
    ? Math.max((completed.cumulativeAmount - maxRiskAmount) / completed.cumulativeShares, 0)
    : 0;
  const recommendedStopAfterEntry3 = Math.max(minimumStopAfterEntry3, entryPrice);

  const legs = rawLegs.map((leg) => {
    const stopPrice = leg.index === 2 ? recommendedStopAfterEntry3 : initialStopPrice;
    const openRisk = leg.cumulativeShares > 0
      ? Math.max(leg.averagePrice - stopPrice, 0) * leg.cumulativeShares
      : 0;
    const labels = ['1차 탐색', '2차 확인', '3차 완성'];
    const triggers = [
      '피벗/돌파 진입',
      `1차 진입가 대비 +${round(ONL_PYRAMID_ADD_ON_TRIGGER_PCT * 100, 1)}% 종가·거래량 확인`,
      `2차 진입가 대비 +${round(ONL_PYRAMID_ADD_ON_TRIGGER_PCT * 100, 1)}% 또는 미니 피벗 돌파`,
    ];
    return {
      leg: (`E${leg.index + 1}`) as 'E1' | 'E2' | 'E3',
      label: labels[leg.index],
      trigger: triggers[leg.index],
      price: round(leg.price),
      weightPct: ONL_PYRAMID_LEG_WEIGHTS[leg.index],
      plannedAmount: round(plannedAmounts[leg.index]),
      shares: leg.shares,
      cumulativeShares: leg.cumulativeShares,
      cumulativeAmount: round(leg.cumulativeAmount),
      averagePrice: round(leg.averagePrice, 4),
      stopPrice: round(stopPrice, 4),
      openRisk: round(openRisk),
      openRiskPct: totalEquity > 0 ? round(openRisk / totalEquity, 4) : 0,
      requiresStopRaise: leg.index === 2,
    };
  });

  const completedAveragePrice = completed.cumulativeShares > 0 ? completed.cumulativeAmount / completed.cumulativeShares : 0;
  const maxTheoreticalLoss = Math.max(completedAveragePrice - recommendedStopAfterEntry3, 0) * completed.cumulativeShares;

  return {
    policy: {
      model: 'ONL_PYRAMID',
      accountEquity: round(totalEquity),
      riskPct: riskPercent,
      maxRiskAmount: round(maxRiskAmount),
      initialStopLossPct: ONL_PYRAMID_INITIAL_STOP_LOSS_PCT,
      completedPositionAmount: round(completedPositionAmount),
      legWeights: [ONL_PYRAMID_LEG_WEIGHTS[0], ONL_PYRAMID_LEG_WEIGHTS[1], ONL_PYRAMID_LEG_WEIGHTS[2]],
      addOnTriggerPct: ONL_PYRAMID_ADD_ON_TRIGGER_PCT,
      maxConcurrentPositions: ONL_PYRAMID_MAX_CONCURRENT_POSITIONS,
      maxCompletedExposurePct: 0.8,
    },
    legs,
    initialStopPrice: round(initialStopPrice, 4),
    stopAfterEntry2: round(initialStopPrice, 4),
    minimumStopAfterEntry3: round(minimumStopAfterEntry3, 4),
    recommendedStopAfterEntry3: round(recommendedStopAfterEntry3, 4),
    completedAveragePrice: round(completedAveragePrice, 4),
    completedShares: completed.cumulativeShares,
    completedAmount: round(completed.cumulativeAmount),
    completedExposurePct: totalEquity > 0 ? round(completed.cumulativeAmount / totalEquity, 4) : 0,
    maxTheoreticalLoss: round(maxTheoreticalLoss),
    maxTheoreticalLossPct: totalEquity > 0 ? round(maxTheoreticalLoss / totalEquity, 4) : 0,
    ruleChecks: {
      noAveragingDown: true,
      requiresVolumeConfirmation: true,
      requiresStopRaiseOnE3: true,
    },
  };
}

export function calculateManualRiskPlan(
  totalEquity: number,
  entryPrice: number,
  stopLossPrice: number,
  targetPrice: number,
  riskPercent: number = DEFAULT_MINERVINI_RISK_PERCENT,
  options: {
    direction?: Direction;
    market?: 'US' | 'KR';
    atr?: number;
    riskPolicy?: RiskPolicy;
  } = {}
): RiskPlan {
  const direction = options.direction || 'LONG';
  const atr = options.atr ?? 0;
  const market = options.market || 'US';
  const riskPolicy = options.riskPolicy || buildRiskPolicyForStrategy(market, 'MANUAL_FIXED_RISK', riskPercent);
  const effectiveRiskPercent = Math.min(riskPercent, riskPolicy.maxSingleTradeRiskPct);
  const riskPerShare = direction === 'SHORT' ? stopLossPrice - entryPrice : entryPrice - stopLossPrice;
  const maxRisk = totalEquity > 0 && effectiveRiskPercent > 0 ? totalEquity * effectiveRiskPercent : 0;
  const validPrices =
    totalEquity > 0 &&
    entryPrice > 0 &&
    stopLossPrice > 0 &&
    targetPrice > 0 &&
    riskPerShare > 0 &&
    effectiveRiskPercent > 0;
  const shares = validPrices ? Math.max(0, Math.floor(maxRisk / riskPerShare)) : 0;
  const roundedRiskPerShare = riskPerShare > 0 ? round(riskPerShare) : 0;
  const plannedRisk = shares > 0 ? shares * riskPerShare : 0;
  const targetMove = direction === 'SHORT' ? entryPrice - targetPrice : targetPrice - entryPrice;
  const rewardRiskRatio = validPrices && targetMove > 0 && riskPerShare > 0
    ? round(targetMove / riskPerShare, 2)
    : null;
  const stopQuality = classifyManualStopQuality(direction, entryPrice, stopLossPrice, atr);
  const riskGate = evaluateRiskGate({
    policy: riskPolicy,
    totalEquity,
    candidateRisk: round(plannedRisk),
    stopQuality,
  });
  const entryTargets: EntryTargets = {
    e1: { label: '수동 진입', price: round(entryPrice), shares },
    e2: { label: '수동 목표가', price: round(targetPrice), shares: 0 },
    e3: { label: '수동 관리', price: round(targetPrice), shares: 0 },
  };
  const trailingStops: TrailingStops = {
    initial: round(stopLossPrice),
    afterEntry2: round(stopLossPrice),
    afterEntry3: round(stopLossPrice),
  };

  return {
    totalEquity,
    maxRisk: round(plannedRisk || maxRisk),
    riskPercent: effectiveRiskPercent,
    requestedStrategy: 'MANUAL_FIXED_RISK',
    atr: round(atr),
    entryPrice: round(entryPrice),
    stopLossPrice: validPrices ? round(stopLossPrice) : 0,
    riskPerShare: roundedRiskPerShare,
    initialRiskAmount: round(plannedRisk || maxRisk),
    initialRiskPct: totalEquity > 0 ? round((plannedRisk || maxRisk) / totalEquity, 4) : 0,
    effectiveRiskPct: riskGate.effectiveRiskPct,
    targetPrice: round(targetPrice),
    rewardRiskRatio,
    atrStopPrice: null,
    patternStopPrice: null,
    selectedStopPrice: validPrices ? round(stopLossPrice) : null,
    stopQuality,
    totalShares: shares,
    entryTargets,
    trailingStops,
    strategy: 'MANUAL_FIXED_RISK',
    riskModel: 'USER_DEFINED_STOP_TARGET',
    stopSource: 'USER_DEFINED',
    maxLossPct: entryPrice > 0 && riskPerShare > 0 ? round(riskPerShare / entryPrice, 4) : undefined,
    invalidationPrice: validPrices ? round(stopLossPrice) : null,
    riskPolicy,
    riskGate,
    riskNotes: [
      'Manual strategy uses the user-entered entry, stop, and target prices.',
      'Position size is calculated from fixed account risk divided by per-share risk.',
    ],
    pyramidPlan: null,
  };
}

export function calculateMinerviniRiskPlan(
  totalEquity: number,
  entryPrice: number,
  atr: number,
  riskPercent: number = DEFAULT_MINERVINI_RISK_PERCENT,
  invalidationPrice?: number | null,
  data?: OHLCData[],
  options: {
    strategy?: RiskPlan['strategy'];
    requestedRiskStrategy?: RiskStrategy;
    market?: 'US' | 'KR';
    riskPolicy?: RiskPolicy;
    highTightFlag?: HighTightFlagAnalysis | null;
  } = {}
): RiskPlan {
  const detectedStrategy = options.strategy === 'HIGH_TIGHT_FLAG' && options.highTightFlag?.passed
    ? 'HIGH_TIGHT_FLAG'
    : 'MINERVINI_VCP';
  const requestedStrategy = options.requestedRiskStrategy || 'AUTO';
  const appliedStrategy = resolveAppliedRiskStrategy(requestedStrategy, detectedStrategy, Boolean(options.highTightFlag?.passed));
  const strategyConfig = getRiskStrategyConfig(appliedStrategy);
  const market = options.market || 'US';
  const riskPolicy = options.riskPolicy || buildRiskPolicyForStrategy(market, appliedStrategy, riskPercent);
  const effectiveRiskPercent = Math.min(
    riskPercent * strategyConfig.riskMultiplier,
    riskPolicy.maxSingleTradeRiskPct
  );
  const useHighTightFlag = appliedStrategy === 'HIGH_TIGHT_FLAG' && options.highTightFlag?.passed;
  const minerviniStop = entryPrice > 0 ? chooseMinerviniStop(entryPrice, invalidationPrice, data, strategyConfig.maxLossPct) : null;
  const stop = entryPrice > 0
    ? appliedStrategy === 'ONL_PYRAMID'
      ? { stopLossPrice: round(entryPrice * (1 - ONL_PYRAMID_INITIAL_STOP_LOSS_PCT)), stopSource: 'MAX_LOSS_CAP' as const, invalidationPrice: null }
      : useHighTightFlag
      ? chooseHighTightFlagStop(entryPrice, options.highTightFlag!)
      : strategyConfig.preferAtrStop
        ? chooseAtrStop(entryPrice, atr, strategyConfig.maxLossPct, strategyConfig.atrStopMultiple, minerviniStop?.invalidationPrice)
        : minerviniStop!
    : { stopLossPrice: 0, stopSource: 'MAX_LOSS_CAP' as const, invalidationPrice: null };
  const position = calculatePositionSize(totalEquity, entryPrice, stop.stopLossPrice, effectiveRiskPercent);
  const recent10Low = data && data.length > 0 ? recentSwingLow(data, 10) : null;
  const ma10 = data && data.length >= 10 ? calculateMovingAverage(data, 10) : null;
  const stopQuality = classifyStopQuality(entryPrice, position.stopLossPrice, atr);
  const riskGate = evaluateRiskGate({
    policy: riskPolicy,
    totalEquity,
    candidateRisk: position.maxRisk,
    stopQuality,
  });
  const targetPrice = position.riskPerShare > 0 ? round(entryPrice + position.riskPerShare * 2) : null;
  const rewardRiskRatio = targetPrice !== null && position.riskPerShare > 0
    ? round((targetPrice - entryPrice) / position.riskPerShare, 2)
    : null;
  const pyramidPlan = appliedStrategy === 'ONL_PYRAMID'
    ? calculateOnlPyramidPlan(totalEquity, entryPrice, effectiveRiskPercent)
    : null;
  const riskPolicySnapshot = pyramidPlan ? { ...riskPolicy, pyramidPlan } : riskPolicy;

  const entryTargets: EntryTargets = {
    e1: pyramidPlan
      ? {
          label: pyramidPlan.legs[0].label,
          price: pyramidPlan.legs[0].price,
          shares: pyramidPlan.legs[0].shares,
          amount: pyramidPlan.legs[0].plannedAmount,
          weightPct: pyramidPlan.legs[0].weightPct,
          cumulativeAmount: pyramidPlan.legs[0].cumulativeAmount,
          averagePrice: pyramidPlan.legs[0].averagePrice,
          stopPrice: pyramidPlan.legs[0].stopPrice,
          openRisk: pyramidPlan.legs[0].openRisk,
        }
      : { label: '피벗 돌파 진입', price: round(entryPrice), shares: position.shares },
    e2: pyramidPlan
      ? {
          label: pyramidPlan.legs[1].label,
          price: pyramidPlan.legs[1].price,
          shares: pyramidPlan.legs[1].shares,
          amount: pyramidPlan.legs[1].plannedAmount,
          weightPct: pyramidPlan.legs[1].weightPct,
          cumulativeAmount: pyramidPlan.legs[1].cumulativeAmount,
          averagePrice: pyramidPlan.legs[1].averagePrice,
          stopPrice: pyramidPlan.legs[1].stopPrice,
          openRisk: pyramidPlan.legs[1].openRisk,
        }
      : {
          label: strategyConfig.preferAtrStop ? '추가매수 후보 +0.5ATR' : '추가매수 후보 +2%',
          price: strategyConfig.preferAtrStop && atr > 0
            ? round(entryPrice + atr * strategyConfig.pyramidSpacingAtr)
            : round(entryPrice * (1 + ADD_ON_CANDIDATE_PCTS[0])),
          shares: 0,
        },
    e3: pyramidPlan
      ? {
          label: pyramidPlan.legs[2].label,
          price: pyramidPlan.legs[2].price,
          shares: pyramidPlan.legs[2].shares,
          amount: pyramidPlan.legs[2].plannedAmount,
          weightPct: pyramidPlan.legs[2].weightPct,
          cumulativeAmount: pyramidPlan.legs[2].cumulativeAmount,
          averagePrice: pyramidPlan.legs[2].averagePrice,
          stopPrice: pyramidPlan.legs[2].stopPrice,
          openRisk: pyramidPlan.legs[2].openRisk,
        }
      : {
          label: strategyConfig.preferAtrStop ? '추가매수 후보 +1.0ATR' : '추가매수 후보 +4%',
          price: strategyConfig.preferAtrStop && atr > 0
            ? round(entryPrice + atr * strategyConfig.pyramidSpacingAtr * 2)
            : round(entryPrice * (1 + ADD_ON_CANDIDATE_PCTS[1])),
          shares: 0,
        },
  };

  const trailingStops: TrailingStops = {
    initial: position.stopLossPrice,
    afterEntry2: pyramidPlan ? pyramidPlan.stopAfterEntry2 : round(entryPrice),
    afterEntry3: pyramidPlan
      ? pyramidPlan.recommendedStopAfterEntry3
      : useHighTightFlag
      ? round(Math.max(entryPrice, recent10Low || 0, ma10 || 0))
      : round(entryTargets.e2.price),
  };
  const riskNotes = useHighTightFlag
    ? [
        'High Tight Flag uses a tighter initial stop: max(base low, 7% loss cap).',
        'Move to breakeven around +5%; after +10%, trail with the higher of MA10 or recent 10-day low.',
      ]
    : appliedStrategy === 'ATR_VOLATILITY'
      ? ['ATR volatility strategy sizes the position from the tighter of pattern, max-loss, and ATR stop candidates.']
      : appliedStrategy === 'ONL_PYRAMID'
        ? [
            'ONL pyramid splits the completed position into 50%/30%/20% legs.',
            'Only add after price confirms strength; never add to a losing position.',
            'After E3, raise the stop to at least the required risk-preserving stop, preferably breakeven or better.',
          ]
      : appliedStrategy === 'CONSERVATIVE'
        ? ['Conservative strategy halves the input risk and uses a tighter 6%/1.5ATR risk envelope.']
        : ['Standard VCP uses pattern invalidation with an 8% max-loss cap.'];
  const totalShares = pyramidPlan?.completedShares ?? position.shares;

  return {
    totalEquity,
    maxRisk: position.maxRisk,
    riskPercent: effectiveRiskPercent,
    requestedStrategy,
    atr: round(atr),
    entryPrice: round(entryPrice),
    stopLossPrice: position.stopLossPrice,
    riskPerShare: position.riskPerShare,
    initialRiskAmount: position.maxRisk,
    initialRiskPct: totalEquity > 0 ? round(position.maxRisk / totalEquity, 4) : 0,
    effectiveRiskPct: riskGate.effectiveRiskPct,
    targetPrice,
    rewardRiskRatio,
    atrStopPrice: 'atrStopPrice' in stop ? stop.atrStopPrice : atr > 0 ? round(entryPrice - atr * strategyConfig.atrStopMultiple) : null,
    patternStopPrice: 'patternStopPrice' in stop ? stop.patternStopPrice : minerviniStop?.invalidationPrice ?? null,
    selectedStopPrice: position.stopLossPrice,
    stopQuality,
    totalShares,
    entryTargets,
    trailingStops,
    strategy: appliedStrategy,
    riskModel: useHighTightFlag
      ? 'HIGH_TIGHT_FLAG_TIGHT_STOP'
      : appliedStrategy === 'ATR_VOLATILITY'
        ? 'ATR_VOLATILITY_STOP'
        : appliedStrategy === 'CONSERVATIVE'
          ? 'CONSERVATIVE_TIGHT_STOP'
          : 'PATTERN_INVALIDATION',
    stopSource: stop.stopSource,
    maxLossPct: useHighTightFlag ? 0.07 : strategyConfig.maxLossPct,
    invalidationPrice: 'invalidationPrice' in stop ? stop.invalidationPrice : minerviniStop?.invalidationPrice ?? null,
    riskPolicy: riskPolicySnapshot,
    riskGate,
    riskNotes,
    pyramidPlan,
  };
}
