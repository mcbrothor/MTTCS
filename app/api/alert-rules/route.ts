import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';
const TYPES=['PIVOT_NEAR','STOP_NEAR','HIGH52_NEAR','BREAKOUT','PRICE_MOVE','FILING','EARNINGS','SCREEN_ENTER','SCREEN_EXIT'];
export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;const s=await getServerSession();if(!s)return NextResponse.json({message:'로그인이 필요합니다.'},{status:401});const {data,error}=await getSupabaseAdmin().from('alert_rules').select('*').eq('user_id',s.systemId).order('updated_at',{ascending:false});return NextResponse.json(error?{message:error.message}:{data},{status:error?500:200});}
export async function POST(request:Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;const s=await getServerSession();if(!s)return NextResponse.json({message:'로그인이 필요합니다.'},{status:401});const b=await request.json();if(!TYPES.includes(b.event_type))return NextResponse.json({message:'지원하지 않는 알림입니다.'},{status:400});const payload={user_id:s.systemId,name:String(b.name||`${b.scope_id} ${b.event_type}`).slice(0,120),scope:b.scope||'SYMBOL',scope_id:String(b.scope_id||'').toUpperCase(),event_type:b.event_type,params:b.params||{},channels:Array.isArray(b.channels)?b.channels:['IN_APP'],enabled:b.enabled!==false};const {data,error}=await getSupabaseAdmin().from('alert_rules').insert(payload).select().single();return NextResponse.json(error?{message:error.message}:{data},{status:error?500:201});}
export async function PATCH(request:Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;const s=await getServerSession();if(!s)return NextResponse.json({message:'로그인이 필요합니다.'},{status:401});const b=await request.json();const update:Record<string,unknown>={updated_at:new Date().toISOString()};for(const k of ['name','params','channels','enabled'])if(b[k]!==undefined)update[k]=b[k];const {data,error}=await getSupabaseAdmin().from('alert_rules').update(update).eq('id',String(b.id||'')).eq('user_id',s.systemId).select().single();return NextResponse.json(error?{message:error.message}:{data},{status:error?500:200});}
export async function DELETE(request:Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;const s=await getServerSession();if(!s)return NextResponse.json({message:'로그인이 필요합니다.'},{status:401});const id=new URL(request.url).searchParams.get('id')||'';const {error}=await getSupabaseAdmin().from('alert_rules').delete().eq('id',id).eq('user_id',s.systemId);return NextResponse.json(error?{message:error.message}:{data:{id}},{status:error?500:200});}
