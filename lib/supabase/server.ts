import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 서버 전용 가드: 브라우저 번들로 유입되면 즉시 실패시켜 Service Role Key
// 유출을 방지합니다. (`server-only` npm 패키지 대체 구현)
if (typeof window !== 'undefined') {
  throw new Error(
    '[MTN Security] lib/supabase/server.ts가 브라우저 번들에 포함되었습니다. ' +
    '이 모듈은 서버(API Route/Server Component) 전용입니다. ' +
    '클라이언트에서는 lib/supabase/client.ts를 사용하세요.'
  );
}

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
 * [수정됨] supabaseAdmin: Service Role Key 기반 (RLS 우회 - 서버/배치 전용).
 * 절대 클라이언트에 노출해서는 안 되며, 환경변수가 없으면 강제로 에러를 발생시킵니다.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  url || 'http://127.0.0.1:54321',
  serviceRoleKey || 'MISSING_SERVICE_ROLE_KEY',
  { auth: authOpts }
);

/**
 * [수정됨] supabaseAnon: RLS가 적용되는 일반 서버 클라이언트.
 * 사용자 컨텍스트를 유지해야 하거나 권한 우회가 필요 없을 때 사용합니다.
 *
 */
export const supabaseAnon: SupabaseClient = createClient(
  url || 'http://127.0.0.1:54321',
  anonKey || 'MISSING_ANON_KEY',
  { auth: authOpts }
);

/**
 * [사용 중단 경고] 하위 호환성을 위해 남겨둠. 가급적 용도에 맞게 supabaseAdmin 또는 supabaseAnon을 사용하세요.
 */
export const supabaseServer: SupabaseClient = new Proxy(
  serviceRoleKey ? supabaseAdmin : supabaseAnon,
  {
    get(target, prop) {
      // Anti-Gravity를 위한 기술 부채 추적용 경고 로그
      if (typeof prop === 'string' && prop !== 'then') {
        console.warn(
          `[MTN Tech Debt] supabaseServer 사용 감지됨. 향후 supabaseAnon 또는 getSupabaseAdmin()으로 교체하세요.`
        );
      }
      return Reflect.get(target, prop);
    }
  }
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
  if (!serviceRoleKey) {
    throw new Error(
      '[MTN] SUPABASE_SERVICE_ROLE_KEY가 누락되었습니다. 관리자 권한 작업을 수행할 수 없습니다.'
    );
  }
  return supabaseAdmin;
}
