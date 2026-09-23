import assert from 'node:assert/strict';
import { evaluateDailyDeliveryHealth } from '../scripts/lib/daily-screener-watchdog-utils.mjs';

const input = {
  run: {
    status: 'completed',
    scope: { universes: ['KOSPI200', 'NASDAQ100'] },
    scan_summary: { outcome: 'PARTIAL', delivery_categories: ['KOSPI200'], failed_categories: ['NASDAQ100'] },
    telegram_sent_at: null,
  },
  publications: [{ category: 'KOSPI200', status: 'PUBLISHED', is_official: true, telegram_status: 'SENT' }],
  expectedCategories: ['KOSPI200'],
  deliveryOverdue: true,
};
const result = evaluateDailyDeliveryHealth(input);
assert.equal(result.healthy, false, 'delivered successful categories cannot hide failed markets');
assert.equal(result.state, 'PARTIAL_MARKETS_FAILED');
assert.match(result.reason, /NASDAQ100/);
assert.deepEqual(result.actions, ['alert'], 'partial recovery must not requeue every successful market or mark run delivered');
assert.deepEqual(evaluateDailyDeliveryHealth({ ...input, deliveryOverdue: false }).actions, []);
assert.equal(evaluateDailyDeliveryHealth({
  ...input, run: { ...input.run, scan_summary: { failed_categories: ['NASDAQ100'] } },
}).healthy, false, 'failure list remains authoritative when an older writer omitted outcome');
console.log('Watchdog partial market health tests passed');
