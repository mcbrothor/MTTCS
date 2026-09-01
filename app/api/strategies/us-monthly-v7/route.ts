import { apiError, apiSuccess } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { breadthUS, decideUsRegime, nasdaqDominance } from '@/lib/strategy/us-monthly-v7/engine';
import { loadUs52wDataset } from '@/lib/strategy/us-52w/service';
import { isStrategyDataUnavailableError, requireStrategyCoverage } from '@/lib/strategy/data-quality';
export const dynamic='force-dynamic';
export async function GET(req: Request){
  const s=await getRequestSession(req); if(!s) return apiError('Auth required','AUTH_REQUIRED',401);
  try {
    const { universeBars, spyBars, quality } = await loadUs52wDataset(400);
    requireStrategyCoverage(quality);
    const breadth = breadthUS(universeBars);
    const peak = Math.max(...spyBars.slice(-252).map((bar) => bar.close));
    const drawdownPct = peak > 0 ? (spyBars.at(-1)!.close / peak - 1) * 100 : 0;
    const dominance = universeBars.QQQ ? nasdaqDominance(universeBars.QQQ, spyBars) : false;
    return apiSuccess(
      { version:'us-monthly-v7', asOf: quality.asOf, quality, breadth, drawdownPct, regime: decideUsRegime(breadth, drawdownPct), nasdaqDominance: dominance },
      { source:'ETF universe Breadth 120MA + NASDAQ dominance', provider:'Yahoo', delay:'EOD', observedAt:quality.asOf, calculatedAt:new Date().toISOString(), modelVersion:'us-monthly-v7', warnings: quality.warnings.slice(0, 10) },
    );
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : 'US 월간 전략 계산 실패',
      isStrategyDataUnavailableError(e) ? 'STRATEGY_DATA_UNAVAILABLE' : 'US_MONTHLY_FAILED',
      isStrategyDataUnavailableError(e) ? 503 : 500,
    );
  }
}
