import assert from 'node:assert/strict';
import { isChartOverlayVisible } from '../lib/finance/core/chart-overlay-focus.ts';

assert.equal(isChartOverlayVisible({ patternId: 'vcp', category: 'base', mode: 'all', focusedPatternId: null }), true);
assert.equal(isChartOverlayVisible({ patternId: 'vcp', category: 'base', mode: 'pivot', focusedPatternId: null }), false);
assert.equal(isChartOverlayVisible({ patternId: 'risk', category: 'risk', mode: 'pivot', focusedPatternId: null }), true);
assert.equal(isChartOverlayVisible({ patternId: 'cup', category: 'pattern', mode: 'base', focusedPatternId: null }), true);
assert.equal(isChartOverlayVisible({ patternId: 'vcp', category: 'base', mode: 'pivot', focusedPatternId: 'vcp' }), true);
assert.equal(isChartOverlayVisible({ patternId: 'cup', category: 'pattern', mode: 'all', focusedPatternId: 'vcp' }), false);

console.log('chart overlay focus tests passed');
