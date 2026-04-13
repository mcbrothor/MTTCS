import { createClient } from '@supabase/supabase-js';

/**
 * 서버 전용 Supabase 클라이언트
 * - RLS를 우회하기 위해 service_role key를 사용합니다.
 * - Next.js API Route 같은 서버 코드에서만 사용하세요.
 * - SUPABASE_SERVICE_ROLE_KEY가 없으면 anon key로 폴백합니다.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// service_role key가 있으면 사용, 없으면 anon key로 폴백 (RLS 적용됨)
const key = serviceRoleKey || anonKey;

if (!url || !key) {
  console.warn('⚠️ Supabase 서버 환경 변수가 설정되지 않았습니다.');
}

if (!serviceRoleKey) {
  console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY가 없습니다. anon key로 폴백합니다. RLS가 적용됩니다.');
}

export const supabaseServer = createClient(url, key);
