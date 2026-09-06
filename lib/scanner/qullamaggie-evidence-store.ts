import type { SetupEvidenceSnapshot } from '@/lib/finance/engines/qullamaggie-evidence';

// 서버 프로세스 메모리 기반 LRU 캐시 (최근 500개 스냅샷 보관)
const MAX_CACHE_SIZE = 500;
const snapshotStore = new Map<string, { snapshot: SetupEvidenceSnapshot; savedAt: number }>();

/**
 * 쿨라매기 증거 스냅샷을 저장합니다.
 */
export function saveQullamaggieEvidenceSnapshot(snapshot: SetupEvidenceSnapshot): void {
  if (snapshotStore.size >= MAX_CACHE_SIZE) {
    const oldestKey = snapshotStore.keys().next().value;
    if (oldestKey) {
      snapshotStore.delete(oldestKey);
    }
  }
  snapshotStore.set(snapshot.snapshotId, {
    snapshot,
    savedAt: Date.now(),
  });
}

/**
 * snapshotId로 스냅샷을 조회합니다.
 */
export function getQullamaggieEvidenceSnapshot(snapshotId: string): SetupEvidenceSnapshot | null {
  const entry = snapshotStore.get(snapshotId);
  if (!entry) return null;
  return entry.snapshot;
}

/**
 * 테스트용 저장소 초기화 함수
 */
export function clearQullamaggieEvidenceStore(): void {
  snapshotStore.clear();
}
