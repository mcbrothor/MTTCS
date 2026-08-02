import { secretsMatch } from '../security/secrets.ts';

export function validateOperationsMonitorRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const expected = env.MTN_HEALTH_MONITOR_TOKEN?.trim() || '';
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return secretsMatch(match?.[1]?.trim(), expected);
}
