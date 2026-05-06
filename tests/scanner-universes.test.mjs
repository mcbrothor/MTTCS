import assert from 'node:assert/strict';
import { normalizeNasdaqRows } from '../lib/finance/market/scanner-normalizers.ts';
import { rankKoreaMarketCapItems } from '../lib/finance/market/korea-market-cap-ranking.ts';
import {
  applyScannerReviewPoolRankings,
  evaluateScannerRecommendation,
  getVolumeSignalTier,
  isAutoSelectedTier,
} from '../lib/scanner-recommendation.ts';

console.log('=== Scanner Universe Tests ===\n');

{
  const rows = [
    {
      symbol: 'BBB',
      companyName: 'Beta Inc. Common Stock',
      marketCap: '250000000000',
      lastSalePrice: '$25.15',
    },
    {
      symbol: 'AAA',
      companyName: 'Alpha Corporation Class A Common Stock',
      marketCap: '1000000000000',
      lastSalePrice: '$125.33',
    },
    {
      symbol: '',
      companyName: 'Missing Symbol',
      marketCap: '500000000000',
      lastSalePrice: '$10.00',
    },
  ];

  const items = normalizeNasdaqRows(rows, 'Apr 14, 2026 12:58 PM');

  assert.equal(items.length, 2, 'keeps valid tickers only');
  assert.equal(items[0].ticker, 'AAA', 'sorts by market cap descending');
  assert.equal(items[0].rank, 1, 're-ranks after sorting');
  assert.equal(items[0].name, 'Alpha Corporation', 'cleans common stock suffixes');
  assert.equal(items[0].currentPrice, 125.33, 'parses dollar price');
  assert.equal(items[0].priceAsOf, 'Apr 14, 2026 12:58 PM', 'keeps quote timestamp');
  assert.equal(items[0].priceSource, 'Nasdaq delayed quote', 'keeps price source');
  console.log('OK Nasdaq 100 rows normalize and sort correctly');
}

{
  const ranked = rankKoreaMarketCapItems([
    { ticker: '000660', name: 'SK hynix', marketCap: 120, currentPrice: 1, source: 'test' },
    { ticker: '005930', name: 'Samsung Electronics', marketCap: 200, currentPrice: 1, source: 'test' },
    { ticker: '035420', name: 'NAVER', marketCap: 80, currentPrice: 1, source: 'test' },
  ]);

  assert.deepEqual(ranked.map((item) => item.ticker), ['005930', '000660', '035420']);
  assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 3]);
  console.log('OK Korea market-cap rows are ranked descending');
}

{
  const recommendation = evaluateScannerRecommendation({
    status: 'done',
    sepaStatus: 'warning',
    sepaFailed: 1,
    sepaEvidence: { summary: { corePassed: 6, coreFailed: 1, coreTotal: 7 } },
    vcpGrade: 'forming',
    vcpScore: 62,
    pivotKind: 'VCP_PIVOT',
    entrySource: 'VCP_PIVOT',
    distanceToPivotPct: 2.4,
    pocketPivotScore: 65,
    volumeDryUpScore: 55,
    rsRating: 95,
    tennisBallCount: 2,
  });

  assert.equal(recommendation.recommendationTier, 'IB Review');
  assert.ok(recommendation.exceptionSignals.length > 0);
  console.log('OK near-SEPA leaders with valid pivot and volume become IB Review');
}

{
  const weakNearPivot = evaluateScannerRecommendation({
    status: 'done',
    sepaStatus: 'fail',
    sepaFailed: 2,
    vcpGrade: 'weak',
    vcpScore: 32,
    distanceToPivotPct: 2.4,
    pocketPivotScore: 0,
    volumeDryUpScore: 0,
  });

  assert.equal(weakNearPivot.recommendationTier, 'Low Priority');
  assert.equal(isAutoSelectedTier('Recommended'), true);
  assert.equal(isAutoSelectedTier('IB Review'), true);
  assert.equal(isAutoSelectedTier('Partial'), false);
  console.log('OK weak VCP plus near pivot alone is not selected');
}

{
  const leadershipSetup = evaluateScannerRecommendation({
    status: 'done',
    sepaStatus: 'warning',
    sepaFailed: 1,
    sepaEvidence: { summary: { corePassed: 6, coreFailed: 1, coreTotal: 7 } },
    vcpGrade: 'forming',
    vcpScore: 64,
    pivotKind: 'RECENT_HIGH_REFERENCE',
    entrySource: 'RECENT_HIGH_FALLBACK',
    referenceHighPrice: 120,
    distanceFromMa50Pct: 8,
    volumeDryUpScore: 58,
    rsRating: 92,
    rsLineNearHigh: true,
  });

  assert.equal(leadershipSetup.recommendationTier, 'IB Review');
  assert.match(leadershipSetup.recommendationReason, /not|미확정|매수 타점/);
  console.log('OK leadership setups without a valid pivot can enter IB Review without becoming buy points');
}

{
  const rows = Array.from({ length: 18 }, (_, index) => ({
    status: 'done',
    ticker: `T${String(index).padStart(2, '0')}`,
    sepaStatus: 'warning',
    sepaFailed: 1,
    sepaEvidence: { summary: { corePassed: 6, coreFailed: 1, coreTotal: 7 } },
    vcpGrade: 'forming',
    vcpScore: 78 - index,
    pivotKind: 'VCP_PIVOT',
    entrySource: 'VCP_PIVOT',
    distanceToPivotPct: index % 2 === 0 ? 1.8 : -4,
    volumeDryUpScore: 52,
    rsRating: 96 - (index * 0.4),
  }));

  const ranked = applyScannerReviewPoolRankings(rows, 15);
  assert.equal(ranked.filter((row) => row.recommendationTier === 'IB Review').length, 15);
  assert.equal(ranked.filter((row) => row.recommendationTier === 'Watch').length, 3);
  console.log('OK IB Review pool is capped to top 15 by composite score');
}

{
  assert.equal(getVolumeSignalTier({ volumeDryUpScore: 66, pocketPivotScore: 10, breakoutVolumeStatus: 'weak' }), 'Strong');
  assert.equal(getVolumeSignalTier({ volumeDryUpScore: 51, pocketPivotScore: 10, breakoutVolumeStatus: 'weak' }), 'Watch');
  assert.equal(getVolumeSignalTier({ volumeDryUpScore: 20, pocketPivotScore: 30, breakoutVolumeStatus: 'pending' }), 'Watch');
  assert.equal(getVolumeSignalTier({ volumeDryUpScore: 20, pocketPivotScore: 30, breakoutVolumeStatus: 'weak' }), 'Weak');
  assert.equal(getVolumeSignalTier({}), 'Unknown');
  console.log('OK volume signal tiers classify Strong, Watch, Weak, and Unknown');
}

console.log('\n=== All Scanner Universe Tests Passed ===');
