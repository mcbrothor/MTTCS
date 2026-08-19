import assert from 'node:assert/strict';
import test from 'node:test';
import { collectKrSecurityProfiles } from '../lib/recommendations/kr-security-profile.ts';

test('security profile collection preserves successful sectors and reports partial failures', async () => {
  const result = await collectKrSecurityProfiles({
    items: [
      { ticker: '005930', exchange: 'KOSPI', name: '삼성전자' },
      { ticker: '000001', exchange: 'KOSPI', name: '실패종목' },
    ],
    intervalMs: 0,
    request: async (ticker) => {
      if (ticker === '000001') throw new Error('provider error');
      return { sector: '전기·전자' };
    },
  });
  assert.deepEqual(result.profiles, [{ ticker: '005930', exchange: 'KOSPI', name: '삼성전자', sector: '전기·전자' }]);
  assert.equal(result.errors.get('000001'), 'provider error');
});
