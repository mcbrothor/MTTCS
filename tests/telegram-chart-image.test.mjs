import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { buildChartPatterns } from '../lib/finance/engines/chart-patterns.ts';
import {
  isTelegramChartAnalysisSendable,
  renderTelegramChartPng,
  selectActionableChartPatterns,
  selectTelegramChartPicks,
  telegramChartCaption,
  telegramChartFontPath,
} from '../lib/telegram/chart-image.ts';
import { buildRuleBasedTechnicalAnalysis } from '../lib/ai/technical-chart-analysis.ts';

function day(index) {
  const value = new Date('2025-01-02T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + index);
  return value.toISOString().slice(0, 10);
}

function bars() {
  return Array.from({ length: 260 }, (_, index) => {
    const close = 100 + index * 0.15 + Math.sin(index / 5) * 2;
    return { date: day(index), open: close * 0.995, high: close * 1.02, low: close * 0.98, close, volume: 900_000 + index * 1000 };
  });
}

const vcp = {
  score: 78, grade: 'strong', contractions: [], contractionScore: 80, volumeDryUpScore: 75, bbSqueezeScore: 0, pocketPivotScore: 0,
  pivotPrice: 138, pivotDate: day(240), pivotAgeDays: 12, pivotKind: 'VCP_PIVOT', referenceHighPrice: 140, referenceHighDate: day(241),
  invalidationPrice: 126, breakoutPrice: 140, recommendedEntry: 138, entrySource: 'VCP_PIVOT', breakoutVolumeRatio: 1.2,
  breakoutVolumeStatus: 'pending', pocketPivots: [], bbWidth: 4, bbWidthPercentile: 30, baseLength: 60, baseType: 'Standard_VCP',
  momentumBranch: 'EXTENDED', eightWeekReturnPct: 20, distanceFromMa50Pct: 5, low52WeekAdvancePct: 40, highTightFlag: null, details: ['VCP fixture'],
};
const priceData = bars();
const marketAnalysis = {
  ticker: 'TEST', exchange: 'NAS', providerUsed: 'fixture', providerAttempts: [], priceData, marketCap: null,
  sepaEvidence: { status: 'pass', criteria: [], summary: { passed: 0, failed: 0, info: 0, corePassed: 0, coreFailed: 0, coreTotal: 0 }, metrics: { rsRating: 90, rsSource: 'DB_BATCH' } },
  riskPlan: { entryPrice: 138, stopLossPrice: 126, selectedStopPrice: 126, targetPrice: 160, rewardRiskRatio: 2, riskGate: { status: 'PASS' } },
  vcpAnalysis: vcp, chartPatterns: buildChartPatterns({ data: priceData, vcpAnalysis: vcp }), fundamentals: null, changePercent: 1.2, adrPct: 2.1,
  dataQuality: { bars: 260, hasEnoughForAtr: true, hasEnoughForLongMa: true, missingFundamentals: [] }, warnings: [],
};

const technical = buildRuleBasedTechnicalAnalysis(marketAnalysis);
const imageInput = { ticker: 'TEST', exchange: 'NAS', name: 'Test Corp', rank: 1, analysis: marketAnalysis, technical };
const png = renderTelegramChartPng(imageInput);
if (process.env.CHART_TEST_OUTPUT) writeFileSync(process.env.CHART_TEST_OUTPUT, png);
assert.equal(existsSync(telegramChartFontPath()), true, 'Bundled Korean font must exist');
assert.ok(png.length > 20_000, 'Rendered chart should contain readable image data');
assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'Rendered chart should be PNG');
const headerPixels = await sharp(png)
  .extract({ left: 900, top: 15, width: 220, height: 75 })
  .removeAlpha()
  .raw()
  .toBuffer();
let nonBackgroundPixels = 0;
for (let index = 0; index < headerPixels.length; index += 3) {
  if (Math.abs(headerPixels[index] - 2) + Math.abs(headerPixels[index + 1] - 6) + Math.abs(headerPixels[index + 2] - 23) > 30) {
    nonBackgroundPixels += 1;
  }
}
assert.ok(nonBackgroundPixels > 150, 'Korean verdict text must be rasterized into the PNG');
assert.match(telegramChartCaption(imageInput), /TEST/);
assert.match(telegramChartCaption(imageInput), /판정: 관찰/);
assert.match(telegramChartCaption(imageInput), /품질: [ABCD]/);
assert.match(telegramChartCaption(imageInput), /현재 단계:/);
assert.deepEqual(selectTelegramChartPicks([{ rank: 3 }, { rank: 1 }, { rank: 2 }, { rank: 4 }], 3), []);
assert.deepEqual(selectTelegramChartPicks([
  { rank: 3, chartGate: { eligible: true } },
  { rank: 1, chartGate: { eligible: true } },
  { rank: 2, chartGate: { eligible: true } },
  { rank: 4, chartGate: { eligible: true } },
], 3).map((item) => item.rank), [1, 2, 3]);
assert.deepEqual(selectTelegramChartPicks([{ rank: 1, chartGate: { eligible: false } }, { rank: 2, chartGate: { eligible: true } }], 3).map((item) => item.rank), [2]);
assert.equal(isTelegramChartAnalysisSendable({ verdict: 'BUY', readiness: 'ACTIONABLE' }), true);
assert.equal(isTelegramChartAnalysisSendable({ verdict: 'WATCH', readiness: 'NEAR_TRIGGER' }), true);
assert.equal(isTelegramChartAnalysisSendable({ verdict: 'AVOID', readiness: 'INVALID' }), false);
assert.equal(isTelegramChartAnalysisSendable({ verdict: 'WATCH', readiness: 'EXTENDED' }), false);

const freshPattern = { ...marketAnalysis.chartPatterns[0], id: 'fresh', confidence: 0.82, status: 'CONFIRMED', dateRange: { start: day(220), end: day(259) } };
const stalePattern = { ...freshPattern, id: 'stale', confidence: 0.95, dateRange: { start: day(1), end: day(20) } };
const weakCandidate = { ...freshPattern, id: 'weak', confidence: 0.6, status: 'CANDIDATE' };
assert.deepEqual(
  selectActionableChartPatterns([stalePattern, weakCandidate, freshPattern], priceData).map((pattern) => pattern.id),
  ['fresh'],
);

const fallbackAnalysis = {
  ...marketAnalysis,
  vcpAnalysis: {
    ...vcp,
    pivotPrice: null,
    pivotDate: null,
    recommendedEntry: 170,
    entrySource: 'RECENT_HIGH_FALLBACK',
    referenceHighPrice: 170,
    breakoutVolumeStatus: 'pending',
  },
  riskPlan: { ...marketAnalysis.riskPlan, entryPrice: 170, selectedStopPrice: 158, stopLossPrice: 158 },
  chartPatterns: [],
};
const fallbackTechnical = buildRuleBasedTechnicalAnalysis(fallbackAnalysis);
const fallbackInput = { ...imageInput, analysis: fallbackAnalysis, technical: fallbackTechnical };
const fallbackCaption = telegramChartCaption(fallbackInput);
assert.equal(fallbackTechnical.professionalPlan.entryPrice, null);
assert.match(fallbackCaption, /유효 진입가 미확정/);
assert.match(fallbackCaption, /현재는 매수하지 않습니다/);
const fallbackPng = renderTelegramChartPng(fallbackInput);
assert.ok(fallbackPng.length > 20_000);
if (process.env.CHART_FALLBACK_TEST_OUTPUT) writeFileSync(process.env.CHART_FALLBACK_TEST_OUTPUT, fallbackPng);
console.log('telegram chart image tests passed');
