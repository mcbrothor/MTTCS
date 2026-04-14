import axios from 'axios';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';

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

const TOKEN_EXPIRY_SAFETY_MS = 60 * 1000;

declare global {
  var __mttcsKisTokenCache: KisTokenCache | undefined;
}

const tokenCache = globalThis.__mttcsKisTokenCache ?? {
  cachedToken: null,
  tokenExpiresAt: 0,
  pendingTokenRequest: null,
};

globalThis.__mttcsKisTokenCache = tokenCache;

function parseTokenExpiresAt(payload: KisTokenResponse, fallbackNow: number) {
  if (payload.access_token_token_expired) {
    const parsed = new Date(payload.access_token_token_expired).getTime();
    if (Number.isFinite(parsed)) return parsed - TOKEN_EXPIRY_SAFETY_MS;
  }

  const expiresInSeconds = Number(payload.expires_in);
  if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    return fallbackNow + expiresInSeconds * 1000 - TOKEN_EXPIRY_SAFETY_MS;
  }

  return fallbackNow + 23 * 60 * 60 * 1000;
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

  tokenCache.pendingTokenRequest = (async () => {
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
