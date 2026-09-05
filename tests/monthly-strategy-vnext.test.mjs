import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildMonthlySnapshot,
  classifyRegimeWithHysteresis,
  relativeMomentum,
  resolveCompletedMonth,
  selectMonthlyCandidates,
} from '../lib/strategy/monthly/core.ts';
import {
  KOSPI_MONTHLY_POLICY,
  KOSPI_MONTHLY_UNIVERSE,
  resolveKospiExposure,
} from '../lib/strategy/kospi-monthly/policy.ts';
import {
  US_MONTHLY_UNIVERSE,
} from '../lib/strategy/us-monthly-v7/policy.ts';
import { nasdaqDominance } from '../lib/strategy/us-monthly-v7/engine.ts';
import { hashMonthlySnapshot } from '../lib/strategy/monthly/repository.ts';
import { toMonthlyStrategyApi } from '../lib/strategy/monthly/api-contract.ts';

function bar(date, close) {
  return { date, open: close, high: close, low: close, close, volume: 1_000 };
}

function dailyBars(length, slope, start = 100) {
  return Array.from({ length }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
    return bar(date, start + index * slope);
  });
}

{
  const completed = resolveCompletedMonth(
    [bar('2026-08-28', 100), bar('2026-08-31', 101), bar('2026-09-01', 102)],
    new Date('2026-09-01T23:00:00+09:00'),
  );
  assert.deepEqual(completed, {
    signalAt: '2026-08-31',
    effectiveAt: '2026-09-01',
    latestObservationAt: '2026-09-01',
    status: 'FINAL',
  });
}

{
  const asset = [bar('2026-01-01', 100), bar('2026-07-01', 132)];
  const benchmark = [bar('2026-01-01', 100), bar('2026-07-01', 120)];
  assert.ok(Math.abs(relativeMomentum(asset, benchmark, 1) - 10) < 1e-9);
}

{
  const nasdaq = dailyBars(201, 0, 100);
  const sp500 = dailyBars(201, 0, 100);
  nasdaq.at(-1).close = 120;
  sp500.at(-1).close = 114.5;
  assert.equal(nasdaqDominance(nasdaq, sp500), false, 'NASDAQ 독주는 수익률 차가 아니라 상대가격 비율 5%를 사용해야 한다');
}

{
  assert.equal(new Set(KOSPI_MONTHLY_UNIVERSE.map((item) => item.group)).size, KOSPI_MONTHLY_UNIVERSE.length);
  assert.equal(new Set(US_MONTHLY_UNIVERSE.map((item) => item.ticker)).size, US_MONTHLY_UNIVERSE.length);
  assert.ok(KOSPI_MONTHLY_UNIVERSE.every((item) => !/레버리지/i.test(item.name)));
  assert.ok(US_MONTHLY_UNIVERSE.every((item) => item.assetClass === 'EQUITY_SECTOR'));
  assert.ok(!US_MONTHLY_UNIVERSE.some((item) => ['SPY', 'QQQ', 'GLD', 'TLT'].includes(item.ticker)));
}

{
  assert.equal(classifyRegimeWithHysteresis({
    breadth: 57,
    drawdownPct: -4,
    previousRegime: 'TREND',
    policy: KOSPI_MONTHLY_POLICY,
  }).regime, 'TREND');
  assert.equal(classifyRegimeWithHysteresis({
    breadth: 54,
    drawdownPct: -4,
    previousRegime: 'TREND',
    policy: KOSPI_MONTHLY_POLICY,
  }).regime, 'NON_TREND');
}

{
  assert.equal(resolveKospiExposure('NON_TREND', 4.99), 0.25);
  assert.equal(resolveKospiExposure('NON_TREND', 5), 0.5);
  assert.equal(resolveKospiExposure('NON_TREND', 12), 0.75);
  assert.equal(resolveKospiExposure('NON_TREND', 22), 1);
}

{
  const benchmark = dailyBars(300, 0.2, 1_000);
  const universe = [
    { ticker: 'A', name: 'A', group: 'A', assetClass: 'EQUITY_SECTOR' },
    { ticker: 'B', name: 'B', group: 'B', assetClass: 'EQUITY_SECTOR' },
    { ticker: 'C', name: 'C', group: 'C', assetClass: 'EQUITY_SECTOR' },
    { ticker: 'D', name: 'D', group: 'D', assetClass: 'EQUITY_SECTOR' },
    { ticker: 'E', name: 'E', group: 'E', assetClass: 'EQUITY_SECTOR' },
  ];
  const barsByTicker = {
    A: dailyBars(300, 1.0),
    B: dailyBars(300, 0.9),
    C: dailyBars(300, 0.8),
    D: dailyBars(300, 0.7),
    E: dailyBars(300, 0.6),
  };
  const selected = selectMonthlyCandidates({
    universe,
    barsByTicker,
    benchmarkBars: benchmark,
    asOf: benchmark.at(-1).date,
    previousHoldings: ['D'],
    entryTopN: 3,
    keepTopN: 5,
  });
  assert.ok(selected.selected.some((item) => item.ticker === 'D'), '기존 Top5 보유종목을 유지해야 한다');
  assert.equal(selected.selected.length, 3);
  assert.deepEqual(selected.hold.map((item) => item.ticker), ['D']);
}

