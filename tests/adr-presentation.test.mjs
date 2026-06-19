import assert from 'node:assert/strict';
import {
  ADVANCE_DECLINE_RATIO_BANDS,
  getAverageDailyRangeGuidance,
} from '../lib/master-filter/adr-presentation.ts';

assert.deepEqual(
  ADVANCE_DECLINE_RATIO_BANDS.map((band) => band.range),
  ['75% 이하', '75~100%', '100%', '100~120%', '120% 이상'],
);

assert.equal(getAverageDailyRangeGuidance('PASS').label, '안정 구간');
assert.equal(getAverageDailyRangeGuidance('WARNING').label, '주의 구간');
assert.equal(getAverageDailyRangeGuidance('FAIL').label, '과열 변동폭');

console.log('ADR presentation tests passed');
