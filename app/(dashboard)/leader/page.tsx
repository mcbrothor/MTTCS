'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Square,
  Trophy,
  Send,
  Plus,
  Check,
  TrendingUp,
  Shield,
  BarChart3,
  DollarSign,
  Activity,
  Flame,
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ScannerTabNav from '@/components/scanner/ScannerTabNav';
import MarketBanner from '@/components/ui/MarketBanner';
import TradingViewWidget from '@/components/ui/TradingViewWidget';
import { useContestSelection } from '@/hooks/useContestSelection';
import {
  LEADER_LATEST_UNIVERSE_STORAGE_KEY,
} from '@/lib/contest-sources';
import { useIsMobile } from '@/lib/hooks/useViewport';
import type {
  LeaderGrade,
  LeaderScoreBreakdown,
  LeaderScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
} from '@/types';

// ── 상수 ──────────────────────────────────────────────────────────────────
const STORAGE_PREFIX = 'mtn:modern-leader-snapshot:v1:';
const BATCH_SIZE = 20;

type ViewMode = 'web' | 'app';
type FilterKey = 'all' | 'alpha' | 'emerging' | 'steady' | 'rs90' | 'r2_80' | 'heavy_vol';
type SortKey = 'leaderScore' | 'rs' | 'r2' | 'dollarVolume' | 'tii' | 'marketCap';

const UNIVERSES: Record<ScannerUniverse, { label: string; desc: string }> = {
  NASDAQ100: { label: 'NASDAQ 100', desc: 'Nasdaq 100에서 자금 쏠림과 강력한 추세를 장악한 현대적 주도주를 판별합니다.' },
  SP500: { label: 'S&P 500', desc: 'S&P 500 대형주 유니버스의 기관 쏠림 주도주를 가려냅니다.' },
  KOSPI200: { label: 'KOSPI 상위 200', desc: 'KOSPI 핵심 대형주(SK하이닉스 등) 및 자금 유입 대장주 스캔.' },
  KOSDAQ150: { label: 'KOSDAQ 상위 150', desc: 'KOSDAQ 기술/성장주 테마별 유동성 쏠림 대장주 스캔.' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'alpha', label: '🥇 Alpha' },
  { key: 'emerging', label: '🥈 Emerging' },
  { key: 'steady', label: '🔵 Steady' },
  { key: 'rs90', label: 'RS 90+' },
  { key: 'r2_80', label: '🎯 선형성 R² 80%+' },
  { key: 'heavy_vol', label: '💰 거래대금 상위 20%' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'leaderScore', label: 'Leader Score순' },
  { key: 'rs', label: '상대강도(RS)순' },
  { key: 'r2', label: '추세 선형성(R²)순' },
  { key: 'dollarVolume', label: '거래대금순' },
  { key: 'tii', label: '추세강도(TII)순' },
  { key: 'marketCap', label: '시가총액순' },
];

// ── 유틸 ──────────────────────────────────────────────────────────────────

function storageKey(universe: ScannerUniverse) {
  return `${STORAGE_PREFIX}${universe}`;
}

interface StoredSnapshot {
  savedAt: string;
  universe: ScannerUniverse;
  results: LeaderScannerResult[];
}

async function readSnapshot(universe: ScannerUniverse): Promise<StoredSnapshot | null> {
  try {
    const raw = await get(storageKey(universe));
    if (!raw) return null;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as StoredSnapshot;
  } catch {
    return null;
  }
}

async function writeSnapshot(snapshot: StoredSnapshot) {
  await set(storageKey(snapshot.universe), snapshot);
  window.localStorage.setItem(LEADER_LATEST_UNIVERSE_STORAGE_KEY, snapshot.universe);
}

function gradeLabel(grade: LeaderGrade) {
  if (grade === 'ALPHA') return { emoji: '🌟', label: 'Alpha Leader', color: 'emerald' };
  if (grade === 'EMERGING') return { emoji: '🔥', label: 'Emerging', color: 'amber' };
  if (grade === 'STEADY') return { emoji: '📈', label: 'Steady', color: 'blue' };
  return { emoji: '⚪', label: 'Laggard', color: 'slate' };
}

