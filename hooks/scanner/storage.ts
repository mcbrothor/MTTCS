import { get, set } from 'idb-keyval';
import type { MacroTrend, ScannerResult, ScannerUniverse, ScannerUniverseResponse, StockMetric } from '@/types';
import { applyScannerReviewPoolRankings } from '@/lib/scanner-recommendation';
import {
  LAST_UNIVERSE_STORAGE_KEY,
  LATEST_SCAN_UNIVERSE_STORAGE_KEY,
  SCANNER_STORAGE_PREFIX,
  type ScannerMetricsResponse,
  type StoredScannerSnapshot,
} from './constants';
import {
  readStoredUniverse,
  rsPercentile,
  scannerStorageKey,
  uniqueUniverses,
  withRecommendation,
} from './helpers';

export async function readScannerSnapshot(universe: ScannerUniverse): Promise<StoredScannerSnapshot | null> {
  try {
    const raw = await get(scannerStorageKey(universe, SCANNER_STORAGE_PREFIX));
    if (!raw) return null;

    const snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!snapshot.universeMeta || snapshot.universeMeta.universe !== universe || !Array.isArray(snapshot.results)) return null;
    return {
      ...snapshot,
      results: applyScannerReviewPoolRankings(snapshot.results.map((item: ScannerResult) => withRecommendation(item))),
    };
  } catch {
    return null;
  }
}

export async function writeScannerSnapshot(universeMeta: ScannerUniverseResponse, results: ScannerResult[], savedAt: string) {
  const snapshot: StoredScannerSnapshot = {
    savedAt,
    universeMeta,
    results: applyScannerReviewPoolRankings(results.map((item) => withRecommendation(item))),
  };
  await set(scannerStorageKey(universeMeta.universe, SCANNER_STORAGE_PREFIX), snapshot);
  window.localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, universeMeta.universe);
  window.localStorage.setItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY, universeMeta.universe);
  // 콘테스트 페이지는 localStorage에서 스냅샷을 읽으므로 동기화
  try {
    window.localStorage.setItem(
      `${SCANNER_STORAGE_PREFIX}${universeMeta.universe}`,
      JSON.stringify(snapshot)
    );
  } catch {
    // localStorage 용량 초과 시 무시
  }
}

