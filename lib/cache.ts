/**
 * 간단한 In-Memory TTL 캐시
 * - 동일 티커/파라미터에 대한 API 중복 호출을 방지합니다.
 * - Vercel Serverless에서는 콜드 스타트마다 초기화되므로
 *   영속적 캐시가 아닌 "같은 인스턴스 내 중복 방지" 수준입니다.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10분
const MAX_ENTRIES = 300;

const store = new Map<string, CacheEntry<unknown>>();

/** 캐시에서 값을 가져옵니다. 만료되었거나 없으면 null 반환. */
export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

/** 캐시에 값을 저장합니다. 최대 엔트리 수 초과 시 가장 오래된 것부터 제거. */
export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  // 오래된 만료 항목 정리
  if (store.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of store) {
      if (now > entry.expiresAt) store.delete(k);
    }
  }

  // 여전히 너무 많으면 가장 먼저 들어온 것 제거
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
