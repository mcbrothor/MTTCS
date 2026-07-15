import assert from 'node:assert/strict';
import { describeProfessionalPlan } from '../lib/finance/core/professional-plan-presentation.ts';

const description = describeProfessionalPlan({ verdict: 'WATCH', setupGrade: 'B', readiness: 'EARLY' });
assert.equal(description.verdictLabel, '관찰');
assert.match(description.verdictMeaning, /매수 조건이 완성되지 않았습니다/);
assert.equal(description.gradeLabel, '양호');
assert.match(description.gradeMeaning, /타이밍 확인/);
assert.equal(description.readinessLabel, '구조 형성 중');
assert.match(description.readinessMeaning, /진입 기준가가 아직 확정되지 않았습니다/);
assert.match(description.action, /현재는 매수하지 않습니다/);
console.log('professional plan presentation tests passed');
