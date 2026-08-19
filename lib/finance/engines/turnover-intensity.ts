import type { OHLCData, TurnoverIntensitySignal } from '@/types';

const MODEL_VERSION = 'turnover-intensity-v1';

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function ema(values: number[], period: number) {
  if (values.length === 0) return null;
  const alpha = 2 / (period + 1);
  return values.slice(1).reduce((value, item) => item * alpha + value * (1 - alpha), values[0]);
}

function round(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateTurnoverIntensity(input: {
  ticker: string;
  bars: OHLCData[];
  provider: string;
  turnoverRates?: number[];
  asOf?: string;
}): TurnoverIntensitySignal {
  const bars = [...input.bars].sort((a, b) => a.date.localeCompare(b.date));
  const warnings: string[] = [];
  if (bars.length < 60) {
    return {
      ticker: input.ticker,
      asOf: input.asOf || bars.at(-1)?.date || new Date().toISOString(),
      provider: input.provider,
      quality: 'BLOCKED',
      modelVersion: MODEL_VERSION,
      warnings: [`60거래일이 필요하지만 ${bars.length}일만 있습니다.`],
      raw: null,
      sma3: null,
      ema5: null,
      ema7: null,
      components: { volumeSpike: null, turnoverZScore: null, gapTrend: null },
      timing: 'BLOCKED',
    };
  }
  if (!input.turnoverRates) warnings.push('유통주식수 데이터가 없어 거래대금을 회전율 대용치로 사용했습니다.');

  const rawSeries: number[] = [];
  let latestComponents = { volumeSpike: 0, turnoverZScore: 0, gapTrend: 0 };
  for (let index = 59; index < bars.length; index += 1) {
    const bar = bars[index];
    const prior20 = bars.slice(index - 20, index);
    const volumeAverage20 = average(prior20.map((row) => row.volume));
    const volumeRatio = volumeAverage20 > 0 ? bar.volume / volumeAverage20 : 1;
    const volumeSpike = clamp(50 + (volumeRatio - 1) * 50);
    const turnoverSeries = input.turnoverRates?.length === bars.length
      ? input.turnoverRates.slice(index - 59, index + 1)
      : bars.slice(index - 59, index + 1).map((row) => row.close * row.volume);
    const priorTurnover = turnoverSeries.slice(0, -1);
    const sd = standardDeviation(priorTurnover);
    const zScore = sd > 0 ? (turnoverSeries.at(-1)! - average(priorTurnover)) / sd : 0;
    const turnoverZScore = clamp(50 + zScore * 15);
    const gaps: number[] = [];
    for (let offset = Math.max(1, index - 6); offset <= index; offset += 1) {
      const previousClose = bars[offset - 1].close;
      if (previousClose > 0) gaps.push(((bars[offset].open - previousClose) / previousClose) * 100);
    }
    const gapTrend = clamp(50 + average(gaps) * 20);
    latestComponents = { volumeSpike, turnoverZScore, gapTrend };
    rawSeries.push(volumeSpike * 0.5 + turnoverZScore * 0.3 + gapTrend * 0.2);
  }

  const raw = rawSeries.at(-1)!;
  const sma3 = average(rawSeries.slice(-3));
  const ema5 = ema(rawSeries, 5)!;
  const ema7 = ema(rawSeries, 7)!;
  const timing = raw >= ema5 && ema5 >= ema7 && raw >= 60
    ? 'ACCELERATING'
    : raw < ema5 && ema5 < ema7
      ? 'COOLING'
      : 'NEUTRAL';
  return {
    ticker: input.ticker,
    asOf: input.asOf || bars.at(-1)!.date,
    provider: input.provider,
    quality: input.turnoverRates ? 'FULL' : 'DEGRADED',
    modelVersion: MODEL_VERSION,
    warnings,
    raw: round(raw),
    sma3: round(sma3),
    ema5: round(ema5),
    ema7: round(ema7),
    components: {
      volumeSpike: round(latestComponents.volumeSpike),
      turnoverZScore: round(latestComponents.turnoverZScore),
      gapTrend: round(latestComponents.gapTrend),
    },
    timing,
  };
}
