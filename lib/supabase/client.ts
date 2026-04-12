import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase 환경 변수가 설정되지 않았습니다.');
}

/**
 * 범용 Supabase 클라이언트
 * 인증이 필요 없는 공용 API 또는 프론트엔드/백엔드 기본 조회용으로 사용합니다.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
