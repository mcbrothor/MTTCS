import assert from 'node:assert/strict';
import { diffScannerSnapshots } from '../lib/scanner/saved-screens.ts';
import { evaluatePriceAlert } from '../lib/alerts/evaluate.ts';

const row = (ticker, tier) => ({ ticker, name:ticker, recommendationTier:tier });
const diff = diffScannerSnapshots([row('A','Action'),row('B','Recommended'),row('X','Action')],[row('A','Recommended'),row('B','Action'),row('C','Action')]);
assert.deepEqual(diff.entered.map(x=>x.ticker),['C']);
assert.deepEqual(diff.exited.map(x=>x.ticker),['X']);
assert.deepEqual(diff.upgraded.map(x=>x.ticker),['A']);
assert.deepEqual(diff.downgraded.map(x=>x.ticker),['B']);

assert.ok(evaluatePriceAlert({event_type:'PIVOT_NEAR',scope_id:'A',params:{targetPrice:100,thresholdPct:5}},104,null));
assert.equal(evaluatePriceAlert({event_type:'PIVOT_NEAR',scope_id:'A',params:{targetPrice:100,thresholdPct:5}},106,null),null);
assert.ok(evaluatePriceAlert({event_type:'BREAKOUT',scope_id:'A',params:{targetPrice:100}},101,99));
assert.equal(evaluatePriceAlert({event_type:'BREAKOUT',scope_id:'A',params:{targetPrice:100}},101,101),null);
console.log('immediate feature tests passed');
