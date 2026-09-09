import assert from 'node:assert/strict';
import {
  FLOW_STEPS,
  STRATEGY_LINKS,
  findActiveFlowStep,
  findActiveStrategyLink,
  getActiveFlowStep,
  isActiveTab,
  getFlowTabHref,
} from '../components/layout/navigation.ts';

assert.equal(FLOW_STEPS.length, 8);
assert.deepEqual(
  FLOW_STEPS.map((step) => step.step),
  ['00', '01', '02', '03', '04', '05', '06', '07'],
);

assert.equal(STRATEGY_LINKS.length, 7);
assert.equal(STRATEGY_LINKS[0].href, '/strategies/kospi-52w');
assert.equal(STRATEGY_LINKS[0].group, 'KR');
assert.equal(STRATEGY_LINKS[1].href, '/strategies/kospi-monthly');
assert.equal(STRATEGY_LINKS[1].group, 'KR');
assert.equal(STRATEGY_LINKS[2].href, '/strategies/kr-closing-bet');
assert.equal(STRATEGY_LINKS[2].group, 'KR');
assert.equal(STRATEGY_LINKS[3].href, '/strategies/us-52w');
assert.equal(STRATEGY_LINKS[3].group, 'US');
assert.equal(STRATEGY_LINKS[5].href, '/gold');
assert.equal(STRATEGY_LINKS[5].group, 'SPECIAL');
assert.equal(STRATEGY_LINKS[6].href, '/nasdaq');
assert.equal(STRATEGY_LINKS[6].group, 'SPECIAL');
assert.ok(STRATEGY_LINKS.every((item) => ['KR', 'US', 'SPECIAL'].includes(item.group)));
assert.ok(STRATEGY_LINKS.every((item) => item.sub.length > 0));

assert.equal(findActiveFlowStep('/scanner/NVDA')?.key, 'scanner');
assert.equal(findActiveFlowStep('/market-barometer')?.key, 'market');
assert.equal(
  FLOW_STEPS.find((step) => step.key === 'market')?.tabs[2]?.href,
  '/market-barometer',
);
assert.equal(FLOW_STEPS.find((step) => step.key === 'market')?.href, '/master-filter');
assert.equal(findActiveFlowStep('/gold'), undefined);
assert.equal(findActiveFlowStep('/gold/strategy'), undefined);
assert.equal(findActiveFlowStep('/nasdaq'), undefined);
assert.equal(getActiveFlowStep('/gold').key, 'home');

assert.equal(findActiveStrategyLink('/gold')?.label, '금 투자');
assert.equal(findActiveStrategyLink('/gold/strategy')?.href, '/gold');
assert.equal(findActiveStrategyLink('/golden'), undefined);
assert.equal(findActiveStrategyLink('/nasdaq')?.label, '나스닥100');
assert.equal(findActiveStrategyLink('/qqq')?.href, '/nasdaq');
assert.equal(findActiveStrategyLink('/strategies/kospi-52w')?.group, 'KR');
assert.equal(findActiveStrategyLink('/strategies/kr-closing-bet')?.label, '종가베팅');
assert.equal(findActiveStrategyLink('/strategies/us-monthly-v7')?.group, 'US');

assert.equal(isActiveTab('/recommendations', '/recommendations?view=metrics', 'category=KOSPI200&date=2026-09-08&view=metrics'), true);
assert.equal(isActiveTab('/history', '/history?view=stats', 'market=KR&view=stats'), true);
assert.equal(isActiveTab('/recommendations', '/recommendations', 'category=NASDAQ100'), true);
assert.equal(isActiveTab('/scanner', '/scanner', 'view=cross-check'), false);
assert.equal(getFlowTabHref('/recommendations?view=metrics', 'category=KOSPI200&date=2026-09-08'), '/recommendations?category=KOSPI200&date=2026-09-08&view=metrics');
assert.equal(new URL(getFlowTabHref('/history?view=stats', 'category=KOSDAQ150&date=2026-09-08'), 'http://localhost').searchParams.get('market'), 'KR');
assert.equal(new URL(getFlowTabHref('/recommendations', 'market=US&category=KOSPI200'), 'http://localhost').searchParams.get('category'), 'NASDAQ100');
assert.equal(new URL(getFlowTabHref('/recommendations', 'market=US&category=SP500'), 'http://localhost').searchParams.get('category'), 'SP500');
assert.equal(getFlowTabHref('/macro', 'view=stats&market=KR&memo=private'), '/macro');
assert.equal(new URL(getFlowTabHref('/history', 'market=KR&memo=private'), 'http://localhost').searchParams.has('memo'), false);
console.log('navigation tests passed');
