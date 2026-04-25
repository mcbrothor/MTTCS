import { get, set } from 'idb-keyval';
import type { MacroTrend, ScannerResult, ScannerUniverse, ScannerUniverseResponse, StockMetric } from '@/types';
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
      results: snapshot.results.map((item: ScannerResult) => withRecommendation(item)),
    };
  } catch {
    return null;
  }
}

export async function writeScannerSnapshot(universeMeta: ScannerUniverseResponse, results: ScannerResult[], savedAt: string) {
  const snapshot: StoredScannerSnapshot = {
    savedAt,
    universeMeta,
    results: results.map((item) => withRecommendation(item)),
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
    latestScannedUniverse,
    lastSelectedUniverse,
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
    return withRecommendation({
      ...item,
      fundamentals: mergedFundamentals,
      rsRating: metric?.rs_rating ?? item.rsRating,
      externalRsRating: metric?.rs_rating ?? item.externalRsRating,
      rsSource: metric?.rs_rating !== null && metric?.rs_rating !== undefined ? 'DB_BATCH' : item.rsSource,
      rsRank: metric?.rs_rank ?? item.rsRank,
      rsUniverseSize: metric?.rs_universe_size ?? item.rsUniverseSize,
      rsPercentile: rsPercentile(metric?.rs_rank, metric?.rs_universe_size) ?? item.rsPercentile,
      ibdProxyScore: metric?.ibd_proxy_score ?? item.ibdProxyScore,
      weightedMomentumScore: metric?.ibd_proxy_score ?? item.weightedMomentumScore,
      mansfieldRsFlag: metric?.mansfield_rs_flag ?? item.mansfieldRsFlag,
      mansfieldRsScore: metric?.mansfield_rs_score ?? item.mansfieldRsScore,
      rsDataQuality: metric?.data_quality ?? item.rsDataQuality,
      macroActionLevel: macroTrend?.action_level ?? item.macroActionLevel,
    });
  });
}

export async function loadScannerMetrics(universe: ScannerUniverse, rows: ScannerResult[]) {
  const tickers = rows.map((item) => item.ticker).filter(Boolean);
  if (tickers.length === 0) return { results: rows.map(withRecommendation), macroTrend: null as MacroTrend | null };
  try {
    const query = new URLSearchParams({ universe, tickers: tickers.join(',') });
    const response = await fetch('/api/scanner/metrics?' + query.toString());
    if (!response.ok) throw new Error('metrics ' + response.status);
    const payload = await response.json() as ScannerMetricsResponse;
    return { results: mergeStandardMetrics(rows, payload.metrics, payload.macroTrend), macroTrend: payload.macroTrend };
  } catch {
    return {
      results: rows.map((item) => withRecommendation({
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
      })),
      macroTrend: null as MacroTrend | null,
    };
  }
}
