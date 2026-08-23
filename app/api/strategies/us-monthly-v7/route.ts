import { apiError, apiSuccess } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
// import kept for future use
export const dynamic='force-dynamic';
export async function GET(req: Request){
  const s=await getRequestSession(req); if(!s) return apiError('Auth required','AUTH_REQUIRED',401);
  return apiSuccess({ version:'us-monthly-v7', note:'Breadth 30/40/60/80 + NASDAQ 독주' }, { source:'V7 Regime', provider:'Yahoo', delay:'EOD', observedAt:new Date().toISOString().slice(0,10), calculatedAt:new Date().toISOString(), modelVersion:'us-monthly-v7' });
}
