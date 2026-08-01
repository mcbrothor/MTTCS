import assert from 'node:assert/strict';
import {
  aiAttemptStatusLabel,
  friendlyAiFailureMessage,
  isCountedModelInsight,
} from '../lib/ai/market-insight-display.ts';

assert.equal(aiAttemptStatusLabel('success'), '응답 완료');
assert.equal(aiAttemptStatusLabel('failed'), '응답 실패');
assert.equal(aiAttemptStatusLabel('skipped', 'UNAVAILABLE'), '운영 환경 제외');
assert.equal(aiAttemptStatusLabel('skipped'), '건너뜀');

assert.equal(friendlyAiFailureMessage('TIMEOUT'), '응답 시간이 길어져 다른 분석 경로로 전환했습니다.');
assert.equal(friendlyAiFailureMessage('MODEL_NOT_FOUND'), '현재 사용할 수 없는 분석 모델입니다.');
assert.equal(friendlyAiFailureMessage('INVALID_RESPONSE'), '답변 형식이 기준에 맞지 않아 사용하지 않았습니다.');
assert.equal(friendlyAiFailureMessage('PROXY_ERROR'), '로컬 분석 연결 주소 또는 프록시 상태를 확인해야 합니다.');
assert.equal(friendlyAiFailureMessage('UNAVAILABLE'), '현재 운영 환경에서 사용하지 않는 분석 방식입니다.');

assert.equal(isCountedModelInsight({ status: 'success' }), true);
assert.equal(isCountedModelInsight({ status: 'failed' }), true);
assert.equal(isCountedModelInsight({ status: 'skipped' }), false);

console.log('market insight display tests passed');
