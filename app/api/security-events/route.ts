import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { getDartRecentFilings } from '@/lib/finance/providers/dart-api';
import { getSecRecentFilings } from '@/lib/finance/providers/sec-edgar-api';
import { buildFreshnessMeta } from '@/lib/data/freshness';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request:Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
 const p=new URL(request.url).searchParams; const ticker=(p.get('ticker')||'').trim().toUpperCase(); const exchange=(p.get('exchange')||'NAS').toUpperCase();
 if(!ticker)return NextResponse.json({message:'ticker is required'},{status:400});
 const kr=exchange==='KOSPI'||exchange==='KOSDAQ';
 try{const data=kr?await getDartRecentFilings(ticker):await getSecRecentFilings(ticker); if(data.length){try{await getSupabaseAdmin().from('security_events').upsert(data,{onConflict:'source,external_id'});}catch{}}
  return NextResponse.json({data,meta:buildFreshnessMeta({source:kr?'OpenDART':'SEC EDGAR',provider:kr?'DART':'SEC',delay:'EOD',observedAt:new Date().toISOString(),warnings:[]})});
 }catch(error){return NextResponse.json({data:[],meta:buildFreshnessMeta({source:kr?'OpenDART':'SEC EDGAR',provider:kr?'DART':'SEC',delay:'UNKNOWN',warnings:[error instanceof Error?error.message:'이벤트 조회 실패'],isStale:true})});}
}
