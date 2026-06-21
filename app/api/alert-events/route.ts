import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';
export async function GET(){const s=await getServerSession();if(!s)return NextResponse.json({message:'로그인이 필요합니다.'},{status:401});const {data,error}=await getSupabaseAdmin().from('alert_events').select('*').eq('user_id',s.systemId).order('occurred_at',{ascending:false}).limit(100);return NextResponse.json(error?{message:error.message}:{data},{status:error?500:200});}
export async function PATCH(request:Request){const s=await getServerSession();if(!s)return NextResponse.json({message:'로그인이 필요합니다.'},{status:401});const b=await request.json();let q=getSupabaseAdmin().from('alert_events').update({read_at:new Date().toISOString()}).eq('user_id',s.systemId);q=b.all?q.is('read_at',null):q.eq('id',String(b.id||''));const {error}=await q;return NextResponse.json(error?{message:error.message}:{data:{ok:true}},{status:error?500:200});}
