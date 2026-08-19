import type { MarketSentimentSnapshot } from '@/types';

const MODEL_VERSION = 'kr-fear-greed-rolling252-v1';

export interface MarketSentimentInput {
  date: string;
  indexClose: number | null;
  putCall: number | null;
  vkospi: number | null;
  bond10: number | null;
  bond5: number | null;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ema(values: number[], period: number) {
  if (values.length === 0) return [];
  const alpha = 2 / (period + 1);
  const result = [values[0]];
  for (const value of values.slice(1)) result.push(value * alpha + result.at(-1)! * (1 - alpha));
  return result;
}

function rollingNormalize(values: Array<number | null>, index: number, invert = false) {
  const window = values.slice(Math.max(0, index - 251), index + 1).filter((value): value is number => value !== null && Number.isFinite(value));
  const current = values[index];
  if (current === null || window.length < 20) return null;
  const min = Math.min(...window);
  const max = Math.max(...window);
  const normalized = max === min ? 50 : ((current - min) / (max - min)) * 100;
  return invert ? 100 - normalized : normalized;
}

function rsi(values: Array<number | null>, index: number, period = 10) {
  if (index < period || values[index] === null) return null;
  let gains = 0;
  let losses = 0;
  for (let offset = index - period + 1; offset <= index; offset += 1) {
    const current = values[offset];
    const previous = values[offset - 1];
    if (current === null || previous === null) return null;
    const change = current - previous;
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

function round(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function label(score: number): MarketSentimentSnapshot['label'] {
  if (score <= 20) return 'EXTREME_FEAR';
  if (score <= 40) return 'FEAR';
  if (score < 60) return 'NEUTRAL';
  if (score < 80) return 'GREED';
  return 'EXTREME_GREED';
}

export function calculateMarketSentiment(input: {
  rows: MarketSentimentInput[];
  provider: string;
  asOf?: string;
}): MarketSentimentSnapshot {
  const rows = [...input.rows].sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows.at(-1);
  const asOf = input.asOf || latest?.date || new Date().toISOString();
  const missingInputs = latest
    ? [
      latest.indexClose === null ? 'KOSPI/KOSDAQ 지수' : null,
      latest.putCall === null ? 'Put/Call' : null,
      latest.vkospi === null ? 'VKOSPI' : null,
      latest.bond10 === null || latest.bond5 === null ? '10년-5년 국채선물' : null,
    ].filter((value): value is string => value !== null)
    : ['KOSPI/KOSDAQ 지수', 'Put/Call', 'VKOSPI', '10년-5년 국채선물'];
  const blocked = (warnings: string[]): MarketSentimentSnapshot => ({
    asOf,
    provider: input.provider,
    quality: 'BLOCKED',
    modelVersion: MODEL_VERSION,
    warnings,
    market: 'KR',
    score: null,
    label: 'BLOCKED',
    components: { indexMomentum: null, putCall: null, vkospi: null, bondSpread: null, rsi10: null },
    macd: { value: null, signal: null, histogram: null, direction: 'UNKNOWN' },
    missingInputs,
  });
  if (!latest || missingInputs.length > 0) return blocked([`필수 데이터 누락: ${missingInputs.join(', ')}`]);
  if (rows.length < 126) return blocked([`125일선 계산에 126거래일이 필요하지만 ${rows.length}일만 있습니다.`]);

  const indexValues = rows.map((row) => row.indexClose);
  const momentumValues = rows.map((row, index) => {
    if (row.indexClose === null || index < 124) return null;
    const history = indexValues.slice(index - 124, index + 1).filter((value): value is number => value !== null);
    return history.length === 125 ? (row.indexClose / average(history) - 1) * 100 : null;
  });
  const putCalls = rows.map((row) => row.putCall);
  const vkospis = rows.map((row) => row.vkospi);
  const bondSpreads = rows.map((row) => row.bond10 === null || row.bond5 === null ? null : row.bond10 - row.bond5);
  const index = rows.length - 1;
  const components = {
    indexMomentum: rollingNormalize(momentumValues, index),
    putCall: rollingNormalize(putCalls, index, true),
    vkospi: rollingNormalize(vkospis, index, true),
    bondSpread: rollingNormalize(bondSpreads, index),
    rsi10: rsi(indexValues, index),
  };
  if (Object.values(components).some((value) => value === null)) {
    return blocked(['롤링 정규화에 필요한 유효 관측치가 부족합니다.']);
  }

  const scoreHistory = rows.map((_, rowIndex) => {
    const values = [
      rollingNormalize(momentumValues, rowIndex),
      rollingNormalize(putCalls, rowIndex, true),
      rollingNormalize(vkospis, rowIndex, true),
      rollingNormalize(bondSpreads, rowIndex),
      rsi(indexValues, rowIndex),
    ];
    return values.every((value): value is number => value !== null) ? average(values) : null;
  }).filter((value): value is number => value !== null);
  const score = average(Object.values(components) as number[]);
  const macdLine = (() => {
    const fast = ema(scoreHistory, 12);
    const slow = ema(scoreHistory, 26);
    return fast.map((value, itemIndex) => value - slow[itemIndex]);
  })();
  const signalLine = ema(macdLine, 9);
  const macd = macdLine.at(-1) ?? null;
  const signalValue = signalLine.at(-1) ?? null;
  const histogram = macd === null || signalValue === null ? null : macd - signalValue;
  const priorHistogram = macdLine.length >= 2 && signalLine.length >= 2
    ? macdLine[macdLine.length - 2] - signalLine[signalLine.length - 2]
    : null;
  const direction = histogram === null || priorHistogram === null
    ? 'UNKNOWN'
    : histogram > priorHistogram ? 'UP' : histogram < priorHistogram ? 'DOWN' : 'FLAT';
  const warnings = rows.length < 252 ? ['252거래일 미만 구간은 가용 기간 롤링 정규화를 사용했습니다.'] : [];

  return {
    asOf,
    provider: input.provider,
    quality: rows.length >= 252 ? 'FULL' : 'DEGRADED',
    modelVersion: MODEL_VERSION,
    warnings,
    market: 'KR',
    score: round(score),
    label: label(score),
    components: {
      indexMomentum: round(components.indexMomentum),
      putCall: round(components.putCall),
      vkospi: round(components.vkospi),
      bondSpread: round(components.bondSpread),
      rsi10: round(components.rsi10),
    },
    macd: { value: round(macd), signal: round(signalValue), histogram: round(histogram), direction },
    missingInputs: [],
  };
}