function gradeBadgeClass(grade: LeaderGrade) {
  const { color } = gradeLabel(grade);
  const map: Record<string, string> = {
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    blue: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
    slate: 'border-slate-700 bg-slate-900 text-slate-400',
  };
  return map[color] ?? map.slate;
}

function formatPrice(value: number | null, currency: 'USD' | 'KRW') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function formatMarketCap(value: number | null, currency?: string, ticker?: string) {
  if (!value) return '-';
  const isKorean = currency === 'KRW' || (ticker && /^\d{6}$/.test(ticker));
  if (isKorean) {
    const jo = value / 1e12;
    if (jo >= 1) return `₩${jo.toFixed(1)}조`;
    return `₩${Math.round(value / 1e8).toLocaleString('ko-KR')}억`;
  }
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}

function benchmarkTickerForUniverse(universe: ScannerUniverse) {
  if (universe === 'KOSPI200') return '^KS200';
  if (universe === 'KOSDAQ150') return '^KQ150';
  if (universe === 'NASDAQ100') return 'QQQ';
  return 'SPY';
}

// ── 현대적 5축 계량 미니 차트 ───────────────────────────────────────────────
function BreakdownBars({ breakdown }: { breakdown: LeaderScoreBreakdown }) {
  const axes = [
    { key: 'RS', value: breakdown.rsLeadership, color: 'bg-indigo-400', label: 'RS 상대 모멘텀' },
    { key: '🎯', value: breakdown.momentumConsistency, color: 'bg-emerald-400', label: '주가 선형 일관성' },
    { key: '💰', value: breakdown.liquidityCrowding, color: 'bg-rose-400', label: '자금 쏠림 점유율' },
    { key: '⚡', value: breakdown.trendIntensity, color: 'bg-sky-400', label: '이평선 추세 강도' },
    { key: '🏭', value: breakdown.sectorAlpha, color: 'bg-amber-400', label: '섹터 알파' },
  ];
  return (
    <div className="flex items-end gap-0.5 h-5">
      {axes.map((axis) => (
        <div key={axis.key} className="flex flex-col items-center gap-0.5 w-3" title={`${axis.label}: ${axis.value}점`}>
          <div className={`w-full rounded-t-sm ${axis.color}`} style={{ height: `${Math.max(2, (axis.value / 100) * 16)}px` }} />
        </div>
      ))}
    </div>
  );
}

