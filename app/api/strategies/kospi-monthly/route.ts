import { apiError, apiSuccess } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { decideRegime } from '@/lib/strategy/kospi-monthly/engine';
export const dynamic='force-dynamic';
export async function GET(req: Request){
  const s=await getRequestSession(req); if(!s) return apiError('Auth required','AUTH_REQUIRED',401);
  try{
    // placeholder: 실제는 KIS 업종지수 로드 후 breadth 계산
    return apiSuccess({ version:'kospi-monthly-v2.3', breadth: 0, regime: decideRegime(55, -5, 0.03) }, { source:'Breadth 120MA', provider:'KIS', delay:'EOD', observedAt:new Date().toISOString().slice(0,10), calculatedAt:new Date().toISOString(), modelVersion:'kospi-monthly-v2.3' });
  }catch(e){ return apiError((e as Error).message,'KOSPI_MONTHLY_FAILED',500); }
}
