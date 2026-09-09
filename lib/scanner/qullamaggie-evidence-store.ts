import type { SupabaseClient } from '@supabase/supabase-js';
import type { SetupEvidenceSnapshot } from '@/lib/finance/engines/qullamaggie-evidence';
import { getSupabaseAdmin } from '@/lib/supabase/server';

const TABLE = 'qullamaggie_evidence_snapshots';
const MAX_CACHE_SIZE = 100;
const snapshotCache = new Map<string, SetupEvidenceSnapshot>();

function cacheSnapshot(snapshot: SetupEvidenceSnapshot) {
  snapshotCache.delete(snapshot.snapshotId);
  snapshotCache.set(snapshot.snapshotId, snapshot);
  if (snapshotCache.size <= MAX_CACHE_SIZE) return;
  const oldestKey = snapshotCache.keys().next().value;
  if (oldestKey) snapshotCache.delete(oldestKey);
}

/** 테스트와 동일 프로세스 내 재조회 최적화를 위한 bounded cache. */
export function cacheQullamaggieEvidenceSnapshot(snapshot: SetupEvidenceSnapshot): void {
  cacheSnapshot(snapshot);
}

/**
 * 동일 snapshot_id는 최초 payload를 보존한다. 충돌은 같은 봉 hash의 재스캔으로
 * 간주하며 기존 행을 갱신하지 않는다.
 */
export async function saveQullamaggieEvidenceSnapshot(
  snapshot: SetupEvidenceSnapshot,
  client?: SupabaseClient,
): Promise<void> {
  const db = client ?? getSupabaseAdmin();
  const { error } = await db.from(TABLE).insert({
    snapshot_id: snapshot.snapshotId,
    ticker: snapshot.symbol.ticker,
    exchange: snapshot.symbol.exchange,
    as_of_bar_date: snapshot.provenance.asOfBarDate,
    bars_hash: snapshot.provenance.barsHash,
    engine_version: snapshot.provenance.engineVersion,
    schema_version: snapshot.schemaVersion,
    payload: snapshot,
  });

  if (error && error.code !== '23505') {
    throw new Error(`쿨라매기 증거 스냅샷 저장 실패: ${error.code || error.message}`);
  }
  cacheSnapshot(snapshot);
}

export async function getQullamaggieEvidenceSnapshot(
  snapshotId: string,
  client?: SupabaseClient,
): Promise<SetupEvidenceSnapshot | null> {
  const cached = snapshotCache.get(snapshotId);
  if (cached) return cached;

  const db = client ?? getSupabaseAdmin();
  const { data, error } = await db
    .from(TABLE)
    .select('payload')
    .eq('snapshot_id', snapshotId)
    .maybeSingle();

  if (error) {
    throw new Error(`쿨라매기 증거 스냅샷 조회 실패: ${error.code || error.message}`);
  }
  if (!data?.payload) return null;

  const snapshot = data.payload as SetupEvidenceSnapshot;
  cacheSnapshot(snapshot);
  return snapshot;
}

export function clearQullamaggieEvidenceStore(): void {
  snapshotCache.clear();
}
