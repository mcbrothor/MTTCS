import { secretsMatch } from '@/lib/security/secrets';

export function validateKisCoordinatorRequest(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  return secretsMatch(token, process.env.KIS_RATE_LIMIT_COORDINATOR_SECRET);
}
