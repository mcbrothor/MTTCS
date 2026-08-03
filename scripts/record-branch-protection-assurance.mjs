import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Evidence cannot contain non-finite numbers.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
      value[key] === undefined ? [] : [[key, canonicalize(value[key])]]
    )));
  }
  throw new Error(`Unsupported evidence value: ${typeof value}`);
}

export function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function command(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function requiredEnvironment(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '') || '';
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredSha(value, label) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalized)) throw new Error(`${label} is not a full commit SHA.`);
  return normalized;
}

function parseJsonCommand(file, args, label) {
  try {
    return JSON.parse(command(file, args));
  } catch (error) {
    throw new Error(`${label} could not be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * GitHub's compare endpoint is called with releaseSha as the base and mainHeadSha
 * as the head. `ahead` plus a matching merge-base proves that the release is an
 * ancestor of the protected main ref. Every other relation fails closed.
 */
export function verifyReleaseOnProtectedMain({ releaseSha, mainHeadSha, comparison = null }) {
  const release = requiredSha(releaseSha, 'Release revision');
  const mainHead = requiredSha(mainHeadSha, 'GitHub main HEAD');

  if (release === mainHead) {
    return { relation: 'MAIN_HEAD', releaseSha: release, mainHeadSha: mainHead };
  }

  const mergeBaseSha = requiredSha(comparison?.merge_base_commit?.sha, 'GitHub comparison merge-base');
  if (comparison?.status !== 'ahead' || mergeBaseSha !== release) {
    throw new Error(
      `Release revision ${release} is not GitHub main HEAD or an ancestor of it `
      + `(status=${String(comparison?.status || 'missing')}, mergeBase=${mergeBaseSha}).`,
    );
  }

  return { relation: 'MAIN_ANCESTOR', releaseSha: release, mainHeadSha: mainHead };
}

export function buildProtectedRefArtifact({ repository, release, protection }) {
  return {
    schema_version: 'mtn-github-protected-ref-artifact-v2',
    repository,
    protected_ref: 'refs/heads/main',
    protected_ref_head_sha: release.mainHeadSha,
    release_sha: release.releaseSha,
    release_relation: release.relation,
    protection,
  };
}

export async function main() {
  const supabaseUrl = requiredEnvironment('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const repository = command('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error('GitHub repository identity is invalid.');
  const reviewer = command('gh', ['api', 'user', '--jq', '.login']);
  const releaseSha = requiredSha(
    process.env.MTN_RELEASE_SHA || command('git', ['rev-parse', 'HEAD']),
    'Release revision',
  );

  const mainBranch = parseJsonCommand(
    'gh',
    ['api', `repos/${repository}/branches/main`],
    'GitHub main HEAD',
  );
  const mainHeadSha = requiredSha(mainBranch?.commit?.sha, 'GitHub main HEAD');
  const comparison = releaseSha === mainHeadSha
    ? null
    : parseJsonCommand(
      'gh',
      ['api', `repos/${repository}/compare/${releaseSha}...${mainHeadSha}`],
      'GitHub release ancestry',
    );
  const release = verifyReleaseOnProtectedMain({ releaseSha, mainHeadSha, comparison });

  const protection = parseJsonCommand(
    'gh',
    ['api', `repos/${repository}/branches/main/protection`],
    'GitHub main branch protection',
  );
  const requiredStatusChecks = [
    ...(Array.isArray(protection.required_status_checks?.contexts)
      ? protection.required_status_checks.contexts
      : []),
    ...(Array.isArray(protection.required_status_checks?.checks)
      ? protection.required_status_checks.checks.map((check) => check?.context)
      : []),
  ].filter((value, index, values) => typeof value === 'string' && values.indexOf(value) === index);
  const checks = {
    strict_status_checks: protection.required_status_checks?.strict === true,
    required_test_check: requiredStatusChecks.includes('test'),
    enforce_admins: protection.enforce_admins?.enabled === true,
    force_pushes_disabled: protection.allow_force_pushes?.enabled === false,
    deletions_disabled: protection.allow_deletions?.enabled === false,
  };
  const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
  const observedAt = new Date().toISOString();
  const validUntil = new Date(Date.parse(observedAt) + 90 * 24 * 60 * 60 * 1_000).toISOString();
  const protectedRefArtifact = buildProtectedRefArtifact({ repository, release, protection });
  const protectionSnapshotHash = stableHash(protection);
  const artifactHash = stableHash(protectedRefArtifact);
  const reviewerSubjectHash = stableHash({ namespace: 'mtn-assurance-actor-v1', subject: reviewer });
  const payload = {
    policyVersion: 'mtn-conditional-90-policy-2026.08-v1',
    artifact_hash: artifactHash,
    protection_snapshot_hash: protectionSnapshotHash,
    reviewer_subject_hash: reviewerSubjectHash,
    repository,
    branch: 'main',
    protected_ref: protectedRefArtifact.protected_ref,
    protected_ref_head_sha: mainHeadSha,
    release_relation: release.relation,
    release_ancestor_verified: true,
    required_status_checks: requiredStatusChecks,
    checks,
  };
  const row = {
    evidence_hash: stableHash({
      controlKey: 'BRANCH_PROTECTION',
      status,
      environment: 'PRODUCTION',
      identityBucket: observedAt.slice(0, 10),
      releaseSha,
      mainHeadSha,
      artifactHash,
    }),
    control_key: 'BRANCH_PROTECTION',
    environment: 'PRODUCTION',
    status,
    source_kind: 'GITHUB_API',
    source_record_id: artifactHash,
    release_sha: releaseSha,
    observed_at: observedAt,
    valid_until: validUntil,
    payload,
    payload_hash: stableHash(payload),
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/assurance_control_evidence`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Branch-protection assurance append failed (${response.status}): ${detail}`);
  }

  console.log(JSON.stringify({
    repository,
    branch: 'main',
    releaseSha,
    mainHeadSha,
    releaseRelation: release.relation,
    status,
    checks,
    artifactHash,
    evidenceHash: row.evidence_hash,
  }));
  if (status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
