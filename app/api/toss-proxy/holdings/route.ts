import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getTossHoldings } from '@/lib/finance/providers/toss-api';
import { tossProxySecret } from '@/lib/env';

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || request.headers.get('x-mtn-proxy-secret') || '';
}

export async function GET(request: Request) {
  const secret = tossProxySecret();
  if (!secret) {
    return apiError('TOSS_PROXY_SECRET is not configured.', 'PROXY_SECRET_REQUIRED', 503);
  }
  if (bearerToken(request) !== secret) {
    return apiError('Toss proxy authentication failed.', 'AUTH_REQUIRED', 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market') === 'US' ? 'US' : 'KR';
    const snapshot = await getTossHoldings(market, { bypassProxy: true });
    return apiSuccess(snapshot, {
      source: 'Local MTN Toss proxy',
      provider: 'Toss Securities',
      delay: 'REALTIME',
    });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to fetch Toss holdings through proxy.'), 'API_ERROR', 500);
  }
}
