import assert from 'node:assert/strict';
import { buildSectorRows, normalizeSectorReturn } from '../lib/master-filter/sector-rows.ts';

function prices(previousClose, latestClose, earlierClose) {
  return [
    ...Array.from({ length: 19 }, () => ({ close: earlierClose })),
    { close: previousClose },
    { close: latestClose },
  ];
}

const rows = buildSectorRows(
  [
    ['LONG_TERM_WINNER', prices(120, 118, 100)],
    ['DAILY_WINNER', prices(101, 105, 110)],
  ],
  { LONG_TERM_WINNER: '장기 강세', DAILY_WINNER: '당일 강세' },
  new Set(['DAILY_WINNER']),
  { LONG_TERM_WINNER: '장기 강세 ETF', DAILY_WINNER: '당일 강세 ETF' },
);

assert.equal(rows[0].symbol, 'DAILY_WINNER');
assert.equal(rows[0].tickerName, '당일 강세 ETF');
assert.equal(rows[0].rank, 1);
assert.ok(rows[0].return1 > rows[1].return1);
assert.ok(rows[0].return5 < rows[1].return5);
assert.ok(rows[0].return20 < rows[1].return20);
assert.equal(rows[0].aboveMa5, false);
assert.equal(rows[0].aboveMa20, false);
assert.equal(rows[1].aboveMa5, true);
assert.equal(rows[1].aboveMa20, true);
assert.equal(rows[0].riskOn, true);
assert.equal(normalizeSectorReturn(1.25), 1.25);
assert.equal(normalizeSectorReturn(undefined), null);
assert.equal(normalizeSectorReturn(Number.NaN), null);

console.log('sector row tests passed');
