'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ScannerUniverse } from '@/types';
import { MAX_CONTEST_CANDIDATES } from '@/lib/contest-sources';

export function ScannerUniverseSelect({ value, onChange, disabled = false, options }: {
  value: ScannerUniverse;
  onChange: (value: ScannerUniverse) => void;
  disabled?: boolean;
  options: Record<ScannerUniverse, { label: string; desc?: string; description?: string }>;
}) {
  return <div role="group" aria-label="유니버스 선택" className="flex min-w-0 flex-wrap gap-1.5">
    {(Object.keys(options) as ScannerUniverse[]).map((key) => <button key={key} type="button" title={options[key].desc || options[key].description} disabled={disabled} aria-pressed={value === key} onClick={() => onChange(key)} className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${value === key ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-emerald-400/30'}`}>{options[key].label}</button>)}
  </div>;
}

export function ScannerViewToggle({ value, onChange }: { value: 'web' | 'app'; onChange: (value: 'web' | 'app') => void }) {
  return <div role="group" aria-label="보기 방식" className="flex shrink-0 rounded-lg border border-[var(--border)] p-1">
    {(['web', 'app'] as const).map((mode) => <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)} className={`min-h-8 rounded-md px-3 py-1.5 text-xs font-semibold ${value === mode ? 'bg-emerald-500 text-slate-950' : 'text-[var(--text-secondary)]'}`}>{mode === 'web' ? '표 보기' : '카드 보기'}</button>)}
  </div>;
}

export function ScannerSelectionBar({ count, onClear, hidden = false, children, href = '/contest' }: { count: number; onClear: () => void; hidden?: boolean; children?: ReactNode; href?: string }) {
  if (!count || hidden) return null;
  return <>
    <aside aria-label="선택 후보 작업" className="sticky top-2 z-30 flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-slate-950/95 px-4 py-3 shadow-lg backdrop-blur">
      <p className="text-sm font-semibold text-slate-100"><span className="mr-3 text-[10px] tracking-widest text-emerald-300">CONTEST POOL</span>{count} / {MAX_CONTEST_CANDIDATES} 종목 선택</p>
      <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onClear} className="min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">전체 해제</button>{children}<Link href={href} className="min-h-10 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800">콘테스트로 이동</Link></div>
    </aside>
  </>;
}

export function ScannerSnapshotStamp({ value }: { value: string | null }) {
  const date = value ? new Date(value) : null;
  return <p className="text-xs text-amber-200/90">저장된 스캔 · {date && Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : '기준시각 미확인'}<span className="ml-2 text-[var(--text-secondary)]">시장 요약과 기준시각이 다를 수 있습니다.</span></p>;
}
