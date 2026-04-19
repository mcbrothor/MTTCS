'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Play, Plus, ScanSearch, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MarketBanner from '@/components/ui/MarketBanner';
import VcpDrilldownModal from '@/components/scanner/VcpDrilldownModal';
import ScannerTabNav from '@/components/scanner/ScannerTabNav';

import { useScanner, UNIVERSES, SCANNER_FILTERS, SORTS } from '@/hooks/useScanner';
import type { ViewMode, FilterKey, SortKey } from '@/hooks/useScanner';
import type { ScannerUniverse } from '@/types';
import ScannerTable from '@/components/scanner/ScannerTable';
import ScannerCardView from '@/components/scanner/ScannerCardView';

export default function ScannerPage() {
  const {
    universe, isScanning, progress, scanStage, lastScannedAt,
    filterKey, setFilterKey, sortKey, setSortKey, viewMode, setViewMode, busy,
    selectedResult, setSelectedResult, selectedTickers, clearSelection, macroTrend,
    showAllMacroResults, setShowAllMacroResults, handleUniverseChange,
    startScan, stopScan, addToWatchlist, toggleSelected, filteredResults,
    stats, dataSourceSummary, isSavingWatchlist, results
  } = useScanner();
  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <ScannerTabNav />
      <MarketBanner />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <ScanSearch className="h-6 w-6 text-emerald-400" /> VCP 마스터 스캐너
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            SEPA/VCP 조건과 예외 신호를 함께 판단해 콘테스트 비교 후보를 만듭니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={universe}
            onChange={(event) => handleUniverseChange(event.target.value as ScannerUniverse)}
            disabled={isScanning}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          >
            {Object.entries(UNIVERSES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setViewMode('web')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === 'web' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}
            >
              웹
            </button>
            <button
              type="button"
              onClick={() => setViewMode('app')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === 'app' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}
            >
              앱
            </button>
          </div>

          {isScanning ? (
            <Button variant="danger" onClick={stopScan} icon={<Square className="h-4 w-4" />}>중단</Button>
          ) : (
            <Button onClick={startScan} icon={<Play className="h-4 w-4" />} disabled={busy}>스캔 시작</Button>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{UNIVERSES[universe].label}</p>
            <p className="mt-1 text-xs text-slate-400">{UNIVERSES[universe].description}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:flex sm:text-left">
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">Recommended {stats.recommended}</span>
            <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">Partial {stats.partial}</span>
            <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200">Error {stats.errors}</span>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-200">데이터 원천</span>
          <span className="ml-2">{dataSourceSummary}</span>
        </div>

        {isScanning && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-emerald-300">{scanStage}</span>
              <span className="text-sm text-slate-400">{progress.current} / {progress.total}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              데이터 흐름: 유니버스 API → KIS 가격 조회 → Yahoo fallback → 벤치마크 조회 → SEPA/VCP 계산
            </p>
          </div>
        )}
      </section>

      {macroTrend && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${macroTrend.action_level === 'HALT' ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : macroTrend.action_level === 'REDUCED' ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <span>Macro Action: <strong>{macroTrend.action_level}</strong> | {macroTrend.index_code} 기준 50일선 {macroTrend.is_uptrend_50 ? '상회' : '하회'} / 200일선 {macroTrend.is_uptrend_200 ? '상회' : '하회'}</span>
            {macroTrend.action_level === 'REDUCED' && (
              <button type="button" onClick={() => setShowAllMacroResults((value) => !value)} className="text-xs font-semibold underline">
                {showAllMacroResults ? 'RS 80+ 우선 보기' : '전체 보기'}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap gap-2">
          {SCANNER_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setFilterKey(filter.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterKey === filter.key ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">정렬:</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="bg-transparent text-xs text-slate-300 outline-none"
          >
            {SORTS.map((sort) => (
              <option key={sort.key} value={sort.key}>{sort.label}</option>
            ))}
          </select>
          {lastScannedAt && (
            <span className="ml-4 text-xs text-slate-500">최근 스캔: {new Date(lastScannedAt).toLocaleString('ko-KR')}</span>
          )}
        </div>
      </div>

      {viewMode === 'web' ? (
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
      )}

      {results.length === 0 && !isScanning && (
        <div className="py-20 text-center">
          <ScanSearch className="mx-auto mb-4 h-12 w-12 text-slate-700" />
          <h3 className="font-bold text-slate-400">스캔 결과가 없습니다.</h3>
          <p className="mt-1 text-sm text-slate-600">상단의 스캔 시작 버튼으로 시장 조사를 시작하세요.</p>
        </div>
      )}

      {selectedTickers.size > 0 && (
        <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-6 rounded-lg border border-emerald-500/30 bg-slate-950/90 px-6 py-4 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-emerald-400">콘테스트 분석 후보</span>
            <span className="text-lg font-bold text-white">{selectedTickers.size} / 10 종목</span>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          <div className="flex items-center gap-3">
            <button
              onClick={() => clearSelection()}
              className="text-sm text-slate-400 transition-colors hover:text-white"
            >
              전체 해제
            </button>
            <Link
              href="/contest"
            >
              <Button icon={<ScanSearch className="h-4 w-4" />} className="bg-emerald-600 hover:bg-emerald-500">
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
