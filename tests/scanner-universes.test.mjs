import assert from 'node:assert/strict';
import { normalizeNasdaqRows } from '../lib/finance/market/scanner-normalizers.ts';
import { rankKoreaMarketCapItems } from '../lib/finance/market/korea-market-cap-ranking.ts';
import { evaluateScannerRecommendation, getVolumeSignalTier, isAutoSelectedTier } from '../lib/scanner-recommendation.ts';

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

  assert.equal(items.length, 2, '유효한 티커만 남긴다');
  assert.equal(items[0].ticker, 'AAA', '시가총액 내림차순 정렬');
  assert.equal(items[0].rank, 1, '정렬 후 순위를 다시 매긴다');
  assert.equal(items[0].name, 'Alpha Corporation', '보통주/클래스 설명을 제거한다');
  assert.equal(items[0].currentPrice, 125.33, '달러 표기 현재가를 숫자로 변환한다');
  assert.equal(items[0].priceAsOf, 'Apr 14, 2026 12:58 PM', '현재가 기준 시각을 보존한다');
  assert.equal(items[0].priceSource, 'Nasdaq delayed quote', '가격 소스를 표시한다');
  console.log('? Nasdaq 100 행 정규화, 정렬, 현재가 기준 시각 보존');
}

{
  const ranked = rankKoreaMarketCapItems([
    { ticker: '000660', name: 'SK하이닉스', marketCap: 120, currentPrice: 1, source: 'test' },
    { ticker: '005930', name: '삼성전자', marketCap: 200, currentPrice: 1, source: 'test' },
    { ticker: '035420', name: 'NAVER', marketCap: 80, currentPrice: 1, source: 'test' },
  ]);

  assert.deepEqual(ranked.map((item) => item.ticker), ['005930', '000660', '035420']);
  assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 3]);
  console.log('? KOSPI 시총 상위 랭킹은 시총 내림차순으로 rank를 재부여한다');
}

{
  const recommendation = evaluateScannerRecommendation({
    status: 'done',
    sepaStatus: 'fail',
    sepaFailed: 2,
    vcpGrade: 'forming',
    vcpScore: 62,
    distanceToPivotPct: 2.4,
    pocketPivotScore: 65,
    rsRating: 95,
    tennisBallCount: 2,
  });

  assert.equal(recommendation.recommendationTier, 'Partial');
  assert.ok(recommendation.exceptionSignals.length > 0);
  console.log('? SEPA 일부 미달 후보도 예외 신호가 있으면 Partial로 분류한다');
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
  assert.equal(isAutoSelectedTier('Partial'), false);
  console.log('OK weak VCP plus near pivot alone is not Partial or auto-selected');
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

