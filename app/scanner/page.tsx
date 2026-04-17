'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Play, ScanSearch, Square, Star, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MarketBanner from '@/components/ui/MarketBanner';
import RiskModal from '@/components/ui/RiskModal';
import VcpDrilldownModal from '@/components/scanner/VcpDrilldownModal';
import { useMarket } from '@/contexts/MarketContext';
import type {
  AssessmentStatus,
  MarketAnalysisResponse,
  ScannerConstituent,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
  VcpAnalysis,
} from '@/types';

const TOTAL_EQUITY_FOR_SCAN = '50000';
const RISK_PERCENT_FOR_SCAN = '1';
const SCAN_CONCURRENCY = 4;
const KOSPI_SCAN_CONCURRENCY = 2;
const KOSDAQ_SCAN_CONCURRENCY = 2;
const SCANNER_STORAGE_PREFIX = 'mtn:scanner-snapshot:v2:';
const LAST_UNIVERSE_STORAGE_KEY = 'mtn:scanner:last-universe:v1';
const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';

interface StoredScannerSnapshot {
  savedAt: string;
  universeMeta: ScannerUniverseResponse;
  results: ScannerResult[];
}

const UNIVERSES: Record<ScannerUniverse, { label: string; description: string }> = {
  NASDAQ100: {
    label: 'NASDAQ 100',
    description: 'Nasdaq 공식 목록을 시가총액 기준으로 정렬하고 SEPA/VCP 후보를 빠르게 확인합니다.',
  },
  SP500: {
    label: 'S&P 500',
    description: 'S&P 500 대형주를 시가총액 기준으로 정렬하고 SEPA/VCP 후보를 확인합니다.',
  },
  KOSPI100: {
    label: 'KOSPI 100',
    description: 'KRX 공식 구성종목을 우선 확인하고, 세션 제한 시 KIS 시가총액 순위로 대체합니다.',
  },
  KOSDAQ100: {
    label: 'KOSDAQ 100',
    description: 'KOSDAQ 100 후보군을 시가총액 기준으로 정렬하고 국내 성장주 패턴을 확인합니다.',
  },
};

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'sepa', label: 'SEPA 통과' },
  { key: 'strong', label: 'VCP Strong' },
  { key: 'forming', label: 'Forming 이상' },
  { key: 'nearPivot', label: '피벗 3% 이내' },
  { key: 'volume', label: '거래량 확인' },
  { key: 'error', label: '오류' },
] as const;

const SORTS = [
  { key: 'marketCap', label: '시가총액순' },
  { key: 'vcpScore', label: 'VCP 점수순' },
  { key: 'pivot', label: '피벗 근접순' },
  { key: 'sepa', label: 'SEPA 우선' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];
type SortKey = (typeof SORTS)[number]['key'];

function scannerStorageKey(universe: ScannerUniverse) {
  return `${SCANNER_STORAGE_PREFIX}${universe}`;
}

function parseScannerUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI100' || value === 'KOSDAQ100') return value;
  return null;
}

