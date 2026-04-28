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

/** 캐시에서 값을 가져옵니다. 만료되었거나 없으면 null 반환. LRU: 히트 시 최신으로 이동. */
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

/** 캐시에 값을 저장합니다. 최대 엔트리 수 초과 시 LRU(가장 오래 미사용) 항목 제거. */
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
