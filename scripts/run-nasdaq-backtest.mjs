import path from 'node:path';
import { createJiti } from 'jiti';

if (!globalThis.WebSocket) globalThis.WebSocket = class NasdaqBacktestWebSocket {};
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const { loadNasdaqAdjustedHistory } = jiti('../lib/nasdaq/data.ts');
const { runNasdaqBacktest } = jiti('../lib/nasdaq/backtest.ts');

const transactionCostPct = 0.1;
const [qqq, qld, tqqq] = await Promise.all([
  loadNasdaqAdjustedHistory('QQQ', { range: 'max', targetBars: 5_000 }),
  loadNasdaqAdjustedHistory('QLD', { range: 'max', targetBars: 5_000 }),
  loadNasdaqAdjustedHistory('TQQQ', { range: 'max', targetBars: 5_000 }),
]);
const modes = [
  'QQQ_BUY_HOLD',
  'QLD_BUY_HOLD',
  'TQQQ_BUY_HOLD',
  'QQQ_TEN_MONTH',
  'QQQ_QLD_RULES',
  'QQQ_TQQQ_RULES',
];
console.log(JSON.stringify({
  rawRows: {
    QQQ: qqq.bars.length,
    QLD: qld.bars.length,
    TQQQ: tqqq.bars.length,
  },
  ranges: {
    QQQ: [qqq.bars.at(0)?.date, qqq.bars.at(-1)?.date],
    QLD: [qld.bars.at(0)?.date, qld.bars.at(-1)?.date],
    TQQQ: [tqqq.bars.at(0)?.date, tqqq.bars.at(-1)?.date],
  },
}, null, 2));
const results = modes.map((mode) => runNasdaqBacktest({
  qqq: qqq.bars,
  qld: qld.bars,
  tqqq: tqqq.bars,
  mode,
  transactionCostPct,
}));
console.table(results.map((result) => ({
  strategy: result.mode,
  start: result.startDate,
  end: result.endDate,
  CAGR: result.cagrPct,
  volatility: result.annualVolatilityPct,
  MDD: result.maxDrawdownPct,
  Sharpe: result.sharpe,
  Sortino: result.sortino,
  Calmar: result.calmar,
  averageEffectiveExposure: result.averageEffectiveExposurePct,
})));
console.log(JSON.stringify({
  status: 'RESEARCH_ONLY',
  actualAdjustedEtfSeries: true,
  syntheticLeverageUsed: false,
  transactionCostPct,
  observations: {
    QQQ: qqq.bars.length,
    QLD: qld.bars.length,
    TQQQ: tqqq.bars.length,
  },
}, null, 2));