function readScannerSnapshot(universe: ScannerUniverse): StoredScannerSnapshot | null {
  try {
    const raw = window.localStorage.getItem(scannerStorageKey(universe));
    if (!raw) return null;

    const snapshot = JSON.parse(raw) as StoredScannerSnapshot;
    if (!snapshot.universeMeta || snapshot.universeMeta.universe !== universe || !Array.isArray(snapshot.results)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function writeScannerSnapshot(universeMeta: ScannerUniverseResponse, results: ScannerResult[], savedAt: string) {
  const snapshot: StoredScannerSnapshot = {
    savedAt,
    universeMeta,
    results,
  };
  window.localStorage.setItem(scannerStorageKey(universeMeta.universe), JSON.stringify(snapshot));
  window.localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, universeMeta.universe);
  window.localStorage.setItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY, universeMeta.universe);
}

function readStoredUniverse(key: string) {
  return parseScannerUniverse(window.localStorage.getItem(key));
}

function uniqueUniverses(items: (ScannerUniverse | null)[]) {
  return items.filter((item, index): item is ScannerUniverse => Boolean(item) && items.indexOf(item) === index);
}

function getInitialRestoredUniverse() {
  if (typeof window === 'undefined') return 'NASDAQ100';
  const latestScannedUniverse = readStoredUniverse(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
  const lastSelectedUniverse = readStoredUniverse(LAST_UNIVERSE_STORAGE_KEY);
  const candidates = uniqueUniverses([
    latestScannedUniverse,
    lastSelectedUniverse,
    'NASDAQ100',
    'SP500',
    'KOSPI100',
    'KOSDAQ100',
  ]);

  const universeWithSnapshot = candidates.find((candidate) => readScannerSnapshot(candidate));
  return universeWithSnapshot ?? lastSelectedUniverse ?? latestScannedUniverse ?? 'NASDAQ100';
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function initialResult(item: ScannerConstituent): ScannerResult {
  return {
    ...item,
    status: 'queued',
    sepaStatus: null,
    sepaPassed: null,
    sepaFailed: null,
    vcpScore: null,
    vcpGrade: null,
    contractionScore: null,
    volumeDryUpScore: null,
    bbSqueezeScore: null,
    pocketPivotScore: null,
    vcpDetails: null,
    pivotPrice: null,
    recommendedEntry: null,
    distanceToPivotPct: null,
    breakoutVolumeStatus: null,
    analyzedAt: null,
    errorMessage: null,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

async function parseFetchError(response: Response) {
  try {
    const body = await response.json() as { message?: string; error?: string };
    return body.message || body.error || `요청 실패 (${response.status})`;
  } catch {
    return `요청 실패 (${response.status})`;
  }
}

async function scanConstituent(item: ScannerConstituent, signal: AbortSignal): Promise<ScannerResult> {
  const params = new URLSearchParams({
    ticker: item.ticker,
    exchange: item.exchange,
    totalEquity: TOTAL_EQUITY_FOR_SCAN,
    riskPercent: RISK_PERCENT_FOR_SCAN,
    includeFundamentals: 'false',
  });

  const response = await fetch(`/api/market-data?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(await parseFetchError(response));
  }

  const analysis = await response.json() as MarketAnalysisResponse;
  const latestBar = analysis.priceData.at(-1);
  const latestClose = latestBar?.close ?? null;
  const currentPrice = item.currentPrice ?? latestClose;
  const priceAsOf = item.currentPrice !== null ? item.priceAsOf : latestBar?.date ?? item.priceAsOf;
  const recommendedEntry = analysis.vcpAnalysis.recommendedEntry || null;
  const pivotPrice = analysis.vcpAnalysis.pivotPrice ?? recommendedEntry;
  const distanceToPivotPct =
    currentPrice && recommendedEntry
      ? round(((currentPrice - recommendedEntry) / recommendedEntry) * 100)
      : null;

  return {
    ...item,
    currentPrice,
    priceAsOf,
    status: 'done',
    sepaStatus: analysis.sepaEvidence.status,
    sepaPassed: analysis.sepaEvidence.summary.passed,
    sepaFailed: analysis.sepaEvidence.summary.failed,
    vcpScore: analysis.vcpAnalysis.score,
    vcpGrade: analysis.vcpAnalysis.grade,
    contractionScore: analysis.vcpAnalysis.contractionScore,
    volumeDryUpScore: analysis.vcpAnalysis.volumeDryUpScore,
    bbSqueezeScore: analysis.vcpAnalysis.bbSqueezeScore,
    pocketPivotScore: analysis.vcpAnalysis.pocketPivotScore,
    vcpDetails: analysis.vcpAnalysis.details,
    pivotPrice,
    distanceToPivotPct,
    recommendedEntry,
    analyzedAt: new Date().toISOString(),
    breakoutVolumeStatus: null,
    errorMessage: null,
  };
}

export default function ScannerPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [results, setResults] = useState<ScannerResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [busy, setBusy] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ScannerResult | null>(null);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const initial = getInitialRestoredUniverse();
    setUniverse(initial);
    const snapshot = readScannerSnapshot(initial);
    if (snapshot) {
      setResults(snapshot.results);
      setLastScannedAt(snapshot.savedAt);
    }
  }, []);

  const handleUniverseChange = (newUniverse: ScannerUniverse) => {
    if (isScanning) return;
    setUniverse(newUniverse);
    const snapshot = readScannerSnapshot(newUniverse);
    if (snapshot) {
      setResults(snapshot.results);
      setLastScannedAt(snapshot.savedAt);
    } else {
      setResults([]);
      setLastScannedAt(null);
    }
    localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, newUniverse);
  };

  const startScan = async () => {
    if (busy || isScanning) return;
    
    setBusy(true);
    setIsScanning(true);
    setProgress({ current: 0, total: 0 });
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const resp = await fetch(`/api/scanner-universe?universe=${universe}`, { signal: abortController.signal });
      if (!resp.ok) throw new Error(await parseFetchError(resp));
      
      const meta = await resp.json() as ScannerUniverseResponse;
      const initialResults = meta.constituents.map(initialResult);
      setResults(initialResults);
      setProgress({ current: 0, total: initialResults.length });

      const concurrency = universe.startsWith('KOS') ? KOSPI_SCAN_CONCURRENCY : SCAN_CONCURRENCY;
      const queue = [...initialResults];
      let completedCount = 0;

      const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0 && !abortController.signal.aborted) {
          const item = queue.shift();
          if (!item) break;

          try {
            const result = await scanConstituent(item, abortController.signal);
            setResults(prev => prev.map(r => r.ticker === result.ticker ? result : r));
          } catch (err) {
            if (abortController.signal.aborted) break;
            const errorMessage = getErrorMessage(err);
            setResults(prev => prev.map(r => r.ticker === item.ticker ? { ...item, status: 'error', errorMessage } : r));
          } finally {
            completedCount += 1;
            setProgress(prev => ({ ...prev, current: completedCount }));
          }
        }
      });

      await Promise.all(workers);

      if (!abortController.signal.aborted) {
        const now = new Date().toISOString();
        setLastScannedAt(now);
        setResults(prev => {
          writeScannerSnapshot(meta, prev, now);
          return prev;
        });
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        alert(`스캔 시작 실패: ${getErrorMessage(err)}`);
      }
    } finally {
      setIsScanning(false);
      setBusy(false);
      abortControllerRef.current = null;
    }
  };

  const stopScan = () => {
    abortControllerRef.current?.abort();
    setIsScanning(false);
    setBusy(false);
  };

  const filteredResults = useMemo(() => {
    let list = [...results];
    
    if (filterKey === 'sepa') list = list.filter(r => r.sepaStatus === 'PASS');
    else if (filterKey === 'strong') list = list.filter(r => r.vcpGrade === 'Strong');
    else if (filterKey === 'forming') list = list.filter(r => ['Strong', 'Forming'].includes(r.vcpGrade || ''));
    else if (filterKey === 'nearPivot') list = list.filter(r => r.distanceToPivotPct !== null && Math.abs(r.distanceToPivotPct) <= 3);
    else if (filterKey === 'error') list = list.filter(r => r.status === 'error');

    list.sort((a, b) => {
      if (sortKey === 'vcpScore') return (b.vcpScore || 0) - (a.vcpScore || 0);
      if (sortKey === 'pivot') {
        const da = a.distanceToPivotPct === null ? 999 : Math.abs(a.distanceToPivotPct);
        const db = b.distanceToPivotPct === null ? 999 : Math.abs(b.distanceToPivotPct);
        return da - db;
      }
      if (sortKey === 'sepa') {
        if (a.sepaStatus === 'PASS' && b.sepaStatus !== 'PASS') return -1;
        if (a.sepaStatus !== 'PASS' && b.sepaStatus === 'PASS') return 1;
        return (b.vcpScore || 0) - (a.vcpScore || 0);
      }
      return 0; // marketCap (original order)
    });

    return list;
  }, [results, filterKey, sortKey]);

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <MarketBanner />
      
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ScanSearch className="h-6 w-6 text-emerald-400" /> VCP 마스터 스캐너
          </h1>
          <p className="mt-1 text-sm text-slate-400">시장의 고베타 주도주 후보군을 SEPA/VCP 필터로 전수 조사합니다.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            value={universe}
            onChange={(e) => handleUniverseChange(e.target.value as ScannerUniverse)}
            disabled={isScanning}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          >
            {Object.entries(UNIVERSES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          
          {isScanning ? (
            <Button variant="danger" onClick={stopScan} icon={<Square className="h-4 w-4" />}>중단</Button>
          ) : (
            <Button onClick={startScan} icon={<Play className="h-4 w-4" />} disabled={busy}>스캔 시작</Button>
          )}
        </div>
      </div>

      {isScanning && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-emerald-400">스캔 진행 중...</span>
            <span className="text-sm text-slate-400">{progress.current} / {progress.total}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div 
              className="h-full bg-emerald-500 transition-all duration-300" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilterKey(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterKey === f.key ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">정렬:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-transparent text-xs text-slate-300 outline-none"
          >
            {SORTS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {lastScannedAt && (
            <span className="ml-4 text-xs text-slate-500">최근 스캔: {new Date(lastScannedAt).toLocaleString()}</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredResults.map(result => (
          <motion.div 
            key={result.ticker}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => result.status === 'done' && setSelectedResult(result)}
            className={`group relative cursor-pointer rounded-xl border p-4 transition-all ${
              result.sepaStatus === 'PASS' 
                ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50' 
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            } ${selectedTickers.has(result.ticker) ? 'ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : ''}`}
          >
            {/* Selection Checkbox */}
            {result.status === 'done' && (
              <div 
                className="absolute -left-2 -top-2 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTickers(prev => {
                    const next = new Set(prev);
                    if (next.has(result.ticker)) next.delete(result.ticker);
                    else if (next.size < 10) next.add(result.ticker);
                    else alert('최대 10개까지만 선택할 수 있습니다.');
                    return next;
                  });
                }}
              >
                <div className={`flex items-center gap-1.5 rounded-full border px-2 py-1 shadow-lg transition-all ${
                  selectedTickers.has(result.ticker) 
                    ? 'bg-emerald-500 border-emerald-400 text-white scale-110' 
                    : 'bg-slate-800 border-slate-700 text-slate-500 group-hover:scale-105'
                }`}>
                  <Trophy className={`h-3 w-3 ${selectedTickers.has(result.ticker) ? 'fill-current' : ''}`} />
                  <span className="text-[9px] font-bold uppercase tracking-tighter">Contest</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-white">{result.ticker}</h3>
                <p className="text-xs text-slate-500">{result.name}</p>
              </div>
              <div className="text-right">
                {result.status === 'done' ? (
                  <span className={`text-xs font-bold ${result.vcpGrade === 'Strong' ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {result.vcpGrade} ({result.vcpScore}점)
                  </span>
                ) : result.status === 'queued' ? (
                  <span className="text-xs text-slate-600 italic">대기 중</span>
                ) : result.status === 'error' ? (
                  <span className="text-xs text-red-400">오류</span>
                ) : (
                  <LoadingSpinner className="h-3 w-3" />
                )}
              </div>
            </div>
            
            {result.status === 'done' && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">SEPA</span>
                  <span className={result.sepaStatus === 'PASS' ? 'text-emerald-400' : 'text-slate-500 text-coral-red'}>
                    {result.sepaStatus === 'PASS' ? 'SUCCESS' : 'FAIL'}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">피벗 거리</span>
                  <span className={Math.abs(result.distanceToPivotPct || 0) <= 3 ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                    {result.distanceToPivotPct !== null ? `${result.distanceToPivotPct > 0 ? '+' : ''}${result.distanceToPivotPct}%` : '-'}
                  </span>
                </div>
              </div>
            )}
            
            {result.status === 'error' && (
              <p className="text-[10px] text-red-500/70 truncate">{result.errorMessage}</p>
            )}
          </motion.div>
        ))}
        
        {results.length === 0 && !isScanning && (
          <div className="col-span-full py-20 text-center">
            <ScanSearch className="mx-auto h-12 w-12 text-slate-700 mb-4" />
            <h3 className="text-slate-400 font-medium font-bold">스캔 결과가 없습니다.</h3>
            <p className="text-slate-600 text-sm mt-1">상단의 스캔 시작 버튼을 눌러 시장 조사를 시작하세요.</p>
          </div>
        )}
      </div>

      {/* Beauty Contest Floating Bar */}
      {selectedTickers.size > 0 && (
        <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-6 rounded-2xl border border-emerald-500/30 bg-slate-950/90 px-6 py-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-emerald-400">뷰티 콘테스트 후보</span>
            <span className="text-lg font-bold text-white">{selectedTickers.size} / 10 종목</span>
          </div>
          
          <div className="h-8 w-px bg-slate-800" />
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedTickers(new Set())}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              전체 해제
            </button>
            <Link 
              href="/beauty-contest"
              onClick={() => {
                const candidates = results.filter(r => selectedTickers.has(r.ticker));
                localStorage.setItem('mtn:contest-candidates', JSON.stringify(candidates));
              }}
            >
              <Button icon={<ScanSearch className="h-4 w-4" />} className="bg-emerald-600 hover:bg-emerald-500">
                프롬프트 생성하기
              </Button>
            </Link>
          </div>
        </div>
      )}

      <VcpDrilldownModal 
        result={selectedResult} 
        onClose={() => setSelectedResult(null)} 
      />
    </div>
  );
}
