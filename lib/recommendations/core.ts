import { HORIZON_SESSIONS, MARKET_SESSION } from './config';
import type {
  DiagnosticFinding,
  DiagnosticInput,
  RecommendationBar,
  RecommendationHorizon,
  RecommendationMarket,
  RecommendationPerformanceResult,
  RecommendationQuality,
} from './types';

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function groupBy<T>(rows: T[], keyFor: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = grouped.get(key) || [];
    group.push(row);
    grouped.set(key, group);
  }
  return grouped;
}

function localDateTime(instant: string | Date, market: RecommendationMarket) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid recommendation generated_at.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_SESSION[market].timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

export function resolveFirstTradableIndex(
  generatedAt: string | Date,
  market: RecommendationMarket,
  bars: Pick<RecommendationBar, 'date'>[]
) {
  const local = localDateTime(generatedAt, market);
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.findIndex((bar) => {
    if (bar.date > local.date) return true;
    if (bar.date < local.date) return false;
    return local.minutes < MARKET_SESSION[market].openMinutes;
  });
}

function worstQuality(...qualities: (RecommendationQuality | undefined)[]): RecommendationQuality {
  const order: RecommendationQuality[] = ['FULL', 'FALLBACK', 'UNADJUSTED', 'ANOMALY', 'MISSING'];
  return qualities.reduce<RecommendationQuality>((worst, quality) => {
    const next = quality || 'FULL';
    return order.indexOf(next) > order.indexOf(worst) ? next : worst;
  }, 'FULL');
}

export function calculateRecommendationPerformance(input: {
  generatedAt: string | Date;
  market: RecommendationMarket;
  horizon: RecommendationHorizon;
  bars: RecommendationBar[];
  benchmarkBars: RecommendationBar[];
}): RecommendationPerformanceResult {
  const bars = [...input.bars].sort((a, b) => a.date.localeCompare(b.date));
  const benchmarkBars = [...input.benchmarkBars].sort((a, b) => a.date.localeCompare(b.date));
  const benchmarkByDate = new Map(benchmarkBars.map((bar) => [bar.date, bar]));
  const barByDate = new Map(bars.map((bar) => [bar.date, bar]));
  const entryIndex = resolveFirstTradableIndex(input.generatedAt, input.market, bars);
  const empty = (status: RecommendationPerformanceResult['status'], message: string | null): RecommendationPerformanceResult => ({
    horizon: input.horizon,
    status,
    sessionCount: 0,
    entryDate: null,
    entryPrice: null,
    evaluationDate: null,
    evaluationPrice: null,
    benchmarkEntryPrice: null,
    benchmarkEvaluationPrice: null,
    returnPct: null,
    benchmarkReturnPct: null,
    excessReturnPct: null,
    mfePct: null,
    maePct: null,
    qualityStatus: 'MISSING',
    errorMessage: message,
  });

  if (entryIndex < 0) return empty('PENDING', null);
  const entry = bars[entryIndex];
  const benchmarkEntry = benchmarkByDate.get(entry.date);
  if (!validPrice(entry.open) || !benchmarkEntry || !validPrice(benchmarkEntry.open)) {
    return empty('EXCLUDED', 'Entry or benchmark open price is unavailable.');
  }

  const benchmarkEntryIndex = benchmarkBars.findIndex((bar) => bar.date === entry.date);
  if (benchmarkEntryIndex < 0) {
    return empty('EXCLUDED', 'Entry date is not a benchmark trading session.');
  }

  const requestedSessions = HORIZON_SESSIONS[input.horizon];
  const benchmarkTargetIndex = requestedSessions === null
    ? benchmarkBars.length - 1
    : benchmarkEntryIndex + requestedSessions;
  if (benchmarkTargetIndex >= benchmarkBars.length) {
    return {
      ...empty('PENDING', null),
      sessionCount: Math.max(0, benchmarkBars.length - benchmarkEntryIndex - 1),
      entryDate: entry.date,
      entryPrice: entry.open,
      benchmarkEntryPrice: benchmarkEntry.open,
      qualityStatus: worstQuality(entry.qualityStatus, benchmarkEntry.qualityStatus),
    };
  }

  const benchmarkEvaluation = benchmarkBars[benchmarkTargetIndex];
  const evaluation = barByDate.get(benchmarkEvaluation.date);
  if (!evaluation) {
    return {
      ...empty('EXCLUDED', 'Security price is unavailable on the benchmark evaluation date.'),
      sessionCount: benchmarkTargetIndex - benchmarkEntryIndex,
      entryDate: entry.date,
      entryPrice: entry.open,
      evaluationDate: benchmarkEvaluation.date,
      benchmarkEntryPrice: benchmarkEntry.open,
      benchmarkEvaluationPrice: validPrice(benchmarkEvaluation.close) ? benchmarkEvaluation.close : null,
      qualityStatus: worstQuality(entry.qualityStatus, benchmarkEntry.qualityStatus, benchmarkEvaluation.qualityStatus),
    };
  }
  if (!benchmarkEvaluation || !validPrice(evaluation.close) || !validPrice(benchmarkEvaluation.close)) {
    return empty('EXCLUDED', 'Evaluation or benchmark close price is unavailable.');
  }

  const window = bars.filter((bar) => bar.date >= entry.date && bar.date <= evaluation.date);
  const quality = worstQuality(
    ...window.map((bar) => bar.qualityStatus),
    benchmarkEntry.qualityStatus,
    benchmarkEvaluation.qualityStatus
  );
  if (quality === 'ANOMALY' || quality === 'MISSING') {
    return {
      ...empty('EXCLUDED', 'Price data failed quality validation.'),
      sessionCount: benchmarkTargetIndex - benchmarkEntryIndex,
      entryDate: entry.date,
      entryPrice: entry.open,
      evaluationDate: evaluation.date,
      evaluationPrice: evaluation.close,
      qualityStatus: quality,
    };
  }

  const returnPct = round(((evaluation.close / entry.open) - 1) * 100);
  const benchmarkReturnPct = round(((benchmarkEvaluation.close / benchmarkEntry.open) - 1) * 100);
  return {
    horizon: input.horizon,
    status: 'MATURED',
    sessionCount: benchmarkTargetIndex - benchmarkEntryIndex,
    entryDate: entry.date,
    entryPrice: round(entry.open, 6),
    evaluationDate: evaluation.date,
    evaluationPrice: round(evaluation.close, 6),
    benchmarkEntryPrice: round(benchmarkEntry.open, 6),
    benchmarkEvaluationPrice: round(benchmarkEvaluation.close, 6),
    returnPct,
    benchmarkReturnPct,
    excessReturnPct: round(returnPct - benchmarkReturnPct),
    mfePct: round((Math.max(...window.map((bar) => bar.high)) / entry.open - 1) * 100),
    maePct: round((Math.min(...window.map((bar) => bar.low)) / entry.open - 1) * 100),
    qualityStatus: quality,
    errorMessage: null,
  };
}

