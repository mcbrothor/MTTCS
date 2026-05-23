import type {
  EntryTargets,
  HighTightFlagAnalysis,
  OHLCData,
  RiskPlan,
  TrailingStops,
} from '../../../types/index.ts';
import { round } from './_shared.ts';
import { calculateMovingAverage, recentSwingLow } from './moving-average.ts';

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

export function calculateMinerviniRiskPlan(
  totalEquity: number,
  entryPrice: number,
  atr: number,
  riskPercent: number = DEFAULT_MINERVINI_RISK_PERCENT,
  invalidationPrice?: number | null,
  data?: OHLCData[],
  options: {
    strategy?: RiskPlan['strategy'];
    highTightFlag?: HighTightFlagAnalysis | null;
  } = {}
): RiskPlan {
  const useHighTightFlag = options.strategy === 'HIGH_TIGHT_FLAG' && options.highTightFlag?.passed;
  const stop = entryPrice > 0
    ? useHighTightFlag
      ? chooseHighTightFlagStop(entryPrice, options.highTightFlag!)
      : chooseMinerviniStop(entryPrice, invalidationPrice, data)
    : { stopLossPrice: 0, stopSource: 'MAX_LOSS_CAP' as const, invalidationPrice: null };
  const position = calculatePositionSize(totalEquity, entryPrice, stop.stopLossPrice, riskPercent);
  const recent10Low = data && data.length > 0 ? recentSwingLow(data, 10) : null;
  const ma10 = data && data.length >= 10 ? calculateMovingAverage(data, 10) : null;

  const entryTargets: EntryTargets = {
    e1: { label: '피벗 돌파 진입', price: round(entryPrice), shares: position.shares },
    e2: { label: '추가매수 후보 +2%', price: round(entryPrice * (1 + ADD_ON_CANDIDATE_PCTS[0])), shares: 0 },
    e3: { label: '추가매수 후보 +4%', price: round(entryPrice * (1 + ADD_ON_CANDIDATE_PCTS[1])), shares: 0 },
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
    : ['Standard VCP uses pattern invalidation with an 8% max-loss cap.'];

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
    strategy: useHighTightFlag ? 'HIGH_TIGHT_FLAG' : 'MINERVINI_VCP',
    riskModel: useHighTightFlag ? 'HIGH_TIGHT_FLAG_TIGHT_STOP' : 'PATTERN_INVALIDATION',
    stopSource: stop.stopSource,
    maxLossPct: useHighTightFlag ? 0.07 : MINERVINI_MAX_LOSS_PCT,
    invalidationPrice: stop.invalidationPrice,
    riskNotes,
  };
}
