import assert from 'node:assert/strict';
import {
  CANSLIM_PILLARS,
  getPillarDisplayStatus,
  getPillarPassCount,
  getPillarTooltip,
} from '../lib/finance/engines/canslim-pillars.ts';

console.log('=== CAN SLIM Pillar Display Tests ===\n');

assert.deepEqual(CANSLIM_PILLARS, ['C', 'A', 'N', 'S', 'L', 'I', 'M']);
console.log('OK pillar order follows CAN SLIM sequence');

{
  const result = {
    pillarDetails: [
      { pillar: 'C', label: '분기 EPS 성장률', status: 'PASS', value: '41%', threshold: '>= 25%', description: 'EPS growth passed' },
      { pillar: 'C', label: '분기 매출 성장률', status: 'PASS', value: '29%', threshold: '>= 20%', description: 'Sales growth passed' },
      { pillar: 'A', label: 'ROE', status: 'PASS', value: '24%', threshold: '>= 17%', description: 'ROE passed' },
      { pillar: 'N', label: '신고가 근접', status: 'FAIL', value: '12%', threshold: '<= 10%', description: 'Too far from high' },
      { pillar: 'L', label: '상대강도 RS', status: 'WARNING', value: 78, threshold: '>= 80', description: 'Close but not enough' },
      { pillar: 'M', label: '시장 방향성', status: 'PASS', value: 'FULL', threshold: 'FULL/REDUCED', description: 'Market supports risk-on' },
    ],
  };

  assert.equal(getPillarPassCount(result), 3);
  assert.equal(getPillarDisplayStatus(result, 'C'), 'PASS');
  assert.equal(getPillarDisplayStatus(result, 'N'), 'FAIL');
  assert.equal(getPillarDisplayStatus(result, 'L'), 'WARNING');
  assert.equal(getPillarDisplayStatus(result, 'S'), 'NONE');
  assert.match(getPillarTooltip(result, 'C'), /^C \[PASS\]:/);
  console.log('OK pillar score counts distinct passing pillars instead of raw PASS detail rows');
}

console.log('\n=== All CAN SLIM Pillar Display Tests Passed ===');
