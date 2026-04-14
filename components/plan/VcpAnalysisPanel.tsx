'use client';

import Card from '@/components/ui/Card';
import type { VcpAnalysis } from '@/types';
import { Activity, BarChart2, ChevronDown, Crosshair, HelpCircle, TrendingDown, Volume2 } from 'lucide-react';
import { useState } from 'react';

/**
 * VCP 분석 결과를 시각적으로 표시하는 패널
 * - VCP 종합 스코어 게이지 (0~100)
 * - 4가지 하위 지표 카드 (수축, 볼륨-건조화, BB-스퀴즈, Pocket Pivot)
 * - 수축 단계 테이블
 * - 진입/무효화 기준 비교 (VCP 피벗 vs 최근 고점 참고가)
 * - 판정 근거 텍스트
 */

interface VcpAnalysisPanelProps {
  analysis: VcpAnalysis;
}

const GRADE_COLORS = {
  strong: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', ring: 'ring-emerald-500' },
  forming: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40', ring: 'ring-amber-500' },
  weak: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40', ring: 'ring-orange-500' },
  none: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-600', ring: 'ring-slate-500' },
};

const GRADE_LABELS = {
  strong: '유력한 VCP 형성',
  forming: '초기 형성 중',
  weak: '약한 패턴',
  none: '감지 안 됨',
};

// --- VCP 하위 지표 판별 기준 설명 ---
const INDICATOR_CRITERIA = {
  contraction: {
    title: '수축 패턴 (Contraction)',
    criteria: [
      { label: '수축 횟수', standard: '2~6개', description: '상승 후 고점→저점 사이클이 2회 이상 반복되어야 합니다' },
      { label: '점진적 감소', standard: '이전보다 얕게', description: '각 수축의 깊이(%)가 이전 수축보다 줄어야 정상적 VCP입니다' },
      { label: '최종 수축 깊이', standard: '10% 이하 최적', description: '마지막 수축이 10% 미만이면 "타이트"한 패턴으로 가장 이상적입니다' },
    ],
    source: 'Minervini, "Trade Like a Stock Market Wizard"',
  },
  volumeDryUp: {
    title: '볼륨 건조화 (Volume Dry-Up)',
    criteria: [
      { label: '구간별 감소', standard: '좌→우 감소', description: '각 수축 구간의 평균 거래량이 점차 줄어들어야 합니다' },
      { label: '50일 평균 대비', standard: '50% 이하 최적', description: '최종 수축 구간 볼륨이 50일 평균의 절반 이하면 매우 건조한 상태입니다' },
    ],
    source: 'Minervini, "Think & Trade Like a Champion"',
  },
  bbSqueeze: {
    title: 'BB Squeeze (변동성 수축)',
    criteria: [
      { label: 'BB Width 백분위', standard: '하위 20%', description: '현재 볼린저 밴드 너비가 최근 120일 중 가장 좁은 20%에 들어야 Squeeze 상태입니다' },
      { label: 'BB Width 40% 이하', standard: '수축 진행 중', description: '하위 40%면 수축이 진행 중이며, 돌파가 임박할 수 있습니다' },
    ],
    source: 'Bollinger/Keltner Squeeze 학술 연구',
  },
  pocketPivot: {
    title: 'Pocket Pivot (기관 매집)',
    criteria: [
      { label: '상승일 볼륨', standard: '> 10일 하락 최대', description: '상승일 거래량이 최근 10일 하락일 거래량 최대치를 넘어야 합니다' },
      { label: '10일 이평선 근접', standard: '±3% 이내', description: '주가가 10일 이동평균선 근처(3% 이내)여야 유효한 시그널입니다' },
      { label: '감지 수', standard: '2개 이상 강력', description: '최근 20일 내 2건 이상 감지되면 강한 기관 매집 시그널로 봅니다' },
    ],
    source: 'Gil Morales & Chris Kacher, "Trade Like An O\'Neil Disciple"',
  },
};

