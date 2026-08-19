import assert from 'node:assert/strict';
import { selectMainSeries } from '../lib/master-filter/main-series.ts';

function history(length) {
  return Array.from({ length }, (_, index) => ({
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000,
  }));
}

{
  const selected = selectMainSeries(
    ['^KS200', '^KS11', '069500.KS'],
    [['^KS200', history(1)], ['^KS11', history(252)], ['069500.KS', history(300)]],
  );

  assert.equal(selected?.symbol, '^KS11');
  assert.equal(selected?.data.length, 252);
  assert.equal(selected?.fallbackUsed, true);
}

{
  const selected = selectMainSeries(
    ['SPY'],
    [['SPY', history(252)], ['SPY', history(0)]],
  );

  assert.equal(selected?.symbol, 'SPY');
  assert.equal(selected?.data.length, 252);
  assert.equal(selected?.fallbackUsed, false);
}

{
  const selected = selectMainSeries(
    ['^KS200', '^KS11'],
    [['^KS200', history(199)], ['^KS11', history(50)]],
  );

  assert.equal(selected, null);
}

console.log('master filter main-series tests passed');