export async function getInitialRestoredUniverse(): Promise<ScannerUniverse> {
  if (typeof window === 'undefined') return 'NASDAQ100';
  const latestScannedUniverse = readStoredUniverse(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
  const lastSelectedUniverse = readStoredUniverse(LAST_UNIVERSE_STORAGE_KEY);
  const candidates = uniqueUniverses([
    lastSelectedUniverse,   // 사용자가 마지막으로 선택한 유니버스를 최우선 복원
    latestScannedUniverse,  // 그 다음: 마지막으로 스캔 완료된 유니버스
    'NASDAQ100',
    'SP500',
    'KOSPI200',
    'KOSDAQ150',
  ]);

  for (const candidate of candidates) {
    const snap = await readScannerSnapshot(candidate);
    if (snap) return candidate;
  }
  return lastSelectedUniverse ?? latestScannedUniverse ?? 'NASDAQ100';
}

// DB rs_rating이 도착하면 SEPA criteria의 rs_rating 항목을 pass/fail로 재평가한다.
// 이 단계가 빠지면 sepaEvidence.criteria는 'info'로 고정되어 corePassed 집계에서 누락된다.
function rebuildSepaRsCriterion(item: ScannerResult, rsRating: number | null, dbAvailable: boolean): ScannerResult {
  const evidence = item.sepaEvidence;
  if (!evidence) return item;
  const criteria = evidence.criteria.map((c) => {
    if (c.id !== 'rs_rating') return c;
    if (rsRating === null) {
      return { ...c, status: 'info' as const, actual: '데이터 없음', threshold: '70점 이상 (DB/UNIVERSE 도착 시 평가)', isCore: false };
    }
    return {
      ...c,
      status: rsRating >= 70 ? ('pass' as const) : ('fail' as const),
      actual: `${rsRating}점 (${dbAvailable ? '유니버스 백분위 공식 RS' : '실시간 스캔 유니버스 백분위 RS'})`,
      threshold: '70점 이상 (유니버스 백분위)',
      description: 'Minervini Trend Template #8 — 유니버스 백분위 기반 RS Rating으로 평가됨.',
      isCore: true,
    };
  });
  const passed = criteria.filter((c) => c.status === 'pass').length;
  const failed = criteria.filter((c) => c.status === 'fail').length;
  const info = criteria.filter((c) => c.status === 'info').length;
  const corePassed = criteria.filter((c) => c.isCore && c.status === 'pass').length;
  const coreFailed = criteria.filter((c) => c.isCore && c.status === 'fail').length;
  const coreTotal = criteria.filter((c) => c.isCore).length;
  let status: 'pass' | 'fail' | 'warning' = 'pass';
  if (corePassed >= coreTotal) status = 'pass';
  else if (corePassed >= coreTotal - 1) status = 'warning';
  else status = 'fail';

  return {
    ...item,
    sepaEvidence: {
      ...evidence,
      criteria,
      status,
      summary: { passed, failed, info, total: criteria.length, corePassed, coreFailed, coreTotal },
      metrics: { ...evidence.metrics, rsRating, rsSource: dbAvailable ? 'DB_BATCH' : evidence.metrics.rsSource },
    },
    sepaStatus: status,
    sepaPassed: passed,
    sepaFailed: failed,
  };
}

function mergeStandardMetrics(
  results: ScannerResult[],
  rows: { ticker: string; metric: StockMetric | null; sector?: string | null }[],
  macroTrend: MacroTrend | null
) {
  const byTicker = new Map(rows.map((row) => [row.ticker, row]));
  return results.map((item) => {
    const row = byTicker.get(item.ticker);
    const metric = row?.metric || null;
    const sector = row?.sector ?? null;
    const mergedFundamentals = sector
      ? { ...(item.fundamentals ?? { source: 'Scanner metrics', epsGrowthPct: null, revenueGrowthPct: null, roePct: null, debtToEquityPct: null }), sector }
      : item.fundamentals;
    const dbRsAvailable = metric?.rs_rating !== null && metric?.rs_rating !== undefined;
    const merged: ScannerResult = {
      ...item,
      fundamentals: mergedFundamentals,
      rsRating: metric?.rs_rating ?? item.rsRating,
      externalRsRating: metric?.rs_rating ?? item.externalRsRating,
      rsSource: dbRsAvailable ? 'DB_BATCH' : item.rsSource,
      rsRank: metric?.rs_rank ?? item.rsRank,
      rsUniverseSize: metric?.rs_universe_size ?? item.rsUniverseSize,
      rsPercentile: rsPercentile(metric?.rs_rank, metric?.rs_universe_size) ?? item.rsPercentile,
      ibdProxyScore: metric?.ibd_proxy_score ?? item.ibdProxyScore,
      weightedMomentumScore: metric?.ibd_proxy_score ?? item.weightedMomentumScore,
      mansfieldRsFlag: metric?.mansfield_rs_flag ?? item.mansfieldRsFlag,
      mansfieldRsScore: metric?.mansfield_rs_score ?? item.mansfieldRsScore,
      rsDataQuality: metric?.data_quality ?? item.rsDataQuality,
      macroActionLevel: macroTrend?.action_level ?? item.macroActionLevel,
    };
    const rebuilt = dbRsAvailable
      ? rebuildSepaRsCriterion(merged, metric?.rs_rating ?? null, true)
      : merged;
    return withRecommendation(rebuilt);
  });
}

async function refreshMissingUniverseMarketCaps(universe: ScannerUniverse, rows: ScannerResult[]) {
  if (!rows.some((item) => typeof item.marketCap !== 'number' || !Number.isFinite(item.marketCap))) {
    return rows;
  }

  try {
    const response = await fetch(`/api/scanner/universe?universe=${universe}`);
    if (!response.ok) return rows;
    const payload = await response.json() as ScannerUniverseResponse;
    const byTicker = new Map(payload.items.map((item) => [item.ticker, item]));
    return rows.map((item) => {
      const meta = byTicker.get(item.ticker);
      if (!meta) return item;
      return {
        ...item,
        marketCap: typeof meta.marketCap === 'number' && Number.isFinite(meta.marketCap) ? meta.marketCap : item.marketCap,
        currentPrice: item.currentPrice ?? meta.currentPrice,
        priceAsOf: item.priceAsOf ?? meta.priceAsOf,
        priceSource: item.priceSource === 'Wikipedia Nasdaq-100 list' ? meta.priceSource : item.priceSource,
      };
    });
  } catch {
    return rows;
  }
}

export async function loadScannerMetrics(universe: ScannerUniverse, rows: ScannerResult[]) {
  const rowsWithMarketCaps = await refreshMissingUniverseMarketCaps(universe, rows);
  const tickers = rowsWithMarketCaps.map((item) => item.ticker).filter(Boolean);
  try {
    const query = new URLSearchParams({ universe, tickers: tickers.join(',') });
    const response = await fetch('/api/scanner/metrics?' + query.toString());
    if (!response.ok) throw new Error('metrics ' + response.status);
    const payload = await response.json() as ScannerMetricsResponse;
    return { results: mergeStandardMetrics(rowsWithMarketCaps, payload.metrics, payload.macroTrend), macroTrend: payload.macroTrend };
  } catch {
    return {
      results: applyScannerReviewPoolRankings(rowsWithMarketCaps.map((item) => withRecommendation({
        ...item,
        rsRating: null,
        internalRsRating: null,
        rsRank: null,
        rsUniverseSize: null,
        rsPercentile: null,
        ibdProxyScore: null,
        weightedMomentumScore: null,
        mansfieldRsFlag: null,
        mansfieldRsScore: null,
        rsDataQuality: 'NA',
        macroActionLevel: null,
      }))),
      macroTrend: null as MacroTrend | null,
    };
  }
}
