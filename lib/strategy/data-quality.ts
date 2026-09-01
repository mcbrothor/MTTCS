export type StrategyDataQualityStatus = 'VALID' | 'DEGRADED';

export interface StrategyDataQuality {
  status: StrategyDataQualityStatus;
  asOf: string;
  requested: number;
  available: number;
  warnings: string[];
}

export class StrategyDataUnavailableError extends Error {
  readonly code = 'STRATEGY_DATA_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'StrategyDataUnavailableError';
  }
}

export function isStrategyDataUnavailableError(error: unknown): error is StrategyDataUnavailableError {
  return error instanceof StrategyDataUnavailableError
    || (error instanceof Error && error.name === 'StrategyDataUnavailableError');
}

export function requireStrategyCoverage(quality: StrategyDataQuality, minimum = 0.8) {
  const coverage = quality.requested > 0 ? quality.available / quality.requested : 0;
  if (coverage < minimum) {
    throw new StrategyDataUnavailableError(
      `Strategy universe coverage is insufficient (${quality.available}/${quality.requested}; minimum ${Math.round(minimum * 100)}%).`,
    );
  }
}