export default function VcpAnalysisPanel({ analysis }: VcpAnalysisPanelProps) {
  const colors = GRADE_COLORS[analysis.grade];

  return (
    <Card className="space-y-6">
      {/* 헤더 + 스코어 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">3. VCP 분석</p>
          <h3 className="mt-1 text-xl font-bold text-white">VCP 매수 타점 분석</h3>
          <p className="mt-1 text-xs text-slate-400">
            Volatility Contraction Pattern · Minervini 기반
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${colors.bg} ${colors.text}`}>
            {GRADE_LABELS[analysis.grade]}
          </span>
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ring-4 ${colors.ring}/30`}
          >
            <span className={`font-mono text-xl font-bold ${colors.text}`}>{analysis.score}</span>
          </div>
        </div>
      </div>

      {/* 4가지 하위 지표 카드 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SubIndicatorCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="수축 패턴"
          value={analysis.contractionScore}
          detail={`${analysis.contractions.length}개 수축`}
          criteriaKey="contraction"
        />
        <SubIndicatorCard
          icon={<Volume2 className="h-4 w-4" />}
          label="볼륨 건조화"
          value={analysis.volumeDryUpScore}
          detail={analysis.contractions.length >= 2 ? '건조화 판정 완료' : '수축 부족'}
          criteriaKey="volumeDryUp"
        />
        <SubIndicatorCard
          icon={<BarChart2 className="h-4 w-4" />}
          label="BB Squeeze"
          value={analysis.bbSqueezeScore}
          detail={analysis.bbWidth !== null
            ? `Width ${analysis.bbWidth}% (하위 ${analysis.bbWidthPercentile}%)`
            : '데이터 부족'
          }
          criteriaKey="bbSqueeze"
        />
        <SubIndicatorCard
          icon={<Activity className="h-4 w-4" />}
          label="Pocket Pivot"
          value={analysis.pocketPivotScore}
          detail={`${analysis.pocketPivots.length}개 감지`}
          criteriaKey="pocketPivot"
        />
      </div>

      {/* 진입/무효화 기준 */}
      <div className={`rounded-lg border p-4 ${colors.border} ${colors.bg}`}>
        <div className="flex items-center gap-2">
          <Crosshair className={`h-4 w-4 ${colors.text}`} />
          <h4 className="text-sm font-semibold text-white">진입/무효화 기준</h4>
        </div>
        <div className="mt-3 grid gap-4 text-center sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-400">VCP 피벗</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">
              {analysis.pivotPrice !== null ? `$${analysis.pivotPrice.toFixed(2)}` : '—'}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">최종 수축 고점</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">최근 고점 참고가</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">
              ${analysis.breakoutPrice.toFixed(2)}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">피벗 보조 확인용</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">권장 진입가</p>
            <p className={`mt-1 font-mono text-lg font-bold ${colors.text}`}>
              ${analysis.recommendedEntry.toFixed(2)}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {analysis.entrySource === 'VCP_PIVOT' ? 'VCP 피벗 우선' : '최근 고점 참고'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">무효화 기준</p>
            <p className="mt-1 font-mono text-lg font-bold text-orange-200">
              {analysis.invalidationPrice !== null ? `$${analysis.invalidationPrice.toFixed(2)}` : '—'}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              거래량 {analysis.breakoutVolumeStatus === 'confirmed' ? '확인' : analysis.breakoutVolumeStatus === 'pending' ? '대기' : analysis.breakoutVolumeStatus === 'weak' ? '약함' : '정보 부족'}
              {analysis.breakoutVolumeRatio !== null ? ` · ${analysis.breakoutVolumeRatio}x` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* 수축 단계 테이블 */}
      {analysis.contractions.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-300">수축 단계 상세</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">고점</th>
                  <th className="py-2 pr-3">저점</th>
                  <th className="py-2 pr-3 text-right">깊이</th>
                  <th className="py-2 text-right">평균 거래량</th>
                </tr>
              </thead>
              <tbody>
                {analysis.contractions.map((c, i) => (
                  <tr key={`${c.peakDate}-${c.troughDate}`} className="border-b border-slate-800">
                    <td className="py-2 pr-3 font-mono text-slate-500">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-white">${c.peakPrice.toFixed(2)}</span>
                      <span className="ml-1 text-slate-500">{c.peakDate.slice(5)}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-white">${c.troughPrice.toFixed(2)}</span>
                      <span className="ml-1 text-slate-500">{c.troughDate.slice(5)}</span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={`font-mono font-semibold ${
                        i > 0 && c.depthPct < (analysis.contractions[i - 1]?.depthPct ?? 100)
                          ? 'text-emerald-400'
                          : 'text-orange-400'
                      }`}>
                        {c.depthPct.toFixed(1)}%
                      </span>
                      {i > 0 && c.depthPct < (analysis.contractions[i - 1]?.depthPct ?? 100) && (
                        <span className="ml-1 text-emerald-500">↓</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono text-slate-400">
                      {(c.avgVolume / 1000).toFixed(0)}K
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 판정 근거 */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-slate-400 transition-colors hover:text-slate-200">
          판정 근거 {analysis.details.length}건 ▸
        </summary>
        <ul className="mt-2 space-y-1">
          {analysis.details.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-5 text-slate-400">
              <span className="mt-0.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-600" />
              {d}
            </li>
          ))}
        </ul>
      </details>

      {/* Pocket Pivot 상세 (감지된 경우만) */}
      {analysis.pocketPivots.length > 0 && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <p className="text-xs font-semibold text-blue-300">
            🎯 Pocket Pivot 감지 ({analysis.pocketPivots.length}건)
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {analysis.pocketPivots.map((pp) => (
              <span
                key={pp.date}
                className="rounded-md border border-blue-500/30 bg-slate-900 px-2 py-1 font-mono text-xs text-blue-200"
              >
                {pp.date.slice(5)} · ${pp.close}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* VCP 판별 기준 안내 */}
      <VcpCriteriaGuide />
    </Card>
  );
}

/** 하위 지표 미니 카드 — 클릭 시 판별 기준 팝업 */
function SubIndicatorCard({
  icon,
  label,
  value,
  detail,
  criteriaKey,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  criteriaKey: keyof typeof INDICATOR_CRITERIA;
}) {
  const [showCriteria, setShowCriteria] = useState(false);
  const barColor =
    value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-slate-600';
  const textColor =
    value >= 70 ? 'text-emerald-400' : value >= 40 ? 'text-amber-400' : 'text-slate-400';
  const criteria = INDICATOR_CRITERIA[criteriaKey];

  return (
    <div className="relative rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-slate-400">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        {/* 물음표 아이콘 — 판별 기준 토글 */}
        <button
          type="button"
          onClick={() => setShowCriteria(!showCriteria)}
          className="rounded-full p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300"
          title="판별 기준 보기"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className={`font-mono text-lg font-bold ${textColor}`}>{value}</p>
      {/* 미니 바 */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">{detail}</p>

      {/* 판별 기준 팝업 */}
      {showCriteria && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-slate-600 bg-slate-900 p-3 shadow-xl shadow-black/40">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-white">{criteria.title}</p>
            <button
              type="button"
              onClick={() => setShowCriteria(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          </div>
          <table className="w-full text-[10px]">
            <tbody>
              {criteria.criteria.map((c) => (
                <tr key={c.label} className="border-t border-slate-800">
                  <td className="whitespace-nowrap py-1.5 pr-2 font-medium text-slate-300">{c.label}</td>
                  <td className="py-1.5 pr-2 font-mono text-emerald-400">{c.standard}</td>
                  <td className="py-1.5 text-slate-500">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[9px] italic text-slate-600">출처: {criteria.source}</p>
        </div>
      )}
    </div>
  );
}

/** VCP 판별 기준 전체 안내 (접기/펼치기) */
function VcpCriteriaGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-900/50"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-sky-400" />
          <span className="text-sm font-semibold text-slate-200">VCP 판별 기준 안내</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-700 p-4">
          <p className="mb-4 text-xs leading-5 text-slate-400">
            VCP(Volatility Contraction Pattern)는 Mark Minervini가 체계화한 매수 타점 모델입니다.
            상승 추세 중 변동성이 점차 줄어들다가, 피벗 포인트를 돌파하면 새로운 상승파가 시작됩니다.
            아래 4가지 레이어를 가중 합산하여 0~100점의 VCP 스코어를 산출합니다.
          </p>

          <div className="space-y-4">
            {(Object.entries(INDICATOR_CRITERIA) as [keyof typeof INDICATOR_CRITERIA, typeof INDICATOR_CRITERIA[keyof typeof INDICATOR_CRITERIA]][] ).map(([key, indicator]) => (
              <div key={key} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
                <p className="mb-2 text-xs font-bold text-white">{indicator.title}</p>
                <div className="space-y-1.5">
                  {indicator.criteria.map((c) => (
                    <div key={c.label} className="flex items-start gap-2 text-[11px]">
                      <span className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500/60" />
                      <div>
                        <span className="font-medium text-slate-300">{c.label}</span>
                        <span className="mx-1.5 font-mono text-emerald-400">{c.standard}</span>
                        <span className="text-slate-500">— {c.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[9px] italic text-slate-600">출처: {indicator.source}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
            <p className="text-xs leading-5 text-sky-200">
              <strong>스코어 등급:</strong>{' '}
              <span className="text-emerald-400">70~100 Strong</span> →{' '}
              <span className="text-amber-400">50~69 Forming</span> →{' '}
              <span className="text-orange-400">25~49 Weak</span> →{' '}
              <span className="text-slate-400">0~24 None</span>
            </p>
            <p className="mt-1 text-[10px] text-sky-300/70">
              VCP 스코어는 보조 지표이며, 저장을 차단하지 않습니다. 최종 매매 판단은 사용자가 내립니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
