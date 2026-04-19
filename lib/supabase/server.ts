import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================
// Supabase 서버 클라이언트 (API Route 전용)
// =============================================
//
// [보안 설계 원칙]
// - Service Role Key: RLS(Row Level Security)를 우회하는 "마스터 키"
//   → DB의 모든 테이블을 제한 없이 읽고 쓸 수 있으므로 절대 클라이언트에 노출 금지
//   → 서버 API Route에서만 사용 (배치 처리, 어드민 작업 등)
// - Anon Key: RLS 정책이 적용되는 "일반 키"
//   → 클라이언트에서도 안전하게 사용 가능 (NEXT_PUBLIC_ 접두어)
//
// [변경 이력]
// 이전에는 Service Role Key가 없으면 자동으로 Anon Key로 fallback되어,
// RLS 우회가 의도와 달리 적용되지 않는 "조용한 실패"가 발생할 수 있었습니다.
// 이제는 supabaseAdmin(RLS 우회)과 supabaseServer(RLS 적용)로 명확히 분리합니다.

const isNextProductionBuild = process.env.NEXT_PHASE === 'phase-production-build';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 빌드 시점에는 환경변수 경고만 출력 (런타임에서는 실제 키 검증)
if (!isNextProductionBuild) {
  if (!url || !anonKey) {
    console.warn(
      '[MTN] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY가 설정되지 않았습니다. Supabase 연동이 불가합니다.'
    );
  }
  if (!serviceRoleKey) {
    console.warn(
      '[MTN] SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. ' +
      'Anon Key fallback으로 동작하며, RLS 우회가 필요한 작업은 실패할 수 있습니다.'
    );
  }
}

const authOpts = { persistSession: false, autoRefreshToken: false } as const;

/**
 * supabaseAdmin: Service Role Key 기반 (RLS 우회).
 * Service Role Key가 없으면 null.
 */
export const supabaseAdmin: SupabaseClient | null =
  url && serviceRoleKey
    ? createClient(url, serviceRoleKey, { auth: authOpts })
    : null;

/**
 * supabaseServer: 서버 API Route에서 사용하는 기본 클라이언트.
 *
 * 우선순위:
 * 1. Service Role Key가 있으면 → RLS 우회 (기존 동작과 동일)
 * 2. Service Role Key가 없으면 → Anon Key fallback (RLS 적용)
 *
 * [하위호환 유지]: 기존 코드 15곳에서 `supabaseServer`를 import하므로,
 * null이 되지 않도록 anon key fallback을 유지합니다.
 * 향후 각 호출부를 supabaseAdmin / supabaseAnon으로 개별 이관할 예정입니다.
 */
const key = serviceRoleKey || anonKey;

export const supabaseServer: SupabaseClient = createClient(
  url || 'http://127.0.0.1:54321',
  key || 'local-build-placeholder-key',
  { auth: authOpts }
);

/**
 * supabaseServer가 실제로 Service Role을 사용 중인지 프로그래밍적으로 확인.
 * RLS 우회 여부를 런타임에서 판단할 때 사용합니다.
 */
export const isServiceRoleActive = Boolean(serviceRoleKey);

/**
 * Service Role 클라이언트를 명시적으로 가져오는 헬퍼.
 * 없으면 에러를 던져 "조용한 실패"를 방지합니다.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new Error(
      '[MTN] Supabase Admin(Service Role) 클라이언트를 생성할 수 없습니다. ' +
      'SUPABASE_SERVICE_ROLE_KEY 환경변수를 확인하세요.'
    );
  }
  return supabaseAdmin;
}
