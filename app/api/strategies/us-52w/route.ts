import { apiError, apiSuccess } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { loadUs52wDataset } from '@/lib/strategy/us-52w/service';
import { screenCandidates, generateSignal } from '@/lib/strategy/us-52w/engine';
import { US52W_MODEL_VERSION } from '@/lib/strategy/us-52w/policy';
export const dynamic='force-dynamic';
export async function GET(req: Request){
  const s=await getRequestSession(req); if(!s) return apiError('Auth required','AUTH_REQUIRED',401);
  try{
    const { universeBars, spyBars } = await loadUs52wDataset(400);
    const asOf=new Date().toISOString().slice(0,10);
    const cands=screenCandidates(universeBars, spyBars, asOf);
    const sig=generateSignal([], cands, universeBars, asOf);
    return apiSuccess({ modelVersion:US52W_MODEL_VERSION, asOf, candidates:cands, signal:sig }, { source:'US 52w RS Top20∩52w', provider:'Yahoo', delay:'EOD', observedAt:asOf, calculatedAt:new Date().toISOString(), modelVersion:US52W_MODEL_VERSION });
  }catch(e){ return apiError((e as Error).message,'US52W_FAILED',500); }
}