{
  const benchmarkBars = dailyBars(300, 0.3, 1_000);
  const universe = KOSPI_MONTHLY_UNIVERSE.slice(0, 3);
  const barsByTicker = Object.fromEntries(universe.slice(0, 2).map((item, index) => [item.ticker, dailyBars(300, 0.8 - index * 0.1)]));
  const snapshot = buildMonthlySnapshot({
    policy: { ...KOSPI_MONTHLY_POLICY, universe },
    benchmarkBars,
    barsByTicker,
    previousHoldings: [],
    now: new Date('2026-01-01T09:00:00+09:00'),
  });
  assert.equal(snapshot.status, 'BLOCKED');
  assert.equal(snapshot.quality.coverage, 2 / 3);
  assert.deepEqual(snapshot.portfolio, []);
  assert.equal(
    hashMonthlySnapshot(snapshot),
    hashMonthlySnapshot({ ...snapshot, quality: { ...snapshot.quality, warnings: ['transient repository warning'] } }),
    '입력 해시는 일시적인 운영 경고에 따라 달라지면 안 된다',
  );
}

{
  const benchmarkBars = Array.from({ length: 300 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
    const close = index < 270 ? 100 : index === 299 ? 80 : 70;
    return bar(date, close);
  });
  const universe = KOSPI_MONTHLY_UNIVERSE.slice(0, 3);
  const weakSectorBars = Array.from({ length: 300 }, (_, index) => {
    const date = benchmarkBars[index].date;
    return bar(date, 200 - index * 0.3);
  });
  const barsByTicker = Object.fromEntries(universe.map((item) => [item.ticker, weakSectorBars]));
  barsByTicker['069500'] = benchmarkBars;
  const snapshot = buildMonthlySnapshot({
    policy: {
      ...KOSPI_MONTHLY_POLICY,
      universe,
      crashTarget: { ticker: '069500', providerSymbol: '069500.KS', name: 'KODEX 200', group: 'KOSPI', assetClass: 'EQUITY_BENCHMARK' },
    },
    benchmarkBars,
    barsByTicker,
    previousHoldings: [],
    now: new Date('2026-01-01T09:00:00+09:00'),
  });
  assert.equal(snapshot.regime.regime, 'CRASH_75');
  assert.deepEqual(snapshot.portfolio.map((item) => item.ticker), ['069500'], '약세 반전 확인 후에는 섹터가 아니라 광역지수만 단계 매수해야 한다');
  assert.equal(snapshot.portfolio[0].targetWeight, 0.75);
  const api = toMonthlyStrategyApi(snapshot);
  assert.equal(api.regime.weight, 75);
  assert.equal(api.portfolio[0].targetWeightPct, 75);
}

for (const page of [
  'app/strategies/kospi-monthly/page.tsx',
  'app/strategies/us-monthly-v7/page.tsx',
]) {
  const source = readFileSync(page, 'utf8');
  assert.doesNotMatch(source, /signals=\{\[\]\}/, `${page}는 실제 신호 카드를 표시해야 한다`);
}
const sharedPage = readFileSync('components/strategy/MonthlyStrategyPage.tsx', 'utf8');
assert.match(sharedPage, /statusBadge=/, '월간 전략 화면은 FINAL\/PROVISIONAL 상태를 표시해야 한다');
assert.match(sharedPage, /data\.actions\.buy/, '월간 전략 화면은 실제 편입 신호를 표시해야 한다');

for (const route of [
  'app/api/strategies/kospi-monthly/route.ts',
  'app/api/strategies/us-monthly-v7/route.ts',
]) {
  const source = readFileSync(route, 'utf8');
  assert.match(source, /runMonthlyStrategy/, `${route}는 공통 월간 실행기를 사용해야 한다`);
  assert.doesNotMatch(source, /load(?:Kospi|Us)52wDataset/, `${route}는 52주 혼합 유니버스를 재사용하면 안 된다`);
}

const runner = readFileSync('lib/strategy/monthly/run.ts', 'utf8');
assert.match(runner, /buildMonthlySnapshot/, '공통 실행기는 공통 월간 엔진을 사용해야 한다');
assert.match(runner, /upsertMonthlySnapshot/, '공통 실행기는 확정 스냅샷을 저장해야 한다');

const cronRoute = readFileSync('app/api/cron/monthly-strategies/route.ts', 'utf8');
assert.match(cronRoute, /validateCronRequest/, '월간 전략 자동 저장은 cron 인증을 강제해야 한다');
assert.match(cronRoute, /SYSTEM_ADMIN_ID/, '월간 전략 자동 저장은 시스템 관리자 포트폴리오를 기준으로 해야 한다');
assert.match(cronRoute, /runMonthlyStrategy/, 'cron은 사용자 API와 같은 월간 실행기를 사용해야 한다');

console.log('monthly strategy VNext tests passed');
