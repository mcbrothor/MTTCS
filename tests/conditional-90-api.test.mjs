import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(
  new URL('../app/api/assurance/conditional-90/route.ts', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../lib/assurance/repository.ts', import.meta.url),
  'utf8',
);
const operationsRoute = readFileSync(
  new URL('../app/api/internal/operations-health/route.ts', import.meta.url),
  'utf8',
);
const reviewerAuth = readFileSync(
  new URL('../lib/assurance/reviewer-auth.ts', import.meta.url),
  'utf8',
);

assert.match(route, /rejectUnauthenticatedRequest\(request\)/);
assert.match(route, /getRequestSession\(request\)/);
assert.match(route, /readConditional90Assurance/);
assert.match(route, /RECORD_DECISION/);
assert.match(route, /LINK_PILOT/);
assert.match(route, /RECORD_OUTCOME/);
assert.match(route, /RECORD_ACCESSIBILITY_REVIEW/);
assert.match(route, /recordManualAccessibilityReview/);
assert.doesNotMatch(route, /RECORD_BRANCH_PROTECTION_REVIEW/);
assert.doesNotMatch(route, /recordBranchProtectionReview/);
assert.match(route, /RECORD_BROKER_REVIEW/);
assert.match(route, /getAssuranceReviewerSubject/);
assert.match(route, /ASSURANCE_EVALUATION_FAILED/);
assert.match(route, /console\.error\('\[MTN\] Conditional assurance evaluation failed:/);
assert.doesNotMatch(route, /apiError\(\s*getErrorMessage\(/);
assert.match(route, /503/);
assert.match(route, /cache-control/);

const accessibilityBranchStart = route.indexOf("if (action === 'RECORD_ACCESSIBILITY_REVIEW')");
const sessionBranchStart = route.indexOf('const session = await getRequestSession(request)');
assert.ok(accessibilityBranchStart >= 0 && accessibilityBranchStart < sessionBranchStart);
const accessibilityBranch = route.slice(accessibilityBranchStart, sessionBranchStart);
assert.match(accessibilityBranch, /getAssuranceReviewerSubject\(request\)/);
assert.match(accessibilityBranch, /reviewerSubject,/);
assert.match(accessibilityBranch, /reviewerAttestation: body\.reviewerAttestation/);
assert.doesNotMatch(accessibilityBranch, /session\.sub/);

assert.match(repository, /assurance_score_snapshots/);
assert.match(repository, /recommendation_longitudinal_evaluations/);
assert.match(repository, /recommendation_pilot_outcomes/);
assert.match(repository, /persistSnapshot !== false/);
assert.match(repository, /capital_authorized:\s*false/);

assert.match(operationsRoute, /assurance_control_evidence/);
assert.match(operationsRoute, /EXTERNAL_HEALTH/);
assert.match(operationsRoute, /assuranceError \? 'FAILED'/);

assert.match(reviewerAuth, /MTN_ASSURANCE_REVIEWER_SECRET/);
assert.match(reviewerAuth, /MTN_ASSURANCE_REVIEWER_ID/);
assert.match(reviewerAuth, /constantTimeEqual/);

console.log('conditional 90 API and operations evidence contract tests passed');
