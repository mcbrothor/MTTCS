import path from 'node:path';
import { createJiti } from 'jiti';

if (!globalThis.WebSocket) globalThis.WebSocket = class NasdaqSmokeWebSocket {};
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const {
  loadNasdaqAdjustedHistory,
  loadNasdaqExecutionHistory,
  loadUsdKrwRate,
} = jiti('../lib/nasdaq/data.ts');

const [qqqAdjusted, qqq, qld, tqqq, usdKrw] = await Promise.all([
  loadNasdaqAdjustedHistory('QQQ', { range: '2y', targetBars: 320 }),
  loadNasdaqExecutionHistory('QQQ', { range: '2y', targetBars: 320 }),
  loadNasdaqExecutionHistory('QLD', { range: '2y', targetBars: 320 }),
  loadNasdaqExecutionHistory('TQQQ', { range: '2y', targetBars: 320 }),
  loadUsdKrwRate(),
]);
for (const dataset of [qqqAdjusted, qqq, qld, tqqq]) {
  console.log(JSON.stringify({
    product: dataset.product,
    series: dataset.series,
    provider: dataset.provider,
    rows: dataset.bars.length,
    asOf: dataset.bars.at(-1)?.date ?? null,
    close: dataset.bars.at(-1)?.close ?? null,
    fallbackUsed: dataset.fallbackUsed,
    warnings: dataset.warnings,
  }));
}
console.log(JSON.stringify({ product: 'USD/KRW', rate: usdKrw }));
if (
  qqqAdjusted.bars.length < 252
  || qqq.bars.length < 252
  || qld.bars.length < 252
  || tqqq.bars.length < 252
  || !usdKrw
) {
  process.exitCode = 1;
}
