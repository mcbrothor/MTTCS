import axios from 'axios';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;
let pendingTokenRequest: Promise<string> | null = null;

export async function getKisToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  if (pendingTokenRequest) {
    return pendingTokenRequest;
  }

  const KIS_APP_KEY = kisAppKey();
  const KIS_APP_SECRET = kisAppSecret();
  const KIS_BASE_URL = kisBaseUrl();

  pendingTokenRequest = (async () => {
    const response = await axios.post(`${KIS_BASE_URL}/oauth2/tokenP`, {
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    });

    cachedToken = response.data.access_token;
    // 토큰의 유효기간은 24시간이나 안전하게 23시간으로 설정
    tokenExpiresAt = now + 23 * 60 * 60 * 1000;
    
    return cachedToken as string;
  })();

  try {
    return await pendingTokenRequest;
  } catch (error) {
    console.error('Failed to get KIS Token:', error);
    throw new Error('KIS API 인증 실패');
  } finally {
    pendingTokenRequest = null;
  }
}
