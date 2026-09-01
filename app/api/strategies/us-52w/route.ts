import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { loadUs52wDataset } from '@/lib/strategy/us-52w/service';
import { screenCandidates, generateSignal } from '@/lib/strategy/us-52w/engine';
import { US52W_MODEL_VERSION, US52W_UNIVERSE_DEDUPED } from '@/lib/strategy/us-52w/policy';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { loadStrategyHoldings } from '@/lib/strategy/holdings';
import { isStrategyDataUnavailableError, requireStrategyCoverage } from '@/lib/strategy/data-quality';
export const dynamic='force-dynamic';
export async function GET(req: Request){
  const s=await getRequestSession(req); if(!s) return apiError('Auth required','AUTH_REQUIRED',401);
  try{
    const [{ universeBars, spyBars, quality }, holdings] = await Promise.all([
      loadUs52wDataset(400),
      loadStrategyHoldings({
        client: getSupabaseAdmin(),
        ownerId: s.systemId,
        universe: US52W_UNIVERSE_DEDUPED.map((item) => item.ticker),
      }),
    ]);
    requireStrategyCoverage(quality);
    const asOf=quality.asOf;
    const cands=screenCandidates(universeBars, spyBars, asOf);
    const sig=generateSignal(holdings, cands, universeBars, asOf);
    return apiSuccess(
      { modelVersion:US52W_MODEL_VERSION, asOf, quality, holdings, candidates:cands, signal:sig },
      { source:'US 52w RS Top20∩52w', provider:'Yahoo', delay:'EOD', observedAt:asOf, calculatedAt:new Date().toISOString(), modelVersion:US52W_MODEL_VERSION, warnings: quality.warnings.slice(0, 10) },
    );
  }catch(e){
    return apiError(
      getErrorMessage(e, 'US 52주 전략 계산 실패'),
      isStrategyDataUnavailableError(e) ? 'STRATEGY_DATA_UNAVAILABLE' : 'US52W_FAILED',
      isStrategyDataUnavailableError(e) ? 503 : 500,
    );
  }
}
