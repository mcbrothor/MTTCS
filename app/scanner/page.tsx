'use client';

import Link from 'next/link';
import { Play, ScanSearch, Square } from 'lucide-react';
import Button from '@/components/ui/Button';
import VcpDrilldownModal from '@/components/scanner/VcpDrilldownModal';
import ScannerTabNav from '@/components/scanner/ScannerTabNav';
import { useScanner, UNIVERSES, SCANNER_FILTERS, SORTS, type SortKey } from '@/hooks/scanner';
import type { ScannerUniverse } from '@/types';
import ScannerTable from '@/components/scanner/ScannerTable';
import ScannerCardView from '@/components/scanner/ScannerCardView';
import MarketBanner from '@/components/ui/MarketBanner';

const MACRO_TONE = {
  HALT: 'border-rose-400/24 bg-rose-500/10 text-rose-50',
  REDUCED: 'border-amber-400/24 bg-amber-500/10 text-amber-50',
  FULL: 'border-emerald-400/24 bg-emerald-500/10 text-emerald-50',
} as const;

function formatDateTime(value: string | null) {
  if (!value) return 'No snapshot';
  return new Date(value).toLocaleString('ko-KR');
}

export default function ScannerPage() {
  const {
    universe,
    isScanning,
    progress,
    scanStage,
    lastScannedAt,
    filterKey,
    setFilterKey,
    sortKey,
    setSortKey,
    viewMode,
    setViewMode,
    busy,
    selectedResult,
    setSelectedResult,
    selectedTickers,
    clearSelection,
    macroTrend,
    showAllMacroResults,
    setShowAllMacroResults,
    handleUniverseChange,
    startScan,
    stopScan,
    addToWatchlist,
    toggleSelected,
    filteredResults,
    stats,
    dataSourceSummary,
    isSavingWatchlist,
    results,
    customFilters,
    setCustomFilters,
    showCustomFilter,
    setShowCustomFilter,
  } = useScanner();

  const macroTone = macroTrend ? MACRO_TONE[macroTrend.action_level] : '';
  const scanBlocked = macroTrend?.action_level === 'HALT';
  const isMacroRestricted = (macroTrend?.action_level === 'HALT' || macroTrend?.action_level === 'REDUCED') && !showAllMacroResults;

  return (
    <div className="space-y-6 pb-12">
      <section className="panel-grid space-y-5 p-5 sm:p-6">
        <ScannerTabNav />
        <MarketBanner compact={true} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
          <div className="space-y-4">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-black tracking-tightest text-[var(--text-primary)]">
                <div className="rounded-2xl bg-emerald-500/20 p-2.5 ring-1 ring-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                  <ScanSearch className="h-6 w-6 text-emerald-300" />
                </div>
                미너비니 스캐너
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                미너비니의 SEPA 전략과 VCP(변동성 축소 패턴)를 기반으로 최적의 진입 시점을 발굴합니다. 스캔 실행 전 '시장 분석' 메뉴에서 현재 마스터 필터 수치와 매크로 환경을 먼저 확인하는 것이 원칙입니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
                Universe <span className="ml-1 font-mono text-[var(--text-primary)]">{UNIVERSES[universe].label}</span>
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
                Results <span className="ml-1 font-mono text-[var(--text-primary)]">{filteredResults.length}</span>
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
                Selected <span className="ml-1 font-mono text-[var(--text-primary)]">{selectedTickers.size}/10</span>
              </span>
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-accent)] p-4 shadow-[var(--panel-shadow)]">
            <div className="grid gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                  Scan Control
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  유니버스와 뷰 모드를 정한 뒤 바로 스캔을 실행할 수 있습니다.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs text-[var(--text-secondary)]">
                  Universe
                  <select
                    value={universe}
                    onChange={(event) => handleUniverseChange(event.target.value as ScannerUniverse)}
                    disabled={isScanning}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-emerald-400/40"
                  >
                    {Object.entries(UNIVERSES).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-1.5 text-xs text-[var(--text-secondary)]">
                  View
                  <div className="flex rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-1">
                    {(['web', 'app'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewMode(mode)}
                        className={`flex-1 rounded-[14px] px-3 py-2 text-xs font-semibold transition-colors ${
                          viewMode === mode
                            ? 'bg-emerald-500 text-slate-950'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {mode === 'web' ? 'Table' : 'Cards'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    Last Scan
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {formatDateTime(lastScannedAt)}
                  </p>
                </div>

                {isScanning ? (
                  <Button variant="danger" onClick={stopScan} icon={<Square className="h-4 w-4" />} className="rounded-2xl">
                    중단
                  </Button>
                ) : (
                  <Button onClick={startScan} icon={<Play className="h-4 w-4" />} disabled={busy || scanBlocked} className="rounded-2xl">
                    {scanBlocked ? 'HALT 차단' : '스캔 시작'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Recommended</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-emerald-300">{stats.recommended}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">즉시 검토 우선순위</p>
          </div>
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Partial</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-amber-300">{stats.partial}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">조건 보완 필요</p>
          </div>
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Errors</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-rose-300">{stats.errors}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">재조회 또는 예외 확인</p>
          </div>
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Data Source</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{UNIVERSES[universe].label}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{dataSourceSummary}</p>
          </div>
        </div>

        {isScanning && (
          <div className="rounded-[20px] border border-emerald-400/20 bg-emerald-500/8 px-4 py-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Scan Progress</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{scanStage}</p>
              </div>
              <span className="font-mono text-sm font-semibold text-emerald-100">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-emerald-950/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-300"
                style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {macroTrend && (
        <div className={`rounded-[22px] border px-4 py-4 shadow-[var(--panel-shadow)] ${macroTone}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Macro Action
              </p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                <span className="font-semibold">{macroTrend.action_level}</span> · {macroTrend.index_code} 기준 50일선 {macroTrend.is_uptrend_50 ? '상회' : '하회'} / 200일선 {macroTrend.is_uptrend_200 ? '상회' : '하회'}
              </p>
            </div>
            {(macroTrend.action_level === 'REDUCED' || macroTrend.action_level === 'HALT') && (
              <button
                type="button"
                onClick={() => setShowAllMacroResults((value) => !value)}
                className="rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
              >
                {showAllMacroResults
                  ? macroTrend.action_level === 'HALT' ? 'HALT 제한 보기' : 'RS 80+ 우선 보기'
                  : macroTrend.action_level === 'HALT' ? '제한 해제하고 전체 보기' : '전체 보기'}
              </button>
            )}
          </div>
          {macroTrend.action_level === 'HALT' && !showAllMacroResults && (
            <div className="rounded-2xl border border-rose-400/20 bg-black/10 px-3 py-3 text-sm text-rose-100">
              시장 상태가 <strong>HALT</strong> 이므로 VCP 신규 후보 노출과 재스캔을 제한합니다. 기존 결과를 검토하려면 우측 버튼으로 전체 보기를 열 수 있습니다.
            </div>
          )}
        </div>
      )}

      <section className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4 shadow-[var(--panel-shadow)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {SCANNER_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setFilterKey(filter.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterKey === filter.key
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {filter.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCustomFilter((value) => !value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                showCustomFilter
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              상세 필터
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-[var(--text-secondary)]">
              <span className="text-xs font-semibold uppercase tracking-[0.15em]">Sort</span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
              >
                {SORTS.map((sort) => (
                  <option key={sort.key} value={sort.key}>{sort.label}</option>
                ))}
              </select>
            </label>

            <span className="text-xs text-[var(--text-tertiary)]">
              Last scan {formatDateTime(lastScannedAt)}
            </span>
          </div>
        </div>

        {showCustomFilter && (
          <div className="mt-4 grid grid-cols-1 gap-4 rounded-[20px] border border-emerald-400/20 bg-emerald-500/6 p-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">최소 RS Rating ({customFilters.rsMin}+)</label>
              <input
                type="range"
                min="0"
                max="99"
                value={customFilters.rsMin}
                onChange={(event) => setCustomFilters((prev) => ({ ...prev, rsMin: Number(event.target.value) }))}
                className="w-full accent-emerald-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">최소 VCP 점수 ({customFilters.vcpMin}+)</label>
              <input
                type="range"
                min="0"
                max="100"
                value={customFilters.vcpMin}
                onChange={(event) => setCustomFilters((prev) => ({ ...prev, vcpMin: Number(event.target.value) }))}
                className="w-full accent-emerald-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">피벗 최대 거리 ({customFilters.distMax}%)</label>
              <input
                type="range"
                min="1"
                max="50"
                value={customFilters.distMax > 50 ? 50 : customFilters.distMax}
                onChange={(event) => setCustomFilters((prev) => ({ ...prev, distMax: Number(event.target.value) }))}
                className="w-full accent-emerald-500"
              />
            </div>
          </div>
        )}
      </section>

      {filteredResults.length > 0 ? (
        viewMode === 'web' ? (
          <ScannerTable
            results={filteredResults}
            selectedTickers={selectedTickers}
            onToggleSelect={toggleSelected}
            onRowClick={(res) => setSelectedResult(res)}
          />
        ) : (
          <ScannerCardView
            results={filteredResults}
            selectedTickers={selectedTickers}
            onToggleSelect={toggleSelected}
            onCardClick={(res) => setSelectedResult(res)}
          />
        )
      ) : null}

      {results.length === 0 && !isScanning && (
        <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--surface-soft)] px-6 py-16 text-center">
          <ScanSearch className="mx-auto mb-4 h-12 w-12 text-[var(--text-tertiary)]" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">스캔 결과가 없습니다.</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">상단 컨트롤에서 스캔을 시작하면 즉시 후보가 채워집니다.</p>
        </div>
      )}

      {results.length > 0 && filteredResults.length === 0 && !isScanning && isMacroRestricted && (
        <div className="rounded-[24px] border border-dashed border-rose-400/25 bg-rose-500/6 px-6 py-16 text-center">
          <ScanSearch className="mx-auto mb-4 h-12 w-12 text-rose-300/70" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {macroTrend?.action_level === 'HALT' ? 'HALT 상태로 후보 노출이 제한되었습니다.' : 'REDUCED 상태로 RS 강한 후보만 노출합니다.'}
          </h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {macroTrend?.action_level === 'HALT'
              ? '전체 보기로 전환하면 기존 스캔 결과를 참고용으로 검토할 수 있습니다.'
              : '우측 토글로 전체 결과를 볼 수 있지만, 기본 화면은 RS 80+ 중심으로 압축됩니다.'}
          </p>
        </div>
      )}

      {selectedTickers.size > 0 && (
        <div className="fixed bottom-8 left-1/2 z-50 flex w-[min(92vw,640px)] -translate-x-1/2 items-center justify-between gap-4 rounded-[22px] border border-emerald-400/20 bg-[rgba(4,8,16,0.92)] px-5 py-4 shadow-[0_24px_70px_rgba(2,6,23,0.56)] backdrop-blur-xl">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Contest Pool</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{selectedTickers.size} / 10 종목 선택</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => clearSelection()}
              className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              전체 해제
            </button>
            <Link href="/contest">
              <Button icon={<ScanSearch className="h-4 w-4" />} className="rounded-2xl bg-emerald-600 hover:bg-emerald-500">
                콘테스트로 이동
              </Button>
            </Link>
          </div>
        </div>
      )}

      <VcpDrilldownModal
        result={selectedResult}
        onClose={() => setSelectedResult(null)}
        onAddToWatchlist={addToWatchlist}
        isSavingWatchlist={isSavingWatchlist}
      />
    </div>
  );
}
