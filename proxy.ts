import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, isAuthEnabled } from '@/lib/auth/session';

// In-memory rate limiter (per Edge isolate)
const loginAttempts = new Map<string, { count: number; expiresAt: number }>();

export async function proxy(request: NextRequest) {
  // If auth is disabled, allow all
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Rate Limiting for Login (BUG-014)
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxAttempts = 5;

    const record = loginAttempts.get(ip);
    if (record && now < record.expiresAt) {
      if (record.count >= maxAttempts) {
        return NextResponse.json({ error: 'Too many login attempts. Please try again later.' }, { status: 429 });
      }
      record.count += 1;
    } else {
      loginAttempts.set(ip, { count: 1, expiresAt: now + windowMs });
    }
  }

  // Protect all API routes except auth, cron, and telegram-webhook (self-validates via X-Telegram-Bot-Api-Secret-Token)
  if (
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/cron/') &&
    !pathname.startsWith('/api/telegram-webhook')
  ) {
    const token = request.cookies.get('mtn_session')?.value;
    const session = await verifySessionToken(token);

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
  ]
};
