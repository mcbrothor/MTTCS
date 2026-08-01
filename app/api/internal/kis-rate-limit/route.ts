import { NextRequest, NextResponse } from 'next/server';
import {
  reserveKisRequestSlot,
  type KisRateLimitScope,
} from '@/lib/finance/providers/kis-rate-limit';
import {
  kisCoordinatorSecret,
  validateKisCoordinatorRequest,
} from '@/lib/auth/kis-coordinator';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!kisCoordinatorSecret()) {
    return NextResponse.json({ error: 'KIS 공유 제한기가 설정되지 않았습니다.' }, { status: 503 });
  }
  if (!validateKisCoordinatorRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let scope: KisRateLimitScope;
  try {
    const body = await request.json() as { scope?: unknown };
    scope = body.scope as KisRateLimitScope;
  } catch {
    return NextResponse.json({ error: 'JSON 요청 본문이 필요합니다.' }, { status: 400 });
  }

  if (scope !== 'rest' && scope !== 'token') {
    return NextResponse.json({ error: 'scope는 rest 또는 token이어야 합니다.' }, { status: 400 });
  }

  const reservation = await reserveKisRequestSlot(scope, { distributedOnly: true });
  if (!reservation) {
    return NextResponse.json({ error: '공유 제한기를 사용할 수 없습니다.' }, { status: 503 });
  }

  return NextResponse.json({
    mode: reservation.mode,
    reserved_at: new Date(reservation.reservedAt).toISOString(),
    wait_ms: reservation.waitMs,
  });
}
