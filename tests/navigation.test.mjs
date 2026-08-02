import assert from 'node:assert/strict';
import {
  FLOW_STEPS,
  STRATEGY_LINKS,
  findActiveFlowStep,
  findActiveStrategyLink,
  getActiveFlowStep,
} from '../components/layout/navigation.ts';

assert.equal(FLOW_STEPS.length, 8);
assert.deepEqual(
  FLOW_STEPS.map((step) => step.step),
  ['00', '01', '02', '03', '04', '05', '06', '07'],
);

assert.equal(STRATEGY_LINKS.length, 2);
assert.equal(STRATEGY_LINKS[0].href, '/gold');
assert.equal(STRATEGY_LINKS[1].href, '/nasdaq');

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

console.log('navigation tests passed');
