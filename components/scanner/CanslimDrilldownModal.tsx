'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, XCircle, AlertTriangle, Info, Shield, TrendingUp, BarChart3 } from 'lucide-react';
import type { CanslimScannerResult, CanslimPillarDetail } from '@/types';
import { dualTierLabel } from '@/lib/finance/engines/canslim-engine';

interface Props {
  result: CanslimScannerResult;
  onClose: () => void;
}

/** Pillar 상태에 따른 아이콘 */
function StatusIcon({ status }: { status: CanslimPillarDetail['status'] }) {
  switch (status) {
    case 'PASS': return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'FAIL': return <XCircle className="h-4 w-4 text-rose-400" />;
    case 'WARNING': return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    case 'INFO': return <Info className="h-4 w-4 text-slate-400" />;
  }
}

/** Pillar 상태에 따른 배경색 */
function statusBg(status: CanslimPillarDetail['status']) {
  switch (status) {
    case 'PASS': return 'border-emerald-500/30 bg-emerald-500/5';
    case 'FAIL': return 'border-rose-500/30 bg-rose-500/5';
    case 'WARNING': return 'border-amber-500/30 bg-amber-500/5';
    case 'INFO': return 'border-slate-700 bg-slate-900/50';
  }
}

/** Confidence 배지 색상 */
function confidenceClass(confidence: 'HIGH' | 'MEDIUM' | 'LOW') {
  switch (confidence) {
    case 'HIGH': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'MEDIUM': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'LOW': return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
}

/** 이중 검증 티어 배지 */
function TierBadge({ tier }: { tier: CanslimScannerResult['dualTier'] }) {
  const info = dualTierLabel(tier);
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    blue: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    slate: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm font-bold ${colorMap[info.color]}`}>
      {info.emoji} {info.label}
    </span>
  );
}

export default function CanslimDrilldownModal({ result, onClose }: Props) {
  const { canslimResult } = result;
  const details = canslimResult.pillarDetails;

  // Pillar를 그룹별로 분류
  const pillarGroups: { label: string; icon: React.ReactNode; pillars: string[] }[] = [
    { label: '시장 환경', icon: <BarChart3 className="h-4 w-4 text-purple-400" />, pillars: ['M'] },
    { label: '분기 실적', icon: <TrendingUp className="h-4 w-4 text-cyan-400" />, pillars: ['C'] },
    { label: '연간 실적', icon: <TrendingUp className="h-4 w-4 text-indigo-400" />, pillars: ['A'] },
    { label: '신고가/패턴', icon: <BarChart3 className="h-4 w-4 text-emerald-400" />, pillars: ['N'] },
    { label: '수급', icon: <BarChart3 className="h-4 w-4 text-amber-400" />, pillars: ['S'] },
    { label: '상대강도', icon: <Shield className="h-4 w-4 text-cyan-400" />, pillars: ['L'] },
    { label: '기관 수급', icon: <Shield className="h-4 w-4 text-blue-400" />, pillars: ['I'] },
  ];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          initial={{ scale: 0.9, y: 40 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 40 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700 bg-slate-900/95 px-6 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white">{result.ticker}</h2>
              <TierBadge tier={result.dualTier} />
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* 결과 요약 */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold ${canslimResult.pass ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`}>
                {canslimResult.pass ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {canslimResult.pass ? 'CAN SLIM PASS' : `CAN SLIM FAIL — ${canslimResult.failedPillar}`}
              </div>
              <span className={`inline-flex rounded-lg border px-3 py-1 text-xs font-semibold ${confidenceClass(canslimResult.confidence)}`}>
                Confidence: {canslimResult.confidence}
              </span>
              {result.vcpGrade && (
                <span className="inline-flex rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
                  VCP: {result.vcpGrade} ({result.vcpScore})
                </span>
              )}
            </div>

            {/* 손절가 */}
            {canslimResult.stopLossPrice !== null && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-rose-400" />
                  <span className="font-medium text-rose-300">자동 손절가</span>
                  <span className="ml-auto font-mono text-lg font-bold text-rose-200">
                    {result.currency === 'KRW' ? '₩' : '$'}{canslimResult.stopLossPrice.toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  매수 기준가 대비 −8% (오닐 원칙: 기계적 손절, 물타기 금지)
                </p>
              </div>
            )}

            {/* 베이스 패턴 */}
            {result.basePattern && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                  감지된 베이스 패턴: {result.basePattern.type.replace(/_/g, ' ')}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-3 text-xs text-slate-300">
                  <div>
                    <span className="text-slate-500">피벗</span>
                    <div className="font-mono font-medium">{result.basePattern.pivotPoint.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">기간</span>
                    <div className="font-medium">{result.basePattern.weeksForming}주</div>
                  </div>
                  <div>
                    <span className="text-slate-500">깊이</span>
                    <div className="font-medium">{result.basePattern.depthPct}%</div>
                  </div>
                  <div>
                    <span className="text-slate-500">신뢰도</span>
                    <div className={`font-bold ${result.basePattern.confidence === 'HIGH' ? 'text-emerald-400' : result.basePattern.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-rose-400'}`}>
                      {result.basePattern.confidence}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7 Pillar 상세 */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">7 Pillar 평가 상세</h3>
              {pillarGroups.map((group) => {
                const groupDetails = details.filter((d) => group.pillars.includes(d.pillar));
                if (groupDetails.length === 0) return null;

                return (
                  <div key={group.label} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                      {group.icon}
                      {group.label}
                    </div>
                    {groupDetails.map((detail, idx) => (
                      <div key={`${detail.pillar}-${idx}`} className={`rounded-lg border px-4 py-3 ${statusBg(detail.status)}`}>
                        <div className="flex items-start gap-2">
                          <StatusIcon status={detail.status} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{detail.label}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                              {detail.value !== null && (
                                <span>값: <span className="font-mono text-slate-200">{detail.value}</span></span>
                              )}
                              {detail.threshold && (
                                <span>기준: <span className="text-slate-300">{detail.threshold}</span></span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{detail.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* 경고 목록 */}
            {canslimResult.warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">경고 및 참고 사항</h3>
                <div className="space-y-1">
                  {canslimResult.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-amber-400/80">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 데이터 경고 */}
            {result.dataWarnings.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">데이터 품질 경고</h4>
                {result.dataWarnings.map((w, i) => (
                  <div key={i} className="text-xs text-slate-500">{w}</div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
