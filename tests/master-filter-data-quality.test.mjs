import assert from 'node:assert/strict';
import { isMasterFilterDataStale } from '../lib/master-filter/data-quality.ts';

assert.equal(isMasterFilterDataStale({
  fallbackUsed: false,
  isStale: false,
  warnings: ['국내 지수가 급락해 신규 매수를 중단했습니다.'],
}), false, 'market-risk warnings must not be treated as stale data');

assert.equal(isMasterFilterDataStale({
  fallbackUsed: true,
  warnings: [],
}), true, 'provider fallback remains a data-quality warning');

assert.equal(isMasterFilterDataStale({
  fallbackUsed: false,
  isStale: true,
  warnings: [],
}), true, 'an explicit stale flag remains authoritative');

assert.equal(isMasterFilterDataStale(undefined), false);

console.log('master filter data-quality tests passed');
