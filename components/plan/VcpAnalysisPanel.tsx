'use client';

import Card from '@/components/ui/Card';
import type { VcpAnalysis } from '@/types';
import { Activity, BarChart2, Crosshair, TrendingDown, Volume2 } from 'lucide-react';

/**
 * VCP 분석 결과를 시각적으로 표시하는 패널
 * - VCP 종합 스코어 게이지 (0~100)
 * - 4가지 하위 지표 카드 (수축, 볼륨-건조화, BB-스퀴즈, Pocket Pivot)
 * - 수축 단계 테이블
 * - 진입가 비교 (VCP 피벗 vs 20일 돌파가)
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

export default function VcpAnalysisPanel({ analysis }: VcpAnalysisPanelProps) {
  const colors = GRADE_COLORS[analysis.grade];

  return (
    <Card className="space-y-6">
      {/* 헤더 + 스코어 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">VCP 매수 타점 분석</h3>
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
        />
        <SubIndicatorCard
          icon={<Volume2 className="h-4 w-4" />}
          label="볼륨 건조화"
          value={analysis.volumeDryUpScore}
          detail={analysis.bbWidthPercentile !== null ? `건조화 진행` : '판정 불가'}
        />
        <SubIndicatorCard
          icon={<BarChart2 className="h-4 w-4" />}
          label="BB Squeeze"
          value={analysis.bbSqueezeScore}
          detail={analysis.bbWidth !== null
            ? `Width ${analysis.bbWidth}% (하위 ${analysis.bbWidthPercentile}%)`
            : '데이터 부족'
          }
        />
        <SubIndicatorCard
          icon={<Activity className="h-4 w-4" />}
          label="Pocket Pivot"
          value={analysis.pocketPivotScore}
          detail={`${analysis.pocketPivots.length}개 감지`}
        />
      </div>

      {/* 진입가 비교 */}
      <div className={`rounded-lg border p-4 ${colors.border} ${colors.bg}`}>
        <div className="flex items-center gap-2">
          <Crosshair className={`h-4 w-4 ${colors.text}`} />
          <h4 className="text-sm font-semibold text-white">진입가 비교</h4>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-400">VCP 피벗</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">
              {analysis.pivotPrice !== null ? `$${analysis.pivotPrice.toFixed(2)}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">20일 돌파가</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">
              ${analysis.breakoutPrice.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">권장 진입가</p>
            <p className={`mt-1 font-mono text-lg font-bold ${colors.text}`}>
              ${analysis.recommendedEntry.toFixed(2)}
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
    </Card>
  );
}

/** 하위 지표 미니 카드 */
function SubIndicatorCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  const barColor =
    value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-slate-600';
  const textColor =
    value >= 70 ? 'text-emerald-400' : value >= 40 ? 'text-amber-400' : 'text-slate-400';

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`font-mono text-lg font-bold ${textColor}`}>{value}</p>
      {/* 미니 바 */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}
