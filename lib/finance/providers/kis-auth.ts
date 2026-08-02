import axios from 'axios';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';
import { supabaseServer } from '@/lib/supabase/server';
import { sanitizeExternalError } from '@/lib/security/external-errors';
import { waitForKisRequestSlot } from './kis-rate-limit';

interface KisTokenCache {
  cachedToken: string | null;
  tokenExpiresAt: number;
  pendingTokenRequest: Promise<string> | null;
}

interface KisTokenResponse {
  access_token?: string;
  access_token_token_expired?: string;
  expires_in?: number | string;
}

interface StoredTokenRow {
  access_token: string;
  expires_at: string;
}

const TOKEN_EXPIRY_SAFETY_MS = 60 * 1000;
const TOKEN_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KIS_TOKEN_HTTP_TIMEOUT_MS = 12_000;

export interface KisTokenRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

declare global {
  var __mtnKisTokenCache: KisTokenCache | undefined;
}

const tokenCache = globalThis.__mtnKisTokenCache ?? {
  cachedToken: null,
  tokenExpiresAt: 0,
  pendingTokenRequest: null,
};

globalThis.__mtnKisTokenCache = tokenCache;

function tokenCacheKey(baseUrl: string, appKey: string) {
  return `kis:${baseUrl}:${appKey.slice(-8)}`;
}

function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('KIS token request cancelled.', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason || new DOMException('KIS token request cancelled.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function parseTokenExpiresAt(payload: KisTokenResponse, fallbackNow: number) {
  const maxExpiresAt = fallbackNow + TOKEN_CACHE_MAX_AGE_MS - TOKEN_EXPIRY_SAFETY_MS;

  if (payload.access_token_token_expired) {
    const parsed = new Date(payload.access_token_token_expired).getTime();
    if (Number.isFinite(parsed)) return Math.min(parsed - TOKEN_EXPIRY_SAFETY_MS, maxExpiresAt);
  }

  const expiresInSeconds = Number(payload.expires_in);
  if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    return Math.min(fallbackNow + expiresInSeconds * 1000 - TOKEN_EXPIRY_SAFETY_MS, maxExpiresAt);
  }

  return maxExpiresAt;
}

async function readStoredToken(
  cacheKey: string,
  now: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const request = supabaseServer
      .from('api_token_cache')
      .select('access_token, expires_at')
      .eq('provider', cacheKey);
    const { data, error } = await (signal ? request.abortSignal(signal) : request).maybeSingle();

    if (error || !data) return null;

    const row = data as StoredTokenRow;
    const expiresAt = new Date(row.expires_at).getTime();
    if (!row.access_token || !Number.isFinite(expiresAt) || now >= expiresAt) return null;

    tokenCache.cachedToken = row.access_token;
    tokenCache.tokenExpiresAt = expiresAt;
    return row.access_token;
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    return null;
  }
}

async function writeStoredToken(
  cacheKey: string,
  token: string,
  expiresAt: number,
  signal?: AbortSignal,
) {
  try {
    const request = supabaseServer
      .from('api_token_cache')
      .upsert({
        provider: cacheKey,
        access_token: token,
        expires_at: new Date(expiresAt).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });
    await (signal ? request.abortSignal(signal) : request);
  } catch {
    // Runtime can still operate with the in-memory token cache if durable storage is unavailable.
  }
}

export async function getKisToken(options: KisTokenRequestOptions = {}): Promise<string> {
  const now = Date.now();
  if (tokenCache.cachedToken && now < tokenCache.tokenExpiresAt) {
    return tokenCache.cachedToken;
  }

  if (tokenCache.pendingTokenRequest) {
    return waitWithSignal(tokenCache.pendingTokenRequest, options.signal);
  }

  const KIS_APP_KEY = kisAppKey();
  const KIS_APP_SECRET = kisAppSecret();
  const KIS_BASE_URL = kisBaseUrl();
  const cacheKey = tokenCacheKey(KIS_BASE_URL, KIS_APP_KEY);

  tokenCache.pendingTokenRequest = (async () => {
    const storedToken = await readStoredToken(cacheKey, Date.now(), options.signal);
    if (storedToken) return storedToken;

    await waitForKisRequestSlot('token', { signal: options.signal });
    // 다른 인스턴스가 앞선 공유 슬롯에서 토큰을 발급했을 수 있으므로
    // 대기 후 영속 캐시를 다시 확인해 중복 발급 자체를 피합니다.
    const tokenIssuedByAnotherInstance = await readStoredToken(cacheKey, Date.now(), options.signal);
    if (tokenIssuedByAnotherInstance) return tokenIssuedByAnotherInstance;

    const response = await axios.post(`${KIS_BASE_URL}/oauth2/tokenP`, {
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    }, {
      timeout: options.timeoutMs ?? KIS_TOKEN_HTTP_TIMEOUT_MS,
      signal: options.signal,
    });

    const payload = response.data as KisTokenResponse;
    if (!payload.access_token) {
      throw new Error('KIS API 토큰 응답에 access_token이 없습니다.');
    }

    tokenCache.cachedToken = payload.access_token;
    tokenCache.tokenExpiresAt = parseTokenExpiresAt(payload, Date.now());
    await writeStoredToken(cacheKey, tokenCache.cachedToken, tokenCache.tokenExpiresAt, options.signal);
    
    return tokenCache.cachedToken;
  })();

  try {
    return await waitWithSignal(tokenCache.pendingTokenRequest, options.signal);
  } catch (error) {
    console.error('[KIS]', sanitizeExternalError('KIS', 'token', error));
    throw new Error('KIS API 인증 실패');
  } finally {
    tokenCache.pendingTokenRequest = null;
  }
}
