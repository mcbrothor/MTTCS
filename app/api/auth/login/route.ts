import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, createSessionToken, getSessionMaxAgeSeconds, isAuthEnabled } from '@/lib/auth/session';
import { apiError } from '@/lib/api/response';

function credentialsConfigured() {
  return Boolean(process.env.MTN_ADMIN_USERNAME && process.env.MTN_ADMIN_PASSWORD);
}

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, authEnabled: false });
  }

  if (!credentialsConfigured()) {
    return apiError('Login credentials are not configured.', 'AUTH_NOT_CONFIGURED', 500);
  }

  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  const username = body?.username?.trim() || '';
  const password = body?.password || '';

  if (username !== process.env.MTN_ADMIN_USERNAME || password !== process.env.MTN_ADMIN_PASSWORD) {
    return apiError('아이디 또는 비밀번호가 올바르지 않습니다.', 'AUTH_INVALID', 401);
  }

  const token = await createSessionToken(username);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: getSessionMaxAgeSeconds(),
  });
  return response;
}
