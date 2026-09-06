'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import LightweightChart from '@/components/analysis/LightweightChart';
import type { SetupEvidenceSnapshot } from '@/lib/finance/engines/qullamaggie-evidence';
import type { ChartPatternOverlay } from '@/types';

interface QullamaggieEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  exchange: string;
  snapshotId?: string | null;
}

export default function QullamaggieEvidenceModal({
  isOpen,
  onClose,
  ticker,
  exchange,
  snapshotId,
}: QullamaggieEvidenceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SetupEvidenceSnapshot | null>(null);
  const [selectedCriterionId, setSelectedCriterionId] = useState<string | null>(null);
  const [showBaseComparison, setShowBaseComparison] = useState(false);
  const [showScoreTrace, setShowScoreTrace] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSnapshot(null);
      setError(null);
      setSelectedCriterionId(null);
      return;
    }

    if (!snapshotId) {
      setError('저장된 증거 스냅샷 ID가 없습니다. (이전 스캔 결과는 차트 근거 미보관)');
      return;
    }

    async function fetchSnapshot() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/scanner/qullamaggie/evidence/${snapshotId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('해당 스캔 증거 스냅샷을 찾을 수 없습니다. (만료되었거나 재생성 필요)');
          }
          throw new Error(`스냅샷 조회 실패 (${res.status})`);
        }
        const json = await res.json();
        if (json.data?.snapshot) {
          setSnapshot(json.data.snapshot);
        } else {
          throw new Error('올바르지 않은 스냅샷 데이터 구조입니다.');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
      } finally {
        setLoading(false);
      }
    }

    fetchSnapshot();
  }, [isOpen, snapshotId]);

  if (!isOpen) return null;

  // Chart Point 변환
  const chartBars = (snapshot?.bars || []).map((b) => ({
    time: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  // SetupAnnotation -> ChartPatternOverlay 변환
  const patternOverlays: ChartPatternOverlay[] = [];
  if (snapshot) {
    const selectedCriterion = snapshot.criteria.find((c) => c.id === selectedCriterionId);
    const activeAnnotationIds = new Set(selectedCriterion ? selectedCriterion.annotationIds : []);

    for (const anno of snapshot.annotations) {
      const isFocused = activeAnnotationIds.size === 0 || activeAnnotationIds.has(anno.id);
      if (!isFocused && activeAnnotationIds.size > 0) continue;

      if (anno.type === 'price-zone') {
        patternOverlays.push({
          id: anno.id,
          type: 'SUPPORT_RESISTANCE',
          label: anno.label,
          status: 'CONFIRMED',
          confidence: 100,
          dateRange: { start: anno.startDate, end: anno.endDate },
          priceRange: { low: anno.lowPrice, high: anno.highPrice },
          anchors: [],
          lines: [],
          zones: [
            {
              id: `${anno.id}_zone`,
              label: anno.label,
              category: 'base',
              startDate: anno.startDate,
              endDate: anno.endDate,
              low: anno.lowPrice,
              high: anno.highPrice,
            },
          ],
          markers: [],
          evidence: {},
        });
      } else if (anno.type === 'price-line') {
        patternOverlays.push({
          id: anno.id,
          type: 'SUPPORT_RESISTANCE',
          label: anno.label,
          status: 'CONFIRMED',
          confidence: 100,
          dateRange: { start: anno.startDate, end: anno.endDate },
          priceRange: { low: anno.price, high: anno.price },
          anchors: [],
          lines: [
            {
              id: `${anno.id}_line`,
              label: anno.label,
              category: 'pivot',
              points: [
                { date: anno.startDate, price: anno.price },
                { date: anno.endDate, price: anno.price },
              ],
              style: anno.style,
            },
          ],
          zones: [],
          markers: [],
          evidence: {},
        });
      } else if (anno.type === 'price-marker') {
        patternOverlays.push({
          id: anno.id,
          type: 'SUPPORT_RESISTANCE',
          label: anno.label,
          status: 'CONFIRMED',
          confidence: 100,
          dateRange: { start: anno.date, end: anno.date },
          priceRange: { low: anno.price, high: anno.price },
          anchors: [],
          lines: [],
          zones: [],
          markers: [
            {
              id: `${anno.id}_marker`,
              label: anno.label,
              category: 'pattern',
              date: anno.date,
              price: anno.price,
              shape: anno.shape,
            },
          ],
          evidence: {},
        });
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/70">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-white">{ticker}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{exchange}</span>
            </div>
            {snapshot && (
              <div className="flex items-center gap-3 text-xs">
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 font-semibold text-emerald-300">
                  {snapshot.decision.primarySetup}
                </span>
                <span className="text-slate-400">
                  Q-Score: <strong className="text-white">{snapshot.analysis.qScore}</strong>
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">
                  판정 기준봉: <span className="text-slate-200 font-mono">{snapshot.provenance.asOfBarDate}</span>
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <LoadingSpinner size="lg" />
              <p className="mt-4 text-sm font-medium">동일 시세 스냅샷 및 셋업 판정 근거 로딩 중...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-rose-400" />
              <h4 className="mt-3 text-base font-bold text-white">판정 근거 조회 불가</h4>
              <p className="mt-1 text-sm text-slate-300">{error}</p>
              <Button onClick={onClose} variant="secondary" className="mt-4">
                닫기
              </Button>
            </div>
          )}

          {snapshot && !loading && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 왼쪽/상단: 동일 시세 차트 영역 (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-sky-400" />
                      MTN Pro 쿨라매기 판정 동일 시세 차트 ({snapshot.provenance.barCount}봉)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      제공: {snapshot.provenance.provider} · 불변 스냅샷
                    </span>
                  </div>
                  <div className="h-[380px] w-full">
                    <LightweightChart
                      data={chartBars}
                      pivotPrice={snapshot.analysis.pivotPrice}
                      stopLossPrice={snapshot.analysis.stopPrice}
                      targetPrice={snapshot.analysis.target3R}
                      pivotLabel="피벗 기준가"
                      chartPatterns={patternOverlays}
                      height={380}
                    />
                  </div>
                </div>

                {/* 리스크 & 목표가 요약 바 */}
                <div className="grid grid-cols-4 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center text-xs">
                  <div>
                    <div className="text-slate-500">판정 종가</div>
                    <div className="mt-0.5 font-bold text-slate-200">
                      {snapshot.analysis.currentPrice?.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">피벗 기준선</div>
                    <div className="mt-0.5 font-bold text-sky-400">
                      {snapshot.analysis.pivotPrice?.toLocaleString() ?? '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">손절 기준선</div>
                    <div className="mt-0.5 font-bold text-rose-400">
                      {snapshot.analysis.stopPrice?.toLocaleString() ?? '-'} ({snapshot.analysis.stopPct}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">3R 목표가</div>
                    <div className="mt-0.5 font-bold text-emerald-400">
                      {snapshot.analysis.target3R?.toLocaleString() ?? '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 오른쪽/하단: 조건 목록 및 점수 트레이스 (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <h4 className="text-sm font-bold text-white flex items-center justify-between mb-3">
                    <span>셋업 판단 조건 목록 (Criteria)</span>
                    <span className="text-xs font-normal text-slate-400">
                      조건 클릭 시 차트 강조
                    </span>
                  </h4>

                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {snapshot.criteria.map((crit) => {
                      const isSelected = selectedCriterionId === crit.id;
                      const isPass = crit.result === 'pass';
                      const isWarning = crit.role === 'warning';

                      return (
                        <div
                          key={crit.id}
                          onClick={() => setSelectedCriterionId(isSelected ? null : crit.id)}
                          className={`cursor-pointer rounded-lg border p-3 text-xs transition-all ${
                            isSelected
                              ? 'border-sky-400 bg-sky-500/10 shadow-sm'
                              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {isWarning ? (
                                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                              ) : isPass ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-slate-500 shrink-0" />
                              )}
                              <span className="font-semibold text-slate-200">{crit.name}</span>
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                isPass
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : isWarning
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {isPass ? '충족' : isWarning ? '경고' : '미충족'}
                            </span>
                          </div>

                          <div className="mt-2 text-slate-400 space-y-1">
                            <div className="flex justify-between">
                              <span>기준:</span>
                              <span className="text-slate-300">{crit.rule.thresholdText}</span>
                            </div>
                            {crit.inputs.map((inp) => (
                              <div key={inp.name} className="flex justify-between text-[11px]">
                                <span className="text-slate-500">{inp.name}:</span>
                                <span className="text-slate-300 font-mono">
                                  {inp.value !== null && inp.value !== undefined
                                    ? String(inp.value)
                                    : '-'}{' '}
                                  {inp.unit || ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 왜 이 베이스인가? 비교 아코디언 */}
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <button
                    onClick={() => setShowBaseComparison(!showBaseComparison)}
                    className="flex w-full items-center justify-between text-xs font-bold text-slate-300 hover:text-white"
                  >
                    <span>왜 이 베이스가 선정되었는가? (후보군 비교)</span>
                    {showBaseComparison ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>

                  {showBaseComparison && (
                    <div className="mt-3 space-y-2 pt-2 border-t border-slate-800">
                      {snapshot.baseCandidates.map((c) => (
                        <div
                          key={c.id}
                          className={`rounded-lg border p-2 text-[11px] ${
                            c.selected
                              ? 'border-sky-500/40 bg-sky-500/10'
                              : 'border-slate-800/80 bg-slate-900/30 text-slate-400'
                          }`}
                        >
                          <div className="flex justify-between font-semibold">
                            <span className={c.selected ? 'text-sky-300' : 'text-slate-300'}>
                              {c.baseDays}봉 후보 ({c.startDate} ~ {c.endDate})
                            </span>
                            <span className="font-mono">
                              베이스 평점: <strong>{c.score}점</strong> {c.selected && '★ 선정'}
                            </span>
                          </div>
                          <div className="mt-1 flex gap-3 text-[10px] text-slate-400">
                            <span>Range: {c.baseRangePct}%</span>
                            <span>피벗이격: {c.distanceToPivotPct}%</span>
                            <span>거래량수축: {c.volumeDryUpRatio ?? '-'}배</span>
                            <span>저점지지: {c.higherLows ? 'O' : 'X'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Q-Score 세부 기여도 아코디언 */}
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <button
                    onClick={() => setShowScoreTrace(!showScoreTrace)}
                    className="flex w-full items-center justify-between text-xs font-bold text-slate-300 hover:text-white"
                  >
                    <span>Q-Score 6개 영역 가중 기여도 상세</span>
                    {showScoreTrace ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>

                  {showScoreTrace && (
                    <div className="mt-3 space-y-2 pt-2 border-t border-slate-800">
                      {snapshot.scoreTrace.map((st) => (
                        <div key={st.key} className="flex items-center justify-between text-xs">
                          <div>
                            <div className="font-medium text-slate-300">{st.name}</div>
                            <div className="text-[10px] text-slate-500">{st.detail}</div>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-slate-200">{st.score}점</span>
                            <span className="text-slate-500 text-[10px] ml-1">
                              (×{st.weightPct}% = +{st.weightedScore})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-3 bg-slate-950/70 text-xs text-slate-500">
          <span>Qullamaggie Setup Evidence System · 불변성 및 설명가능성 보장</span>
          <Button onClick={onClose} variant="secondary" size="sm">
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
