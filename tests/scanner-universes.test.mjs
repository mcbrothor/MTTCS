import assert from 'node:assert/strict';
import { normalizeNasdaqRows } from '../lib/finance/scanner-normalizers.ts';

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
  console.log('✅ Nasdaq 100 행 정규화, 정렬, 현재가 기준 시각 보존');
}

console.log('\n=== All Scanner Universe Tests Passed ===');
