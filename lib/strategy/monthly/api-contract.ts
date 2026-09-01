import type { MonthlyStrategySnapshot } from './types';

export function toMonthlyStrategyApi(snapshot: MonthlyStrategySnapshot) {
  return {
    ...snapshot,
    version: snapshot.modelVersion,
    asOf: snapshot.signalAt,
    rsAverage: snapshot.averageRelativeMomentum === null ? null : snapshot.averageRelativeMomentum / 100,
    regime: snapshot.regime ? {
      ...snapshot.regime,
      weightFraction: snapshot.regime.weight,
      weight: snapshot.regime.weight * 100,
    } : null,
    portfolio: snapshot.portfolio.map((target) => ({
      ...target,
      targetWeightPct: target.targetWeight * 100,
    })),
    cashWeightPct: snapshot.cashWeight * 100,
  };
}
