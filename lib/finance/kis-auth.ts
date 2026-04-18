import axios from 'axios';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';
import { supabaseServer } from '@/lib/supabase/server';

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

async function readStoredToken(cacheKey: string, now: number): Promise<string | null> {
  try {
    const { data, error } = await supabaseServer
      .from('api_token_cache')
      .select('access_token, expires_at')
      .eq('provider', cacheKey)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as StoredTokenRow;
    const expiresAt = new Date(row.expires_at).getTime();
    if (!row.access_token || !Number.isFinite(expiresAt) || now >= expiresAt) return null;

    tokenCache.cachedToken = row.access_token;
    tokenCache.tokenExpiresAt = expiresAt;
    return row.access_token;
  } catch {
    return null;
  }
}

async function writeStoredToken(cacheKey: string, token: string, expiresAt: number) {
  try {
    await supabaseServer
      .from('api_token_cache')
      .upsert({
        provider: cacheKey,
        access_token: token,
        expires_at: new Date(expiresAt).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });
  } catch {
    // Runtime can still operate with the in-memory token cache if durable storage is unavailable.
  }
}

export async function getKisToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache.cachedToken && now < tokenCache.tokenExpiresAt) {
    return tokenCache.cachedToken;
  }

  if (tokenCache.pendingTokenRequest) {
    return tokenCache.pendingTokenRequest;
  }

  const KIS_APP_KEY = kisAppKey();
  const KIS_APP_SECRET = kisAppSecret();
  const KIS_BASE_URL = kisBaseUrl();
  const cacheKey = tokenCacheKey(KIS_BASE_URL, KIS_APP_KEY);

  const storedToken = await readStoredToken(cacheKey, now);
  if (storedToken) return storedToken;

  tokenCache.pendingTokenRequest = (async () => {
    const storedTokenAfterWait = await readStoredToken(cacheKey, Date.now());
    if (storedTokenAfterWait) return storedTokenAfterWait;

    const response = await axios.post(`${KIS_BASE_URL}/oauth2/tokenP`, {
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    });

    const payload = response.data as KisTokenResponse;
    if (!payload.access_token) {
      throw new Error('KIS API 토큰 응답에 access_token이 없습니다.');
    }

    tokenCache.cachedToken = payload.access_token;
    tokenCache.tokenExpiresAt = parseTokenExpiresAt(payload, Date.now());
    await writeStoredToken(cacheKey, tokenCache.cachedToken, tokenCache.tokenExpiresAt);
    
    return tokenCache.cachedToken;
  })();

  try {
    return await tokenCache.pendingTokenRequest;
  } catch (error) {
    console.error('Failed to get KIS Token:', error);
    throw new Error('KIS API 인증 실패');
  } finally {
    tokenCache.pendingTokenRequest = null;
  }
}
