const REVIEWER_SECRET_HEADER = 'x-mtn-assurance-reviewer-secret';

async function sha256Bytes(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function getAssuranceReviewerSubject(request: Request) {
  const configuredSecret = process.env.MTN_ASSURANCE_REVIEWER_SECRET || '';
  const reviewerId = (process.env.MTN_ASSURANCE_REVIEWER_ID || '').trim();
  const presentedSecret = request.headers.get(REVIEWER_SECRET_HEADER) || '';
  if (configuredSecret.length < 32 || reviewerId.length < 3 || presentedSecret.length < 32) return null;
  const [expected, presented] = await Promise.all([
    sha256Bytes(configuredSecret),
    sha256Bytes(presentedSecret),
  ]);
  return constantTimeEqual(expected, presented) ? `assurance-reviewer:${reviewerId}` : null;
}
