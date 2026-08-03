import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildProtectedRefArtifact,
  stableHash,
  verifyReleaseOnProtectedMain,
} from '../scripts/record-branch-protection-assurance.mjs';

const releaseSha = '1'.repeat(40);
const mainHeadSha = '2'.repeat(40);

assert.deepEqual(
  verifyReleaseOnProtectedMain({ releaseSha, mainHeadSha: releaseSha }),
  { relation: 'MAIN_HEAD', releaseSha, mainHeadSha: releaseSha },
);
assert.deepEqual(
  verifyReleaseOnProtectedMain({
    releaseSha,
    mainHeadSha,
    comparison: { status: 'ahead', merge_base_commit: { sha: releaseSha } },
  }),
  { relation: 'MAIN_ANCESTOR', releaseSha, mainHeadSha },
);

for (const comparison of [
  { status: 'behind', merge_base_commit: { sha: mainHeadSha } },
  { status: 'diverged', merge_base_commit: { sha: '3'.repeat(40) } },
  { status: 'ahead', merge_base_commit: { sha: '3'.repeat(40) } },
  null,
]) {
  assert.throws(
    () => verifyReleaseOnProtectedMain({ releaseSha, mainHeadSha, comparison }),
    /could not|not GitHub main HEAD or an ancestor|not a full commit SHA/,
  );
}

const protection = { required_status_checks: { strict: true, contexts: ['test'] } };
const artifact = buildProtectedRefArtifact({
  repository: 'example/mtn',
  release: { relation: 'MAIN_ANCESTOR', releaseSha, mainHeadSha },
  protection,
});
assert.equal(artifact.protected_ref, 'refs/heads/main');
assert.equal(artifact.protected_ref_head_sha, mainHeadSha);
assert.equal(artifact.release_sha, releaseSha);
assert.notEqual(
  stableHash(artifact),
  stableHash({ ...artifact, protected_ref_head_sha: '4'.repeat(40) }),
  'artifact hash must be bound to the protected ref HEAD',
);

const script = readFileSync(
  new URL('../scripts/record-branch-protection-assurance.mjs', import.meta.url),
  'utf8',
);

for (const requiredCheck of [
  'strict_status_checks',
  'required_test_check',
  'enforce_admins',
  'force_pushes_disabled',
  'deletions_disabled',
]) assert.match(script, new RegExp(requiredCheck));

assert.match(script, /branches\/main/);
assert.match(script, /compare\/\$\{releaseSha\}\.\.\.\$\{mainHeadSha\}/);
assert.match(script, /branches\/main\/protection/);
assert.match(script, /protected_ref_head_sha/);
assert.match(script, /release_ancestor_verified:\s*true/);
assert.match(script, /assurance_control_evidence/);
assert.match(script, /resolution=ignore-duplicates/);
assert.match(script, /source_kind:\s*'GITHUB_API'/);
assert.match(script, /identityBucket:[\s\S]{0,240}mainHeadSha[\s\S]{0,100}artifactHash/);
assert.match(script, /status !== 'PASS'/);
assert.doesNotMatch(script, /console\.log\([^\n]*(?:serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY)/);

console.log('branch protection assurance recorder tests passed');
