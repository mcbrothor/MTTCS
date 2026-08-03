import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const {
  CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS,
} = jiti('../lib/assurance/conditional-90.ts');
const { recordManualAccessibilityReview } = jiti('../lib/assurance/actions.ts');

function recordingClient() {
  const inserted = [];
  class Query {
    insert(row) { inserted.push(row); return this; }
    select() { return this; }
    single() {
      const row = inserted.at(-1);
      return Promise.resolve({
        data: {
          id: '90000000-0000-4000-8000-000000000002',
          evidence_hash: row.evidence_hash,
          control_key: row.control_key,
          status: row.status,
          release_sha: row.release_sha,
          observed_at: row.observed_at,
          valid_until: row.valid_until,
        },
        error: null,
      });
    }
  }
  return { client: { from: () => new Query() }, inserted };
}

function validReview(overrides = {}) {
  return {
    reviewerSubject: 'assurance-reviewer:independent-accessibility-reviewer',
    releaseSha: 'a'.repeat(40),
    artifactHash: 'b'.repeat(64),
    assistiveTechnology: {
      name: 'VoiceOver',
      version: '15.6',
      platform: 'macOS 15.6',
    },
    routesReviewed: [...CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS].reverse(),
    checks: {
      screenReader: true,
      keyboardOnly: true,
      focusOrder: true,
      colorIndependence: true,
      zoom200: true,
      mobile360: true,
    },
    reviewerAttestation: 'I independently reviewed every core route with the named assistive technology.',
    notes: 'All observations are recorded in the hashed accessibility report.',
    observedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('manual accessibility PASS is canonicalized to the exact core routes and independent-review evidence', async () => {
  const { client, inserted } = recordingClient();
  const result = await recordManualAccessibilityReview({ client, ...validReview() });

  assert.equal(result.status, 'PASS');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].source_kind, 'MANUAL_REVIEW');
  assert.equal(inserted[0].source_record_id, 'b'.repeat(64));
  assert.deepEqual(inserted[0].payload.routes_reviewed, CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS);
  assert.equal(inserted[0].payload.schema_version, 'mtn-a11y-manual-review-v1');
  assert.equal(inserted[0].payload.reviewer_authentication, 'INDEPENDENT_ASSURANCE_CREDENTIAL');
  assert.equal(inserted[0].payload.assistive_technology.name, 'VoiceOver');
});

test('manual accessibility review rejects an ordinary session subject and a partial route set', async () => {
  const { client } = recordingClient();
  await assert.rejects(
    recordManualAccessibilityReview({ client, ...validReview({ reviewerSubject: 'ordinary-user-session' }) }),
    /independently authenticated assurance reviewer/i,
  );
  await assert.rejects(
    recordManualAccessibilityReview({ client, ...validReview({ routesReviewed: ['/'] }) }),
    /exact core route set/i,
  );
});

test('manual accessibility review records FAIL instead of PASS when one attested check fails', async () => {
  const { client, inserted } = recordingClient();
  await recordManualAccessibilityReview({
    client,
    ...validReview({ checks: { ...validReview().checks, screenReader: false } }),
  });
  assert.equal(inserted[0].status, 'FAIL');
  assert.equal(inserted[0].payload.result, 'FAIL');
});
