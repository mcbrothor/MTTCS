import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildTelegramChartCallback,
  flattenLatestRecommendationCharts,
  parseTelegramChartCallback,
  parseTelegramChartCommand,
  selectTelegramChartMenuOptions,
} from '../lib/telegram/chart-request.ts';

assert.deepEqual(parseTelegramChartCommand('/chart AAPL'), { ticker: 'AAPL', exchange: null });
assert.deepEqual(parseTelegramChartCommand('/chart@MTNBot 005930 KOSPI'), { ticker: '005930', exchange: 'KOSPI' });
assert.equal(parseTelegramChartCommand('/chart $$'), null);

const callback = buildTelegramChartCallback({ ticker: 'AAPL', exchange: 'NAS' });
assert.equal(callback, 'chart|AAPL|NAS');
assert.deepEqual(parseTelegramChartCallback(callback), { ticker: 'AAPL', exchange: 'NAS' });
assert.equal(parseTelegramChartCallback('chart|AAPL|UNKNOWN'), null);

const options = flattenLatestRecommendationCharts([
  {
    run_date: '2026-07-14',
    category: 'NASDAQ100',
    recommendation_picks: [{ ticker: 'OLD', exchange: 'NAS', name: 'Old', rank: 1, candidate_snapshot: { chart_gate: { eligible: true } } }],
  },
  {
    run_date: '2026-07-15',
    category: 'NASDAQ100',
    recommendation_picks: [
      { ticker: 'AAPL', exchange: 'NASDAQ', name: 'Apple', rank: 1, candidate_snapshot: { chart_gate: { eligible: true } } },
      { ticker: 'NVDA', exchange: 'NAS', name: 'Nvidia', rank: 2, candidate_snapshot: { chart_gate: { eligible: false } } },
    ],
  },
  {
    run_date: '2026-07-15',
    category: 'SP500',
    recommendation_picks: [{ ticker: 'AAPL', exchange: 'NAS', name: 'Apple', rank: 3, candidate_snapshot: { chart_gate: { eligible: true } } }],
  },
  {
    run_date: '2026-07-14',
    category: 'KOSPI200',
    recommendation_picks: [{ ticker: '005930', exchange: 'KOSPI', name: '삼성전자', rank: 1, candidate_snapshot: { chart_gate: { eligible: true } } }],
  },
]);
assert.deepEqual(options.map((option) => option.ticker), ['AAPL', 'NVDA', 'AAPL', '005930']);
assert.deepEqual(selectTelegramChartMenuOptions(options).map((option) => option.ticker), ['AAPL', '005930']);

const workerSource = readFileSync(new URL('../scripts/local-llm-worker.mjs', import.meta.url), 'utf8');
assert.match(workerSource, /DAILY_TELEGRAM_CHARTS_AUTO_ENABLED = .*=== 'true'/);
assert.match(workerSource, /!delivery\?\.skipped && DAILY_TELEGRAM_CHARTS_AUTO_ENABLED/);
console.log('telegram chart request tests passed');
