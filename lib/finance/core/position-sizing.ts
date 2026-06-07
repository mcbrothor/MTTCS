import type {
  EntryTargets,
  HighTightFlagAnalysis,
  OHLCData,
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
    totalEquity <= 0 ||
    entryPrice <= 0 ||
    stopLossPrice <= 0 ||
    stopLossPrice >= entryPrice ||
    riskPercent <= 0
  ) {
    return { maxRisk: 0, stopLossPrice: 0, shares: 0, riskPerShare: 0 };
  }

  const maxRisk = totalEquity * riskPercent;
  const riskPerShare = entryPrice - stopLossPrice;
  const shares = Math.max(0, Math.floor(maxRisk / riskPerShare));

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
    ? useHighTightFlag
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

  const entryTargets: EntryTargets = {
    e1: { label: '피벗 돌파 진입', price: round(entryPrice), shares: position.shares },
    e2: {
      label: strategyConfig.preferAtrStop ? '추가매수 후보 +0.5ATR' : '추가매수 후보 +2%',
      price: strategyConfig.preferAtrStop && atr > 0
        ? round(entryPrice + atr * strategyConfig.pyramidSpacingAtr)
        : round(entryPrice * (1 + ADD_ON_CANDIDATE_PCTS[0])),
      shares: 0,
    },
    e3: {
      label: strategyConfig.preferAtrStop ? '추가매수 후보 +1.0ATR' : '추가매수 후보 +4%',
      price: strategyConfig.preferAtrStop && atr > 0
        ? round(entryPrice + atr * strategyConfig.pyramidSpacingAtr * 2)
        : round(entryPrice * (1 + ADD_ON_CANDIDATE_PCTS[1])),
      shares: 0,
    },
  };

  const trailingStops: TrailingStops = {
    initial: position.stopLossPrice,
    afterEntry2: round(entryPrice),
    afterEntry3: useHighTightFlag
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
      : appliedStrategy === 'CONSERVATIVE'
        ? ['Conservative strategy halves the input risk and uses a tighter 6%/1.5ATR risk envelope.']
        : ['Standard VCP uses pattern invalidation with an 8% max-loss cap.'];

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
    totalShares: position.shares,
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
    riskPolicy,
    riskGate,
    riskNotes,
  };
}
