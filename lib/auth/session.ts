import { cookies } from 'next/headers';

export const AUTH_COOKIE_NAME = 'mtn_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

interface SessionPayload {
  sub: string;
  exp: number;
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getAuthSecret() {
  return process.env.MTN_AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function getSessionMaxAgeSeconds() {
  return SESSION_TTL_SECONDS;
}

export function isAuthEnabled() {
  return process.env.MTN_AUTH_ENABLED?.toLowerCase() !== 'false';
}

export async function createSessionToken(username: string) {
  const secret = getAuthSecret();
  if (!secret) throw new Error('MTN_AUTH_SECRET is not configured.');

  const payload: SessionPayload = {
    sub: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(body, secret);
  return `${body}.${signature}`;
}

export async function verifySessionToken(token?: string | null) {
  const secret = getAuthSecret();
  if (!secret || !token) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = await sign(body, secret);
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * 시스템 관리자 고정 ID (Supabase Auth 사용 안 함에 따른 고정 식별자)
 */
export const SYSTEM_ADMIN_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Next.js 서버 사이드(API, Server Action) 전용 세션 검증 헬퍼
 */
export async function getServerSession() {
  if (!isAuthEnabled()) {
    return { sub: 'admin', systemId: SYSTEM_ADMIN_ID };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);

  if (!payload) return null;
  
  return {
    ...payload,
    systemId: SYSTEM_ADMIN_ID
  };
}
