import { apiError, apiSuccess } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { breadth, decideRegime } from '@/lib/strategy/kospi-monthly/engine';
import { calcRs } from '@/lib/strategy/kospi-52w/engine';
import { loadKospi52wDataset } from '@/lib/strategy/kospi-52w/service';
import { isStrategyDataUnavailableError, requireStrategyCoverage } from '@/lib/strategy/data-quality';
export const dynamic='force-dynamic';
export async function GET(req: Request){
  const s=await getRequestSession(req); if(!s) return apiError('Auth required','AUTH_REQUIRED',401);
  try{
    const { universeBars, kospiBars, quality } = await loadKospi52wDataset(400);
    requireStrategyCoverage(quality);
    const breadthValue = breadth(universeBars);
    const peak = Math.max(...kospiBars.slice(-252).map((bar) => bar.close));
    const drawdownPct = peak > 0 ? (kospiBars.at(-1)!.close / peak - 1) * 100 : 0;
    const relativeStrength = Object.values(universeBars)
      .map((bars) => calcRs(bars, kospiBars))
      .filter((value): value is number => value !== null);
    const rsAverage = relativeStrength.length > 0
      ? relativeStrength.reduce((sum, value) => sum + value, 0) / relativeStrength.length / 100
      : null;
    return apiSuccess(
      { version:'kospi-monthly-v2.3', asOf: quality.asOf, quality, breadth: breadthValue, drawdownPct, rsAverage, regime: decideRegime(breadthValue, drawdownPct, rsAverage) },
      { source:'ETF universe Breadth 120MA', provider:'KIS→Yahoo fallback', delay:'EOD', observedAt:quality.asOf, calculatedAt:new Date().toISOString(), modelVersion:'kospi-monthly-v2.3', warnings: quality.warnings.slice(0, 10) },
    );
  }catch(e){
    return apiError(
      e instanceof Error ? e.message : 'KOSPI 월간 전략 계산 실패',
      isStrategyDataUnavailableError(e) ? 'STRATEGY_DATA_UNAVAILABLE' : 'KOSPI_MONTHLY_FAILED',
      isStrategyDataUnavailableError(e) ? 503 : 500,
    );
  }
}
