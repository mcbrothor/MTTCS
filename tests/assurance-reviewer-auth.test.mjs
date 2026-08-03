import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { getAssuranceReviewerSubject } = jiti('../lib/assurance/reviewer-auth.ts');

test('independent reviewer authentication fails closed and accepts only the configured secret', async () => {
  const previousSecret = process.env.MTN_ASSURANCE_REVIEWER_SECRET;
  const previousId = process.env.MTN_ASSURANCE_REVIEWER_ID;
  try {
    process.env.MTN_ASSURANCE_REVIEWER_SECRET = 'reviewer-secret-with-at-least-32-characters';
    process.env.MTN_ASSURANCE_REVIEWER_ID = 'external-a11y-and-broker-reviewer';
    assert.equal(
      await getAssuranceReviewerSubject(new Request('http://localhost/review')),
      null,
    );
    assert.equal(
      await getAssuranceReviewerSubject(new Request('http://localhost/review', {
        headers: { 'x-mtn-assurance-reviewer-secret': 'incorrect-secret-with-at-least-32-chars' },
      })),
      null,
    );
    assert.equal(
      await getAssuranceReviewerSubject(new Request('http://localhost/review', {
        headers: { 'x-mtn-assurance-reviewer-secret': process.env.MTN_ASSURANCE_REVIEWER_SECRET },
      })),
      'assurance-reviewer:external-a11y-and-broker-reviewer',
    );
  } finally {
    if (previousSecret === undefined) delete process.env.MTN_ASSURANCE_REVIEWER_SECRET;
    else process.env.MTN_ASSURANCE_REVIEWER_SECRET = previousSecret;
    if (previousId === undefined) delete process.env.MTN_ASSURANCE_REVIEWER_ID;
    else process.env.MTN_ASSURANCE_REVIEWER_ID = previousId;
  }
});
