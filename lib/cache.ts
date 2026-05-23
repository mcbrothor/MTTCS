/**
 * 2-Tier TTL 캐시 시스템
 *
 * L1: In-Memory LRU (기존) — 같은 Serverless 인스턴스 내 중복 방지
 * L2: Supabase `api_cache` 테이블 — 콜드 스타트 간에도 캐시 유지
 *
 * 읽기: L1 히트 → 반환 / L1 미스 → L2 조회 → L1에 승격 후 반환
 * 쓰기: L1 + L2 동시 저장 (L2 실패 시 무시)
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10분
const MAX_ENTRIES = 300;

const store = new Map<string, CacheEntry<unknown>>();

/** L1: 캐시에서 값을 가져옵니다. 만료되었거나 없으면 null 반환. LRU: 히트 시 최신으로 이동. */
export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }

  // LRU: Map 삽입 순서를 이용해 가장 최근 접근 항목을 끝으로 이동
  store.delete(key);
  store.set(key, entry);

  return entry.value;
}

/** L1: 캐시에 값을 저장합니다. 최대 엔트리 수 초과 시 LRU(가장 오래 미사용) 항목 제거. */
export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  // 같은 키면 삭제 후 재삽입으로 LRU 순서 갱신
  if (store.has(key)) store.delete(key);

  // 만료된 항목 정리 (캐시가 꽉 찬 경우에만)
  if (store.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of store) {
      if (now > entry.expiresAt) store.delete(k);
      if (store.size < MAX_ENTRIES) break;
    }
  }

  // 여전히 꽉 차 있으면 LRU(Map의 첫 번째 = 가장 오래 미사용) 제거
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }

  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** 캐시 키를 생성합니다. */
export function cacheKey(...parts: (string | number)[]): string {
  return parts.map(String).join(':');
}

// ─── L2: Supabase 영속 캐시 ─────────────────────────────────────────
// 테이블 스키마: api_cache (cache_key TEXT PK, value JSONB, expires_at TIMESTAMPTZ)
// L2 실패 시 L1만 사용되므로 안전합니다. 테이블이 없어도 에러 없이 동작합니다.

let _supabaseImported: typeof import('@/lib/supabase/server') | null = null;

async function getSupabase() {
  if (_supabaseImported) return _supabaseImported;
  try {
    _supabaseImported = await import('@/lib/supabase/server');
    return _supabaseImported;
  } catch {
    return null;
  }
}

/**
 * L2: Supabase에서 캐시 값을 가져옵니다.
 * 테이블이 없거나 DB 연결 실패 시 null 반환 (non-throwing).
 */
export async function persistentCacheGet<T>(key: string): Promise<T | null> {
  try {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.supabaseAdmin
      .from('api_cache')
      .select('value, expires_at')
      .eq('cache_key', key)
      .single();
    if (error || !data) return null;
    // 만료 확인
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.value as T;
  } catch {
    return null;
  }
}

/**
 * L2: Supabase에 캐시 값을 저장합니다.
 * 테이블이 없거나 DB 연결 실패 시 무시 (non-throwing).
 */
export async function persistentCacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  try {
    const sb = await getSupabase();
    if (!sb) return;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await sb.supabaseAdmin
      .from('api_cache')
      .upsert(
        { cache_key: key, value: value as unknown, expires_at: expiresAt },
        { onConflict: 'cache_key' }
      );
  } catch {
    // L2 실패는 무시 — L1만으로도 충분히 동작합니다.
  }
}

// ─── 2-Tier 통합 인터페이스 ──────────────────────────────────────────

/**
 * L1(메모리) → L2(DB) 순으로 캐시를 조회합니다.
 * L2에서 히트하면 L1에 승격(promote)하여 이후 조회를 가속합니다.
 */
export async function tieredCacheGet<T>(key: string, l1TtlMs: number = DEFAULT_TTL_MS): Promise<T | null> {
  // L1 먼저 확인
  const l1 = cacheGet<T>(key);
  if (l1 !== null) return l1;

  // L2 확인
  const l2 = await persistentCacheGet<T>(key);
  if (l2 !== null) {
    // L1에 승격
    cacheSet(key, l2, l1TtlMs);
    return l2;
  }

  return null;
}

/**
 * L1(메모리) + L2(DB) 양쪽에 동시 저장합니다.
 * L2 저장은 비동기로 fire-and-forget 처리하여 응답 지연을 방지합니다.
 */
export function tieredCacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  cacheSet(key, value, ttlMs);
  // L2는 fire-and-forget (응답 시간에 영향 없음)
  persistentCacheSet(key, value, ttlMs).catch(() => {});
}

