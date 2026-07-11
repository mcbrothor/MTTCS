import assert from 'node:assert/strict';
import { buildTechnicalChartAnalysisPrompt, validateTechnicalChartAnalysisPayload } from '../lib/ai/technical-chart-analysis.ts';
import { buildChartPatterns } from '../lib/finance/engines/chart-patterns.ts';

function day(index) {
  const date = new Date('2026-01-02T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function bar(index, close, high = close * 1.02, low = close * 0.98, volume = 1_000_000) {
  return {
    date: day(index),
    open: close * 0.995,
    high,
    low,
    close,
    volume,
  };
}

function baselineData(days = 140) {
  return Array.from({ length: days }, (_, index) => {
    const close = 90 + index * 0.12 + Math.sin(index / 5) * 2;
    return bar(index, close);
  });
}

function vcpFixture() {
  return {
    score: 78,
    grade: 'strong',
    contractions: [
      { peakDate: day(70), troughDate: day(82), peakPrice: 122, troughPrice: 104, depthPct: 14.75, avgVolume: 900000 },
      { peakDate: day(96), troughDate: day(106), peakPrice: 119, troughPrice: 110, depthPct: 7.56, avgVolume: 610000 },
    ],
    contractionScore: 80,
    volumeDryUpScore: 75,
    bbSqueezeScore: 100,
    pocketPivotScore: 60,
    pivotPrice: 119,
    pivotDate: day(96),
    pivotAgeDays: 20,
    pivotKind: 'VCP_PIVOT',
    referenceHighPrice: 124,
    referenceHighDate: day(91),
    invalidationPrice: 110,
    breakoutPrice: 124,
    recommendedEntry: 119,
    entrySource: 'VCP_PIVOT',
    breakoutVolumeRatio: 1.2,
    breakoutVolumeStatus: 'pending',
    pocketPivots: [{ date: day(125), close: 121, volume: 1400000 }],
    bbWidth: 3.8,
    bbWidthPercentile: 12,
    baseLength: 60,
    baseType: 'Standard_VCP',
    momentumBranch: 'EXTENDED',
    eightWeekReturnPct: 108,
    distanceFromMa50Pct: 22,
    low52WeekAdvancePct: 180,
    highTightFlag: {
      passed: true,
      baseDays: 22,
      maxDrawdownPct: 14,
      rightSideVolumeRatio: 0.62,
      tightnessScore: 84,
      baseHigh: 126,
      baseLow: 112,
      stopPrice: 112,
      stopReliability: 'RELIABLE',
      stopPlan: [],
    },
    details: ['fixture'],
  };
}

{
  const patterns = buildChartPatterns({ data: baselineData(), vcpAnalysis: vcpFixture() });
  const vcp = patterns.find((pattern) => pattern.type === 'VCP');
  const pocketPivot = patterns.find((pattern) => pattern.type === 'POCKET_PIVOT');
  const squeeze = patterns.find((pattern) => pattern.type === 'BOLLINGER_SQUEEZE');
  const htf = patterns.find((pattern) => pattern.type === 'HIGH_TIGHT_FLAG');

  assert.ok(vcp, 'VCP pattern should be emitted');
  assert.ok(vcp.zones.length >= 2, 'VCP contractions should become zones');
  assert.ok(vcp.lines.some((line) => line.id === 'vcp-pivot'), 'VCP pivot should become a line');
  assert.ok(vcp.lines.some((line) => line.id === 'vcp-invalidation'), 'VCP invalidation should become a line');
  assert.ok(pocketPivot?.markers.length === 1, 'Pocket Pivot should become a marker');
  assert.ok(squeeze?.zones.length === 1, 'BB Squeeze should become a zone');
  assert.equal(htf?.status, 'CONFIRMED', 'passed HTF should be confirmed');
}

function cupData() {
  const rows = [];
  for (let index = 0; index < 180; index += 1) {
    let close;
    if (index < 35) close = 100 - index * 0.05;
    else if (index < 85) close = 98 - (index - 35) * 0.55;
    else if (index < 150) close = 70 + (index - 85) * 0.4;
    else close = 95 - Math.sin((index - 150) / 4) * 2;
    rows.push(bar(index, close, close * 1.015, close * 0.985));
  }
  return rows;
}

function doubleBottomData() {
  return Array.from({ length: 160 }, (_, index) => {
    let close = 100;
    if (index < 50) close = 100 - index * 0.4;
    else if (index < 85) close = 80 + (index - 50) * 0.65;
    else if (index < 120) close = 103 - (index - 85) * 0.62;
    else close = 81 + (index - 120) * 0.45;
    const low = index === 50 ? 79 : index === 120 ? 80.5 : close * 0.985;
    const high = index === 85 ? 104 : close * 1.015;
    return bar(index, close, high, low);
  });
}

{
  const cupPatterns = buildChartPatterns({ data: cupData(), vcpAnalysis: { ...vcpFixture(), contractions: [], pocketPivots: [], bbWidthPercentile: 80 } });
  assert.ok(cupPatterns.some((pattern) => pattern.type === 'CUP_WITH_HANDLE'), 'Cup with Handle candidate should be detected');

  const doubleBottomPatterns = buildChartPatterns({ data: doubleBottomData(), vcpAnalysis: { ...vcpFixture(), contractions: [], pocketPivots: [], bbWidthPercentile: 80 } });
  assert.ok(doubleBottomPatterns.some((pattern) => pattern.type === 'DOUBLE_BOTTOM'), 'Double Bottom candidate should be detected');
}

{
  const patterns = buildChartPatterns({ data: baselineData(), vcpAnalysis: vcpFixture() });
  const valid = validateTechnicalChartAnalysisPayload({
    verdict: 'WATCH',
    confidence: 0.72,
    summaryKo: '피벗 근처에서 확인이 필요합니다.',
    referencedPatternIds: ['pattern-vcp'],
    entryCondition: '피벗 상향 돌파',
    invalidationCondition: '무효화선 이탈',
    patternRead: 'VCP 수축이 진행 중입니다.',
    riskNotes: ['거래량 확인 필요'],
  }, patterns.map((pattern) => pattern.id));
  assert.equal(valid.verdict, 'WATCH');

  assert.throws(() => validateTechnicalChartAnalysisPayload({
    verdict: 'BUY',
    confidence: 0.7,
    summaryKo: 'bad',
    referencedPatternIds: ['invented-pattern'],
    entryCondition: 'bad',
    invalidationCondition: 'bad',
    patternRead: 'bad',
    riskNotes: [],
  }, patterns.map((pattern) => pattern.id)), /Unknown chart pattern ids/);

  const prompt = buildTechnicalChartAnalysisPrompt({
    ticker: 'TEST',
    exchange: 'NAS',
    providerUsed: 'fixture',
    priceData: baselineData(),
    marketCap: null,
    sepaEvidence: { status: 'pass', criteria: [], summary: { passed: 0, failed: 0, info: 0, corePassed: 0, coreFailed: 0, coreTotal: 0 }, metrics: { rsRating: 92, rsSource: 'DB_BATCH' } },
    riskPlan: { entryPrice: 119, stopLossPrice: 110, selectedStopPrice: 110, targetPrice: 140, rewardRiskRatio: 2, riskGate: { status: 'PASS' } },
    vcpAnalysis: vcpFixture(),
    chartPatterns: patterns,
    fundamentals: null,
    changePercent: null,
    adrPct: null,
    dataQuality: { bars: 140, hasEnoughForAtr: true, hasEnoughForLongMa: false, missingFundamentals: [] },
    warnings: [],
  });
  assert.ok(prompt.includes('Do not invent chart coordinates'));
  assert.ok(prompt.includes('pattern-vcp'));
}

console.log('chart pattern overlay tests passed');
