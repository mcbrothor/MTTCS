import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import type { MarketAnalysisResponse, SepaCriterion } from '@/types';

interface SepaAnalysisProps {
  analysis: MarketAnalysisResponse;
}

export default function SepaAnalysis({ analysis }: SepaAnalysisProps) {
  const { sepaEvidence } = analysis;

  return (
    <Card>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">2. SEPA 분석</p>
          <h2 className="mt-1 text-xl font-bold text-white">Minervini Trend Template 판정 근거</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            데이터 출처: {analysis.providerUsed} · 일봉 {analysis.dataQuality.bars.toLocaleString()}개 · 티커 {analysis.ticker}
          </p>
        </div>
        <SummaryBadge status={sepaEvidence.status} />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Summary label="통과" value={sepaEvidence.summary.passed} className="text-emerald-300" />
        <Summary label="실패" value={sepaEvidence.summary.failed} className="text-red-300" />
        <Summary label="정보" value={sepaEvidence.summary.info} className="text-sky-300" />
      </div>

      {analysis.warnings.length > 0 && (
        <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            데이터 품질 안내
          </div>
          <ul className="space-y-1 text-sm leading-6 text-amber-100/80">
            {analysis.warnings.map((warning) => (
              <li key={warning}>- {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-3">판정</th>
              <th className="py-3">조건</th>
              <th className="py-3">실제 값</th>
              <th className="py-3">기준</th>
              <th className="py-3">의미</th>
            </tr>
          </thead>
          <tbody>
            {sepaEvidence.criteria.map((item) => (
              <CriterionRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-5 rounded-lg border border-slate-700 bg-slate-950/50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">판정 로직 보기</summary>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          가격과 거래량 기반 핵심 조건 중 실패가 하나라도 있으면 SEPA는 Fail로 처리합니다. 공식 RS Rating은 현재 연동 API에서 제공되지 않아
          SPY 대비 6개월 상대강도 프록시로 대체합니다. 기본적 데이터가 없거나 제한적이면 저장 차단이 아닌 정보 항목으로 표시합니다.
        </p>
      </details>
    </Card>
  );
}

function SummaryBadge({ status }: { status: string }) {
  const config = {
    pass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    fail: 'border-red-500/40 bg-red-500/10 text-red-200',
  }[status] || 'border-slate-500/40 bg-slate-500/10 text-slate-200';

  const label = status === 'fail' ? '저장 차단' : '통과';

  return (
    <div className={`rounded-lg border px-4 py-3 text-right ${config}`}>
      <p className="text-xs">SEPA 상태</p>
      <p className="font-bold">{label}</p>
    </div>
  );
}

function Summary({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${className}`}>{value}</p>
    </div>
  );
}

function CriterionRow({ item }: { item: SepaCriterion }) {
  const icon =
    item.status === 'pass' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
    ) : item.status === 'fail' ? (
      <XCircle className="h-4 w-4 text-red-300" />
    ) : (
      <Info className="h-4 w-4 text-sky-300" />
    );

  const label = item.status === 'pass' ? 'Pass' : item.status === 'fail' ? 'Fail' : 'Info';

  return (
    <tr className="border-b border-slate-800 align-top">
      <td className="py-3">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
      </td>
      <td className="py-3 font-medium text-white">{item.label}</td>
      <td className="py-3 font-mono">{item.actual ?? '-'}</td>
      <td className="py-3">{item.threshold}</td>
      <td className="py-3 text-slate-400">{item.description}</td>
    </tr>
  );
}
