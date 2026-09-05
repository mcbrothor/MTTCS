import { apiError, apiSuccess } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/auth/cron';
import { koreanDate } from '@/lib/closing-bet/data';
import { monitorClosingBet, prepareClosingBet, reviewClosingBet, runClosingBet } from '@/lib/closing-bet/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  const params = new URL(request.url).searchParams;
  const market = params.get('market');
  const phase = params.get('phase');
  if ((market !== 'KOSPI200' && market !== 'KOSDAQ150') || !['prepare', 'watch', 'final', 'monitor', 'review'].includes(phase || '')) return apiError('잘못된 시장 또는 실행 단계입니다.', 'INVALID_REQUEST', 400);
  const dryRun = params.get('dryRun') !== 'false' || process.env.DRY_RUN === 'true';
  try {
    const result = phase === 'prepare' ? await prepareClosingBet(market, dryRun)
      : phase === 'monitor' ? await monitorClosingBet(market, dryRun)
      : phase === 'review' ? await reviewClosingBet(market, dryRun)
      : await runClosingBet({ market, date: koreanDate(), mode: 'LIVE', phase: phase === 'final' ? 'FINAL' : 'WATCH', dryRun, send: phase === 'final' });
    return apiSuccess(result, { source: 'MTN 종가베팅', provider: 'KIS' });
  } catch (error) {
    console.error('[Closing bet cron]', error instanceof Error ? error.message : 'Execution failed');
    return apiError('종가베팅 실행 실패. 운영 로그를 확인하세요.', 'CLOSING_BET_FAILED', 503);
  }
}