// ── 요약 카드 ──────────────────────────────────────────────────────────────
function StatCard({ label, value, subtitle, icon: Icon, tone }: {
  label: string;
  value: React.ReactNode;
  subtitle: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  tone: string;
}) {
  return (
    <div className={`rounded-[20px] border px-4 py-4 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</p>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export default function LeaderScannerPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [results, setResults] = useState<LeaderScannerResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [scanStage, setScanStage] = useState('대기 중');
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('leaderScore');
  const [viewMode, setViewMode] = useState<ViewMode>('web');
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState<string | null>(null);
  const {
    selectedTickers,
    toggleSelection: baseToggleSelection,
    clearSelection: baseClearSelection,
    limitMessage,
  } = useContestSelection(universe, { source: 'leader' });

  const toggleSelection = (t: string) => baseToggleSelection(t, universe);
  const clearSelection = () => baseClearSelection(universe);
  const abortRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    (async () => {
      const snapshot = await readSnapshot(universe);
      if (snapshot) {
        setResults(snapshot.results);
        setLastScannedAt(snapshot.savedAt);
      }
    })();
  }, [universe]);

  const handleUniverseChange = async (u: ScannerUniverse) => {
    if (isScanning) return;
    setUniverse(u);
    const snapshot = await readSnapshot(u);
    if (snapshot) {
      setResults(snapshot.results);
      setLastScannedAt(snapshot.savedAt);
    } else {
      setResults([]);
      setLastScannedAt(null);
    }
  };

  // ── 스캔 ──────────────────────────────────────────────────────────────
  const startScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setProgress({ current: 0, total: 0 });
    setScanStage('유니버스 로딩 중');

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch(`/api/scanner/universe?universe=${universe}`, { signal: abort.signal });
      if (!resp.ok) throw new Error(`유니버스 로딩 실패 (${resp.status})`);
      const meta = await resp.json() as ScannerUniverseResponse;
      const items = meta.items;

      setProgress({ current: 0, total: items.length });
      setScanStage('상대모멘텀 · 선형성(R²) · 자금쏠림 · 추세강도(TII) 분석 중');

      let current: LeaderScannerResult[] = items.map((item) => ({
        ticker: item.ticker,
        exchange: item.exchange,
        name: item.name,
        market: universe.startsWith('KOS') ? 'KR' as const : 'US' as const,
        currentPrice: item.currentPrice,
        changePercent: null,
        marketCap: item.marketCap,
        currency: item.currency,
        leaderScore: 0,
        leaderGrade: 'LAGGARD' as const,
        breakdown: { rsLeadership: 0, momentumConsistency: 0, liquidityCrowding: 0, trendIntensity: 0, sectorAlpha: 0 },
        // 신형 현대 계량 데이터
        momentum12m1Pct: null,
        regressionR2: null,
        dollarVolume20d: null,
        dollarVolumeShare: null,
        trendIntensityIndex: null,
        // 구형 호환 데이터
        rsRating: null,
        mansfieldRsScore: null,
        mansfieldRsFlag: null,
        tennisBallCount: 0,
        tennisBallScore: 0,
        pocketPivotScore: null,
        volumeDryUpScore: null,
        sepaCorePassed: null,
        sepaCoreTotal: null,
        distanceFromHigh52WeekPct: null,
        sector: null,
        sectorReturn20d: null,
        sectorRank: null,
        status: 'queued' as const,
        analyzedAt: null,
        errorMessage: null,
        dataWarnings: [],
      }));
      setResults(current);

      const benchmarkTicker = benchmarkTickerForUniverse(universe);

      // 배치 수집 루프
      let completed = 0;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        if (abort.signal.aborted) break;
        const chunk = items.slice(i, i + BATCH_SIZE);

        current = current.map(r =>
          chunk.some(c => c.ticker === r.ticker) ? { ...r, status: 'running' as const } : r
        );
        setResults([...current]);

        try {
          const payload = {
            items: chunk.map(c => ({ ticker: c.ticker, exchange: c.exchange })),
            benchmarkTicker,
          };

          const response = await fetch('/api/scanner/leader', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abort.signal,
          });

          if (!response.ok) {
            const body = await response.json().catch(() => ({})) as { message?: string };
            throw new Error(body.message || `배치 분석 실패 (${response.status})`);
          }

          const batchResp = await response.json() as { results: { ticker: string; success: boolean; data?: Record<string, unknown>; error?: string }[] };

          for (const res of batchResp.results) {
            if (res.success && res.data) {
              const d = res.data;
              current = current.map(r => r.ticker === res.ticker ? {
                ...r,
                currentPrice: (d.currentPrice as number) ?? r.currentPrice,
                changePercent: (d.changePercent as number) ?? null,
                leaderScore: (d.leaderScore as number) ?? 0,
                leaderGrade: (d.leaderGrade as LeaderGrade) ?? 'LAGGARD',
                breakdown: (d.breakdown as LeaderScoreBreakdown) ?? r.breakdown,
                // 신형
                momentum12m1Pct: (d.momentum12m1Pct as number) ?? null,
                regressionR2: (d.regressionR2 as number) ?? null,
                dollarVolume20d: (d.dollarVolume20d as number) ?? null,
                dollarVolumeShare: (d.dollarVolumeShare as number) ?? null,
                trendIntensityIndex: (d.trendIntensityIndex as number) ?? null,
                // 구형 호환
                rsRating: (d.rsRating as number) ?? null,
                mansfieldRsScore: (d.mansfieldRsScore as number) ?? null,
                mansfieldRsFlag: (d.mansfieldRsFlag as boolean) ?? null,
                mansfieldRsScore6m: (d.mansfieldRsScore6m as number) ?? null,
                tennisBallCount: (d.tennisBallCount as number) ?? 0,
                tennisBallScore: (d.tennisBallScore as number) ?? 0,
                pocketPivotScore: (d.pocketPivotScore as number) ?? null,
                volumeDryUpScore: (d.volumeDryUpScore as number) ?? null,
                sepaCorePassed: (d.sepaCorePassed as number) ?? null,
                sepaCoreTotal: (d.sepaCoreTotal as number) ?? null,
                distanceFromHigh52WeekPct: (d.distanceFromHigh52WeekPct as number) ?? null,
                status: 'done' as const,
                analyzedAt: new Date().toISOString(),
              } : r);
            } else {
              current = current.map(r => r.ticker === res.ticker ? {
                ...r,
                status: 'error' as const,
                errorMessage: res.error || '분석 실패',
              } : r);
            }
          }
          setResults([...current]);
        } catch (err) {
          if (abort.signal.aborted) break;
          for (const item of chunk) {
            current = current.map(r => r.ticker === item.ticker ? {
              ...r,
              status: 'error' as const,
              errorMessage: getErrorMessage(err),
            } : r);
          }
          setResults([...current]);
        } finally {
          completed += chunk.length;
          setProgress({ current: completed, total: items.length });
        }
      }

      if (!abort.signal.aborted) {
        // 섹터 데이터 보강
        try {
          const tickers = current.map(r => r.ticker).join(',');
          const sectorResp = await fetch(`/api/scanner/metrics?universe=${universe}&tickers=${tickers}`);
          if (sectorResp.ok) {
            const sectorPayload = await sectorResp.json() as { metrics: { ticker: string; sector?: string | null }[] };
            const sectorByTicker = new Map(sectorPayload.metrics.map(m => [m.ticker, m.sector ?? null]));
            current = current.map(r => ({ ...r, sector: sectorByTicker.get(r.ticker) ?? r.sector }));
          }
        } catch {
          // 섹터 보강 실패 무시
        }

        setResults([...current]);
        const now = new Date().toISOString();
        setLastScannedAt(now);
        setScanStage('스캔 완료');
        await writeSnapshot({ savedAt: now, universe, results: current });
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        alert(`스캔 실패: ${getErrorMessage(err)}`);
      }
    } finally {
      setIsScanning(false);
      abortRef.current = null;
    }
  };

  const stopScan = () => {
    abortRef.current?.abort();
    setIsScanning(false);
    setScanStage('중단됨');
  };

  // ── 필터/정렬 ──────────────────────────────────────────────────────────
  const filteredResults = useMemo(() => {
    let list = [...results];
    if (filterKey === 'alpha') list = list.filter(r => r.leaderGrade === 'ALPHA');
    else if (filterKey === 'emerging') list = list.filter(r => r.leaderGrade === 'EMERGING');
    else if (filterKey === 'steady') list = list.filter(r => r.leaderGrade === 'STEADY');
    else if (filterKey === 'rs90') list = list.filter(r => (r.rsRating ?? 0) >= 90);
    else if (filterKey === 'r2_80') list = list.filter(r => (r.regressionR2 ?? 0) >= 0.8);
    else if (filterKey === 'heavy_vol') list = list.filter(r => (r.dollarVolumeShare ?? 0) >= 80);

    list.sort((a, b) => {
      if (sortKey === 'leaderScore') return b.leaderScore - a.leaderScore;
      if (sortKey === 'rs') return (b.rsRating ?? 0) - (a.rsRating ?? 0);
      if (sortKey === 'r2') return (b.regressionR2 ?? 0) - (a.regressionR2 ?? 0);
      if (sortKey === 'dollarVolume') return (b.dollarVolume20d ?? 0) - (a.dollarVolume20d ?? 0);
      if (sortKey === 'tii') return (b.trendIntensityIndex ?? 0) - (a.trendIntensityIndex ?? 0);
      return (b.marketCap ?? 0) - (a.marketCap ?? 0);
    });

    return list;
  }, [results, filterKey, sortKey]);

  const stats = useMemo(() => ({
    total: results.filter(r => r.status === 'done').length,
    alpha: results.filter(r => r.leaderGrade === 'ALPHA').length,
    emerging: results.filter(r => r.leaderGrade === 'EMERGING').length,
    steady: results.filter(r => r.leaderGrade === 'STEADY').length,
    errors: results.filter(r => r.status === 'error').length,
    meanR2: results.filter(r => r.status === 'done' && r.regressionR2 !== null)
      .reduce((sum, r, _, arr) => sum + r.regressionR2! / arr.length, 0),
  }), [results]);

  const sendTelegramSummary = async () => {
    if (telegramBusy) return;
    setTelegramBusy(true);
    setTelegramMessage(null);
    try {
      const candidates = [...results]
        .filter(r => r.status === 'done' && r.leaderGrade !== 'LAGGARD')
        .sort((a, b) => b.leaderScore - a.leaderScore)
        .slice(0, 30);

      const response = await fetch('/api/scanner/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'leader',
          universe,
          candidates: candidates.map(item => ({
            ticker: item.ticker,
            name: item.name,
            exchange: item.exchange,
            leaderScore: item.leaderScore,
            leaderGrade: item.leaderGrade,
            rsRating: item.rsRating,
            tennisBallCount: item.regressionR2 ? Math.round(item.regressionR2 * 100) : 0, // 호환용 전달
            mansfieldRsScore: item.mansfieldRsScore,
            sector: item.sector,
            currentPrice: item.currentPrice,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Telegram send failed.');
      setTelegramMessage(`${candidates.length}개 현대적 주도주 후보를 텔레그램으로 전송했습니다.`);
    } catch (error) {
      setTelegramMessage(getErrorMessage(error));
    } finally {
      setTelegramBusy(false);
    }
  };

  // ── 렌더링 ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[1400px] space-y-8 p-4 md:p-8">
      {/* 탭 네비게이션 */}
      <ScannerTabNav />
      <MarketBanner />

      {/* 유니버스 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        {(Object.entries(UNIVERSES) as [ScannerUniverse, { label: string; desc: string }][]).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => handleUniverseChange(key)}
            disabled={isScanning}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
              universe === key
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 shadow-md shadow-amber-500/5'
                : 'border-slate-800 text-slate-400 hover:border-amber-500/30 hover:text-amber-300'
            } disabled:opacity-40`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 스캔 컨트롤 */}
      <div className="flex flex-wrap items-center gap-4">
        {!isScanning ? (
          <Button
            onClick={startScan}
            className="h-12 gap-2 rounded-xl border-none bg-gradient-to-r from-amber-600 to-amber-500 px-8 font-bold text-white shadow-lg shadow-amber-500/20 hover:brightness-110"
          >
            <Play className="h-5 w-5" /> 현대적 주도주 스캔 개시
          </Button>
        ) : (
          <Button
            onClick={stopScan}
            variant="outline"
            className="h-12 gap-2 rounded-xl border-rose-500/50 px-8 font-bold text-rose-300 hover:bg-rose-500/10"
          >
            <Square className="h-5 w-5" /> 중단
          </Button>
        )}

        {isScanning && (
          <div className="flex items-center gap-3">
            <LoadingSpinner />
            <span className="text-sm text-slate-400">
              {scanStage} ({progress.current}/{progress.total})
            </span>
          </div>
        )}

        {lastScannedAt && !isScanning && (
          <span className="text-xs text-slate-500 font-mono">
            최근 분석: {new Date(lastScannedAt).toLocaleString('ko-KR')}
          </span>
        )}

        {!isScanning && results.length > 0 && (
          <>
            <Button
              onClick={sendTelegramSummary}
              disabled={telegramBusy}
              variant="outline"
              className="h-10 gap-2 rounded-xl border-amber-500/30 px-4 text-amber-300 hover:bg-amber-500/10"
            >
              {telegramBusy ? <LoadingSpinner /> : <Send className="h-4 w-4" />}
              텔레그램 리포트 발송
            </Button>
            {telegramMessage && <span className="text-xs text-amber-300 font-medium">{telegramMessage}</span>}
          </>
        )}

        {limitMessage && (
          <span className="text-xs text-rose-400">{limitMessage}</span>
        )}
      </div>

      {/* 진행률 바 */}
      {isScanning && progress.total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
            initial={{ width: 0 }}
            animate={{ width: `${(progress.current / progress.total) * 100}%` }}
            transition={{ ease: 'easeOut' }}
          />
        </div>
      )}

      {/* 요약 카드 */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Alpha Leaders"
            value={stats.alpha}
            subtitle="초강력 주도 대장주"
            icon={Trophy as React.FC<React.SVGProps<SVGSVGElement>>}
            tone="border-emerald-400/20 bg-emerald-500/5 text-emerald-300"
          />
          <StatCard
            label="Emerging Leaders"
            value={stats.emerging}
            subtitle="급부상 수급 유망주"
            icon={Flame as React.FC<React.SVGProps<SVGSVGElement>>}
            tone="border-amber-400/20 bg-amber-500/5 text-amber-300"
          />
          <StatCard
            label="Mean R² Consistency"
            value={`${(stats.meanR2 * 100).toFixed(1)}%`}
            subtitle="평균 추세 선형 안정성"
            icon={Activity as React.FC<React.SVGProps<SVGSVGElement>>}
            tone="border-indigo-400/20 bg-indigo-500/5 text-indigo-300"
          />
          <StatCard
            label="Total Scanned"
            value={stats.total}
            subtitle={`분석 오류 ${stats.errors}건`}
            icon={DollarSign as React.FC<React.SVGProps<SVGSVGElement>>}
            tone="border-slate-800 bg-slate-900/40 text-slate-300"
          />
        </div>
      )}

      {/* 필터/정렬 */}
      {results.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilterKey(f.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                  filterKey === f.key
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 font-semibold"
          >
            {SORTS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* 테이블 */}
      {filteredResults.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40 backdrop-blur-sm shadow-xl">
          <table className="w-full table-fixed divide-y divide-slate-800 text-xs">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[6%]" />
              <col className="w-[7%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
              <tr>
                <th className="px-3 py-4 text-left">#</th>
                <th className="px-3 py-4 text-left">종목</th>
                <th className="px-3 py-4 text-right">시총</th>
                <th className="px-3 py-4 text-right">현재가</th>
                <th className="px-3 py-4 text-right">등락</th>
                <th className="px-3 py-4 text-center">Modern Score</th>
                <th className="px-3 py-4 text-right">RS 백분위</th>
                <th className="px-3 py-4 text-right">추세선형성(R²)</th>
                <th className="px-3 py-4 text-right">12-M-1</th>
                <th className="px-3 py-4 text-center">거래대금 (점유율)</th>
                <th className="px-3 py-4 text-center">TII</th>
                <th className="px-3 py-4 text-left">Grade</th>
                <th className="px-3 py-4 className=text-center">선정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
              {filteredResults.map((r, idx) => (
                <tr
                  key={r.ticker}
                  className={`transition-colors hover:bg-slate-800/20 ${selectedTickers.has(r.ticker) ? 'bg-amber-500/5' : ''}`}
                >
                  <td className="px-3 py-4 text-slate-500 text-[10px]">{idx + 1}</td>
                  <td className="px-3 py-4 font-sans">
                    <div className="font-bold text-white text-xs">{r.ticker}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {r.sector && (
                        <span className="shrink-0 rounded border border-slate-800 bg-slate-900 px-1 py-0.5 text-[9px] font-semibold text-slate-400">{r.sector}</span>
                      )}
                      <span className="text-[10px] text-slate-500 truncate max-w-[100px]">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right text-slate-400">{formatMarketCap(r.marketCap, r.currency, r.ticker)}</td>
                  <td className="px-3 py-4 text-right text-slate-300">
                    {r.status === 'running' ? <LoadingSpinner size="sm" /> : formatPrice(r.currentPrice, r.currency)}
                  </td>
                  <td className="px-3 py-4 text-right">
                    {typeof r.changePercent === 'number' ? (
                      <span className={r.changePercent >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                        {r.changePercent >= 0 ? '+' : ''}{r.changePercent.toFixed(2)}%
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-4 text-center">
                    {r.status === 'done' && (
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-base font-black ${
                          r.leaderScore >= 85 ? 'text-emerald-300' :
                          r.leaderScore >= 65 ? 'text-amber-300' :
                          r.leaderScore >= 45 ? 'text-sky-300' : 'text-slate-500'
                        }`}>{r.leaderScore}</span>
                        <BreakdownBars breakdown={r.breakdown} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right">
                    {r.rsRating !== null ? (
                      <span className={r.rsRating >= 90 ? 'text-emerald-400 font-bold' : r.rsRating >= 80 ? 'text-slate-200' : 'text-slate-500'}>
                        {r.rsRating}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-4 text-right">
                    {typeof r.regressionR2 === 'number' ? (
                      <div className="flex flex-col items-end">
                        <span className={r.regressionR2 >= 0.8 ? 'text-emerald-300 font-bold' : 'text-slate-300'}>
                          {(r.regressionR2 * 100).toFixed(0)}%
                        </span>
                        <span className="text-[9px] text-slate-500">R² Fit</span>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-4 text-right">
                    {typeof r.momentum12m1Pct === 'number' ? (
                      <span className={r.momentum12m1Pct >= 30 ? 'text-emerald-300 font-bold' : r.momentum12m1Pct >= 0 ? 'text-slate-300' : 'text-rose-400'}>
                        {r.momentum12m1Pct >= 0 ? '+' : ''}{r.momentum12m1Pct.toFixed(0)}%
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-4 text-center">
                    {r.status === 'done' && typeof r.dollarVolume20d === 'number' && (
                      <div className="flex flex-col items-center">
                        <span className="text-slate-300 font-bold">{formatMarketCap(r.dollarVolume20d ?? null, r.currency, r.ticker)}</span>
                        {r.dollarVolumeShare !== undefined && r.dollarVolumeShare !== null ? (
                          <span className={`text-[9px] px-1 rounded ${
                            r.dollarVolumeShare >= 90 ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' : 'text-slate-500'
                          }`}>
                            상위 {100 - r.dollarVolumeShare}%
                          </span>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 text-center">
                    {r.trendIntensityIndex !== null && r.trendIntensityIndex !== undefined ? (
                      <span className={r.trendIntensityIndex >= 80 ? 'text-sky-300 font-bold' : 'text-slate-400'}>
                        {r.trendIntensityIndex}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-4 font-sans">
                    {r.status === 'done' && (
                      <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold ${gradeBadgeClass(r.leaderGrade)}`}>
                        {gradeLabel(r.leaderGrade).emoji} {gradeLabel(r.leaderGrade).label}
                      </span>
                    )}
                    {r.status === 'error' && <span className="text-rose-400 text-[10px]">에러</span>}
                    {(r.status === 'queued' || r.status === 'running') && <span className="text-slate-600 text-[10px]">대기 중</span>}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center justify-center gap-1">
                      <TradingViewWidget ticker={r.ticker} exchange={r.exchange} variant="icon" />
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelection(r.ticker); }}
                        disabled={r.status !== 'done'}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all ${
                          selectedTickers.has(r.ticker)
                            ? 'border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                            : 'border-slate-800 text-slate-500 hover:border-amber-500/50 hover:text-amber-400'
                        } disabled:opacity-20`}
                      >
                        {selectedTickers.has(r.ticker) ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 빈 상태 */}
      {!isScanning && results.length === 0 && (
        <div className="flex flex-col items-center justify-center space-y-6 rounded-3xl border border-slate-800 bg-slate-950/40 py-20 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/5 shadow-inner">
            <Trophy className="h-10 w-10 text-amber-500/60" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">현대적 주도주 판별 스캐너</h3>
            <p className="max-w-md text-sm leading-6 text-slate-500 font-medium">
              12-Minus-1 모멘텀, 주가 선형 일관성(R²), 시장 거래대금 쏠림 점유율, 이평선 추세 강도(TII), 섹터 알파를 종합하여
              현재 글로벌 시장 자금이 쏠리는 최고 성능의 진짜 대장주를 정확히 판별합니다.
            </p>
          </div>
          <Button
            onClick={startScan}
            className="h-12 gap-2 rounded-xl border-none bg-gradient-to-r from-amber-600 to-amber-500 px-8 font-bold text-white shadow-lg shadow-amber-500/20 hover:brightness-110"
          >
            <Play className="h-5 w-5" /> 현대적 주도주 스캔 개시
          </Button>
        </div>
      )}
    </div>
  );
}
