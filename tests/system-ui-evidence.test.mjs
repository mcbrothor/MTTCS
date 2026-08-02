import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
import path from 'node:path';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});

const {
  describeFreshness,
  describePromotion,
  safeDisplayError,
} = jiti('../components/ui/system-evidence.ts');

test('raw infrastructure errors are replaced with an actionable safe message', () => {
  const raw = 'TypeError: fetch failed\n  at async GET (route.ts:42)\n  cause: connect ECONNREFUSED 127.0.0.1:5432';

  assert.equal(safeDisplayError(raw), '내부 오류 상세는 운영 로그에서 확인하세요.');
  assert.equal(safeDisplayError('인증이 만료되었습니다. 다시 로그인해 주세요.'), '인증이 만료되었습니다. 다시 로그인해 주세요.');
});

test('freshness is not inferred when the API did not measure it', () => {
  assert.deepEqual(describeFreshness(undefined, null), {
    label: '미측정',
    detail: 'API가 신선도 판정을 제공하지 않았습니다.',
  });
  assert.deepEqual(describeFreshness(false, null), {
    label: '정상',
    detail: 'API 신선도 판정 기준을 통과했습니다.',
  });
  assert.deepEqual(describeFreshness(true, '기준시각이 허용 지연을 초과했습니다.'), {
    label: '지연',
    detail: '기준시각이 허용 지연을 초과했습니다.',
  });
});

test('promotion decisions use explicit Korean labels and missing data stays pending', () => {
  assert.equal(describePromotion(null), '검증 대기');
  assert.equal(describePromotion('CONTINUE'), '표본 축적 중');
  assert.equal(describePromotion('KEEP_OFFICIAL'), '현 정책 유지');
  assert.equal(describePromotion('PROMOTE_RISK'), '리스크 정책 승격 후보');
  assert.equal(describePromotion('PROMOTE_FLOW'), '수급 정책 승격 후보');
});
