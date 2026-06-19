import { apiError, getErrorMessage } from '@/lib/api/response';
import { localLlmProxySecret } from '@/lib/env';

const UPSTREAM_BASE_URL = process.env.LOCAL_LLM_UPSTREAM_URL || 'http://127.0.0.1:11434/v1';

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || request.headers.get('x-mtn-proxy-secret') || '';
}

function upstreamUrl(path: string[]) {
  const base = UPSTREAM_BASE_URL.replace(/\/$/, '');
  const suffix = path.join('/');
  return `${base}/${suffix}`;
}

async function proxyLocalLlm(request: Request, path: string[]) {
  const secret = localLlmProxySecret();
  if (!secret) {
    return apiError('LOCAL_LLM_PROXY_SECRET or TOSS_PROXY_SECRET is not configured.', 'PROXY_SECRET_REQUIRED', 503);
  }
  if (bearerToken(request) !== secret) {
    return apiError('Local LLM proxy authentication failed.', 'AUTH_REQUIRED', 401);
  }

  try {
    const url = new URL(request.url);
    const target = new URL(upstreamUrl(path));
    target.search = url.search;

    const response = await fetch(target, {
      method: request.method,
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
        accept: request.headers.get('accept') || 'application/json',
      },
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to proxy Local LLM request.'), 'API_ERROR', 500);
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyLocalLlm(request, path || []);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyLocalLlm(request, path || []);
}
