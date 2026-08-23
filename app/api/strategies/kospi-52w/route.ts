import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { loadKospi52wDataset } from '@/lib/strategy/kospi-52w/service';
import { screenCandidates, generateSignal } from '@/lib/strategy/kospi-52w/engine';
import { KOSPI52W_MODEL_VERSION, KOSPI52W_POLICY } from '@/lib/strategy/kospi-52w/policy';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  try {
    const { universeBars, kospiBars } = await loadKospi52wDataset(400);
    const asOf = new Date().toISOString().slice(0, 10);
    const candidates = screenCandidates(universeBars, kospiBars, asOf);
    // 이전 보유는 빈 것으로 시작 (스냅샷 연동 전)
    const holdings: string[] = [];
    const signal = generateSignal(holdings, candidates, universeBars, asOf);
    return apiSuccess(
      {
        modelVersion: KOSPI52W_MODEL_VERSION,
        policy: KOSPI52W_POLICY,
        asOf,
        universeCount: Object.keys(universeBars).length,
        candidates: candidates.map(c => ({ ticker: c.ticker, rs: c.rs, isNewHigh: c.isNewHigh, ma10: c.ma10 })),
        signal,
      },
      {
        source: 'KOSPI 52주 신고가 RS Top12∩52w 4×25% MA10',
        provider: 'KIS→Yahoo fallback',
        delay: 'EOD',
        observedAt: asOf,
        calculatedAt: new Date().toISOString(),
        modelVersion: KOSPI52W_MODEL_VERSION,
      },
    );
  } catch (error) {
    return apiError(getErrorMessage(error, 'KOSPI 52주 전략 계산 실패'), 'KOSPI52W_FAILED', 500);
  }
}
