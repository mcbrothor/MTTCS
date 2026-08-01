import { createHmac } from 'node:crypto';
import { secretsMatch } from '@/lib/security/secrets';

const KIS_COORDINATOR_CONTEXT = 'mtn:kis-rate-limit-coordinator:v1';

export function kisCoordinatorSecret(env: NodeJS.ProcessEnv = process.env) {
  const explicit = env.KIS_RATE_LIMIT_COORDINATOR_SECRET?.trim();
  if (explicit) return explicit;

  const kisSecret = env.KIS_APP_SECRET?.trim();
  if (!kisSecret) return '';
  return createHmac('sha256', kisSecret)
    .update(KIS_COORDINATOR_CONTEXT, 'utf8')
    .digest('hex');
}

export function validateKisCoordinatorRequest(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  return secretsMatch(token, kisCoordinatorSecret());
}