export function markPriceAnomalies(bars: RecommendationBar[], thresholdPct = 40): RecommendationBar[] {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((bar, index) => {
    const previous = sorted[index - 1];
    if (!previous || !validPrice(previous.close) || !validPrice(bar.close)) return bar;
    const changePct = Math.abs((bar.close / previous.close - 1) * 100);
    return changePct >= thresholdPct ? { ...bar, qualityStatus: 'ANOMALY' } : bar;
  });
}

export function wilsonInterval(successes: number, total: number, z = 1.96) {
  if (total <= 0) return { low: null, high: null };
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const spread = (z / denominator) * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return { low: round(Math.max(0, center - spread), 4), high: round(Math.min(1, center + spread), 4) };
}

export function meanConfidenceInterval(values: number[], z = 1.96) {
  if (values.length < 2) return { mean: values[0] ?? null, low: null, high: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const margin = z * Math.sqrt(variance / values.length);
  return { mean: round(mean), low: round(mean - margin), high: round(mean + margin) };
}

export function buildDiagnosticFindings(rows: DiagnosticInput[]): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  for (const row of rows) {
    if (row.performanceStatus === 'PENDING') continue;
    if (row.qualityStatus === 'ANOMALY' || row.qualityStatus === 'MISSING' || row.qualityStatus === 'UNADJUSTED') {
      findings.push({
        publicationId: row.publicationId,
        pickId: row.pickId,
        market: row.market,
        horizon: row.horizon,
        scopeType: 'PICK',
        scopeKey: row.pickId,
        causeCode: 'DATA_QUALITY',
        findingStatus: 'HYPOTHESIS',
        severity: 'WARN',
        confidence: 1,
        sampleSize: 1,
        summaryKo: '가격 데이터 품질이 충분하지 않아 성과 통계에서 제외했습니다.',
        evidence: { qualityStatus: row.qualityStatus },
        affectedPickIds: [row.pickId],
      });
      continue;
    }
    if (row.returnPct === null || row.benchmarkReturnPct === null || row.excessReturnPct === null) continue;
    if (row.returnPct < 0 && row.benchmarkReturnPct < 0 && row.excessReturnPct >= -1) {
      findings.push({
        publicationId: row.publicationId,
        pickId: row.pickId,
        market: row.market,
        horizon: row.horizon,
        scopeType: 'PICK',
        scopeKey: row.pickId,
        causeCode: 'MARKET_REGIME',
        findingStatus: 'HYPOTHESIS',
        severity: 'INFO',
        confidence: 0.65,
        sampleSize: 1,
        summaryKo: '종목과 벤치마크가 함께 하락해 시장 환경 영향이 우선 관찰됩니다.',
        evidence: { returnPct: row.returnPct, benchmarkReturnPct: row.benchmarkReturnPct, excessReturnPct: row.excessReturnPct },
        affectedPickIds: [row.pickId],
      });
    } else if (row.returnPct < 0 && row.excessReturnPct < 0) {
      findings.push({
        publicationId: row.publicationId,
        pickId: row.pickId,
        market: row.market,
        horizon: row.horizon,
        scopeType: 'PICK',
        scopeKey: row.pickId,
        causeCode: 'SELECTION',
        findingStatus: 'HYPOTHESIS',
        severity: row.excessReturnPct <= -10 ? 'CRITICAL' : 'WARN',
        confidence: 0.7,
        sampleSize: 1,
        summaryKo: '종목이 벤치마크보다 더 하락해 종목 선택 요인을 우선 점검해야 합니다.',
        evidence: { returnPct: row.returnPct, benchmarkReturnPct: row.benchmarkReturnPct, excessReturnPct: row.excessReturnPct },
        affectedPickIds: [row.pickId],
      });
    }
    if ((row.entryGapPct ?? 0) >= 3 && row.returnPct < 0) {
      findings.push({
        publicationId: row.publicationId,
        pickId: row.pickId,
        market: row.market,
        horizon: row.horizon,
        scopeType: 'PICK',
        scopeKey: row.pickId,
        causeCode: 'ENTRY_TIMING',
        findingStatus: 'HYPOTHESIS',
        severity: 'WARN',
        confidence: 0.7,
        sampleSize: 1,
        summaryKo: '추천 후 진입 시가가 기준 가격보다 3% 이상 높았고 이후 수익률이 음수였습니다.',
        evidence: { entryGapPct: row.entryGapPct, returnPct: row.returnPct, mfePct: row.mfePct, maePct: row.maePct },
        affectedPickIds: [row.pickId],
      });
    }
  }

  const sourceGroups = groupBy(rows.filter((row) => row.excessReturnPct !== null), (row) => `${row.market}:${row.horizon}:${row.source}`);
  for (const [key, group] of sourceGroups) {
    const dates = new Set(group.map((row) => row.runDate));
    const excess = group.map((row) => row.excessReturnPct as number);
    const wins = excess.filter((value) => value > 0).length;
    const meanCi = meanConfidenceInterval(excess);
    const winCi = wilsonInterval(wins, group.length);
    if (group.length < 30 || dates.size < 5 || (meanCi.high ?? 0) >= 0 || (winCi.high ?? 1) >= 0.5) continue;
    const first = group[0];
    findings.push({
      publicationId: null,
      pickId: null,
      market: first.market,
      horizon: first.horizon,
      scopeType: 'SEGMENT',
      scopeKey: key,
      causeCode: 'SIGNAL_SOURCE',
      findingStatus: 'CONFIRMED',
      severity: 'CRITICAL',
      confidence: 0.95,
      sampleSize: group.length,
      summaryKo: `${first.source} 신호가 충분한 표본에서 반복적으로 벤치마크를 하회했습니다.`,
      evidence: { source: first.source, distinctDates: dates.size, meanExcess: meanCi, benchmarkWinRate: wins / group.length, benchmarkWinRateCi: winCi },
      affectedPickIds: group.map((row) => row.pickId),
    });
  }

  const cohortGroups = groupBy(rows.filter((row) => row.returnPct !== null), (row) => `${row.publicationId}:${row.horizon}`);
  for (const [key, group] of cohortGroups) {
    const known = group.filter((row) => row.sector);
    if (group.length < 5 || known.length / group.length < 0.8) continue;
    const sectors = groupBy(known, (row) => row.sector as string);
    const largest = [...sectors.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (!largest || largest[1].length / group.length < 0.4) continue;
    const totalLoss = Math.abs(group.filter((row) => (row.returnPct ?? 0) < 0).reduce((sum, row) => sum + (row.returnPct as number), 0));
    const sectorLoss = Math.abs(largest[1].filter((row) => (row.returnPct ?? 0) < 0).reduce((sum, row) => sum + (row.returnPct as number), 0));
    if (totalLoss <= 0 || sectorLoss / totalLoss < 0.5) continue;
    const first = group[0];
    findings.push({
      publicationId: first.publicationId,
      pickId: null,
      market: first.market,
      horizon: first.horizon,
      scopeType: 'COHORT',
      scopeKey: key,
      causeCode: 'CONCENTRATION',
      findingStatus: 'HYPOTHESIS',
      severity: 'WARN',
      confidence: 0.8,
      sampleSize: group.length,
      summaryKo: `${largest[0]} 섹터 집중이 코호트 손실의 절반 이상을 차지했습니다.`,
      evidence: { sector: largest[0], sectorShare: largest[1].length / group.length, lossContribution: sectorLoss / totalLoss, sectorCoverage: known.length / group.length },
      affectedPickIds: largest[1].map((row) => row.pickId),
    });
  }
  return findings;
}
