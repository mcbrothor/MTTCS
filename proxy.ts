import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, isAuthEnabled } from '@/lib/auth/session';

// In-memory rate limiter (per Edge isolate)
const loginAttempts = new Map<string, { count: number; expiresAt: number }>();

function isPathOrChild(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isApiSessionBypassPath(pathname: string) {
  return (
    isPathOrChild(pathname, '/api/auth') ||
    isPathOrChild(pathname, '/api/cron') ||
    isPathOrChild(pathname, '/api/local-llm-proxy') ||
    isPathOrChild(pathname, '/api/toss-proxy') ||
    isPathOrChild(pathname, '/api/telegram-webhook') ||
    pathname === '/api/internal/kis-rate-limit' ||
    pathname === '/api/internal/operations-health' ||
    pathname === '/api/release'
  );
}

export async function proxy(request: NextRequest) {
  // If auth is disabled, allow all
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Rate Limiting for Login (BUG-014)
  if (pathname === '/api/auth/login' && request.method === 'POST' && process.env.MTN_TEST_ENVIRONMENT !== 'true') {
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

  // Protect API routes
  if (
    pathname.startsWith('/api/') &&
    !isApiSessionBypassPath(pathname)
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

  // Protect frontend pages
  const isPublicPage = pathname === '/login' || pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname.startsWith('/api/');
  
  if (!isPublicPage) {
    const token = request.cookies.get('mtn_session')?.value;
    const session = await verifySessionToken(token);

    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
