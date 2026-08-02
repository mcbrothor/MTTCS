export type StrategyCapitalSource = 'MANUAL' | 'PORTFOLIO';
export type StrategyExecutionAction = 'BUY' | 'SELL';
export type StrategyExecutionSleeve = 'CORE' | 'TACTICAL' | 'REDUCE';
export type StrategyExecutionStatus = 'READY' | 'WAIT';

export interface StrategyExecutionStep {
  sequence: number;
  action: StrategyExecutionAction;
  sleeve: StrategyExecutionSleeve;
  product: string;
  amount: number;
  units: number;
  percentOfPlan: number;
  condition: string;
  status: StrategyExecutionStatus;
}

function rounded(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function resolveCalculationCapital(
  portfolioAccountValue: number,
  manualAccountValue: number | null,
) {
  return manualAccountValue !== null && manualAccountValue > 0
    ? manualAccountValue
    : Math.max(0, portfolioAccountValue);
}

export function capitalSource(
  manualAccountValue: number | null,
): StrategyCapitalSource {
  return manualAccountValue !== null && manualAccountValue > 0
    ? 'MANUAL'
    : 'PORTFOLIO';
}

export function buildSplitExecutionSteps(input: {
  action: StrategyExecutionAction;
  sleeve: StrategyExecutionSleeve;
  product: string;
  totalAmount: number;
  weights: readonly number[];
  unitPriceInBase: number | null;
  conditions: readonly string[];
  ready: boolean;
  precision?: number;
}): StrategyExecutionStep[] {
  const precision = Math.max(0, Math.min(4, Math.floor(input.precision ?? 2)));
  const totalAmount = rounded(Math.max(0, input.totalAmount), precision);
  const weightTotal = input.weights.reduce(
    (sum, weight) => sum + Math.max(0, weight),
    0,
  );
  if (totalAmount <= 0 || weightTotal <= 0 || input.weights.length === 0) return [];

  let allocated = 0;
  return input.weights.map((rawWeight, index) => {
    const weight = Math.max(0, rawWeight);
    const amount = index === input.weights.length - 1
      ? rounded(totalAmount - allocated, precision)
      : rounded(totalAmount * weight / weightTotal, precision);
    allocated = rounded(allocated + amount, precision);
    const unitPrice = input.unitPriceInBase && input.unitPriceInBase > 0
      ? input.unitPriceInBase
      : null;
    return {
      sequence: index + 1,
      action: input.action,
      sleeve: input.sleeve,
      product: input.product,
      amount,
      units: unitPrice ? Math.floor(amount / unitPrice) : 0,
      percentOfPlan: rounded(weight / weightTotal * 100, 2),
      condition: input.conditions[index] ?? input.conditions.at(-1) ?? '조건 확인',
      status: input.ready ? 'READY' : 'WAIT',
    };
  });
}
