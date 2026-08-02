import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const execution = jiti('../lib/strategy-execution.ts');

{
  const steps = execution.buildSplitExecutionSteps({
    action: 'BUY',
    sleeve: 'CORE',
    product: '411060',
    totalAmount: 4_000_000,
    weights: [1, 1, 1],
    unitPriceInBase: 20_000,
    conditions: ['1차', '2차', '3차'],
    ready: true,
  });
  assert.equal(steps.length, 3);
  assert.equal(steps.reduce((sum, step) => sum + step.amount, 0), 4_000_000);
  assert.deepEqual(steps.map((step) => step.units), [66, 66, 66]);
  assert.ok(steps.every((step) => step.status === 'READY'));
}

{
  const steps = execution.buildSplitExecutionSteps({
    action: 'SELL',
    sleeve: 'REDUCE',
    product: 'QLD',
    totalAmount: 10_000_001,
    weights: [0.5, 0.3, 0.2],
    unitPriceInBase: 200_000,
    conditions: ['즉시 축소', '추적 손절', '월말 추세 OFF'],
    ready: false,
    precision: 0,
  });
  assert.deepEqual(steps.map((step) => step.amount), [5_000_001, 3_000_000, 2_000_000]);
  assert.equal(steps.reduce((sum, step) => sum + step.amount, 0), 10_000_001);
  assert.ok(steps.every((step) => step.status === 'WAIT'));
}

{
  assert.equal(execution.resolveCalculationCapital(100_000_000, null), 100_000_000);
  assert.equal(execution.resolveCalculationCapital(100_000_000, 250_000_000), 250_000_000);
  assert.equal(execution.capitalSource(null), 'PORTFOLIO');
  assert.equal(execution.capitalSource(250_000_000), 'MANUAL');
}

console.log('strategy execution tests passed');
