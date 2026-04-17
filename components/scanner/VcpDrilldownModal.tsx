'use client';

import { 
  X, 
  ExternalLink, 
  Star, 
  TrendingUp, 
  Waves, 
  Activity, 
  ArrowUpRight, 
  Info,
  CalendarDays
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { ScannerResult } from '@/types';
import Button from '@/components/ui/Button';

interface VcpDrilldownModalProps {
  result: ScannerResult | null;
  onClose: () => void;
  onAddToWatchlist: (item: ScannerResult) => Promise<void>;
  isSavingWatchlist: boolean;
}

const GRADE_THEMES = {
  strong: {
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    accent: 'bg-emerald-500',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]'
  },
  forming: {
    border: 'border-blue-500/50',
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    accent: 'bg-blue-500',
    glow: 'shadow-[0_0_20px_rgba(59,130,246,0.2)]'
  },
  weak: {
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    accent: 'bg-amber-500',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]'
  },
  none: {
    border: 'border-slate-700',
    bg: 'bg-slate-800/50',
    text: 'text-slate-400',
    accent: 'bg-slate-600',
    glow: ''
  }
};

export default function VcpDrilldownModal({ 
  result, 
  onClose, 
  onAddToWatchlist, 
  isSavingWatchlist 
}: VcpDrilldownModalProps) {
  if (!result) return null;

  const theme = GRADE_THEMES[result.vcpGrade || 'none'];

  const metrics = [
    { label: '수축 패턴 (Contraction)', score: result.contractionScore, icon: <Waves className="h-4 w-4" /> },
    { label: '거래량 건조화 (Volume Dry-up)', score: result.volumeDryUpScore, icon: <Activity className="h-4 w-4" /> },
    { label: '가까운 밀집 (BB Squeeze)', score: result.bbSqueezeScore, icon: <TrendingUp className="h-4 w-4" /> },
    { label: '포켓 피벗 (Pocket Pivot)', score: result.pocketPivotScore, icon: <ArrowUpRight className="h-4 w-4" /> }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 p-6">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-black tracking-tight text-white">{result.ticker}</h3>
                <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold uppercase ${theme.border} ${theme.bg} ${theme.text}`}>
                  VCP {result.vcpGrade?.toUpperCase() || 'NONE'}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-400">{result.name} · {result.exchange}</p>
            </div>
            <button 
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-6 space-y-8">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatItem label="VCP 점수" value={`${result.vcpScore ?? 0}점`} highlight />
              <StatItem label="피벗 근접도" value={result.distanceToPivotPct !== null ? `${result.distanceToPivotPct}%` : '-'} />
              <StatItem label="권장 진입가" value={result.recommendedEntry?.toLocaleString() || '-'} />
              <StatItem label="현재가" value={result.currentPrice?.toLocaleString() || '-'} />
            </div>

            {/* Core Metrics Visualizer */}
            <section className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">핵심 분석 지표</h4>
              <div className="grid gap-6">
                {metrics.map((m) => (
                  <div key={m.label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <div className="flex items-center gap-2 text-slate-300">
                        {m.icon}
                        <span>{m.label}</span>
                      </div>
                      <span className={theme.text}>{m.score ?? 0} / 100</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${m.score ?? 0}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={`h-full ${theme.accent} ${theme.glow}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Analysis Details Log */}
            <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                <Activity className="h-4 w-4 text-emerald-400" />
                <span>분석 상세 내역 (Analysis Log)</span>
              </div>
              <ul className="grid gap-2 text-sm text-slate-400 leading-relaxed">
                {result.vcpDetails?.map((detail, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-700" />
                    {detail}
                  </li>
                )) || (
                  <li className="text-slate-600 italic">상세 분석 데이터가 없습니다.</li>
                )}
              </ul>
            </section>

            {/* Pivot Information */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-500">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>진입 전략</span>
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  <span className="font-bold text-emerald-400">{result.pivotPrice?.toLocaleString()}</span> 부근 거래량 동반 돌파 시 
                  추세 진입이 유리합니다. 손절가는 수축의 마지막 저점을 기준으로 설정하십시오.
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>분석 정보</span>
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>기준 시각: {result.analyzedAt ? new Date(result.analyzedAt).toLocaleString() : '정보 없음'}</p>
                  <p>데이터 소스: {result.priceSource}</p>
                  <p className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    과거 가격 데이터와 거래량을 기반으로 계산됨
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-900/80 p-6 sm:flex-row">
            <Link
              href={`/plan?ticker=${encodeURIComponent(result.ticker)}&exchange=${encodeURIComponent(result.exchange)}`}
              className="flex-1"
            >
              <Button className="w-full gap-2 py-6 text-base font-bold">
                <ExternalLink className="h-5 w-5" />
                신규 트레이딩 계획 수립
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => onAddToWatchlist(result)}
              disabled={isSavingWatchlist}
              className="gap-2 py-6 text-base font-bold sm:w-auto sm:px-8"
            >
              <Star className={`h-5 w-5 ${isSavingWatchlist ? 'animate-pulse' : ''}`} />
              {isSavingWatchlist ? '관심 종목 저장 중...' : '관심 종목 추가'}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function StatItem({ 
  label, 
  value, 
  highlight = false 
}: { 
  label: string; 
  value: string; 
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-black ${highlight ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
