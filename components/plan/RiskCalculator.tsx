import Card from '@/components/ui/Card';
import type { RiskPlan } from '@/types';

interface RiskCalculatorProps {
  riskPlan: RiskPlan;
}

const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

export default function RiskCalculator({ riskPlan }: RiskCalculatorProps) {
  const legs = [riskPlan.entryTargets.e1, riskPlan.entryTargets.e2, riskPlan.entryTargets.e3];
  const riskPct = (riskPlan.riskPercent * 100).toFixed(1).replace('.0', '');

  return (
    <Card>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">4. 리스크/포지션 사이징</p>
          <h2 className="mt-1 text-xl font-bold text-white">Minervini식 손실 제한 기반 진입 계획</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            VCP 피벗 진입가와 패턴 무효화선을 기준으로 최대 손실, 총 수량, 선택적 추가매수 후보가를 계산합니다.
          </p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-right">
          <p className="text-xs text-emerald-300">최대 허용 손실</p>
          <p className="font-mono text-xl font-bold text-white">{currency(riskPlan.maxRisk)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="허용 손실" value={`${riskPct}%`} />
        <Metric label="ATR 참고값" value={riskPlan.atr.toFixed(2)} />
        <Metric label="피벗 진입가" value={currency(riskPlan.entryPrice)} />
        <Metric label="초기 손절가" value={currency(riskPlan.stopLossPrice)} danger />
        <Metric label="총 수량" value={`${riskPlan.totalShares.toLocaleString()}주`} />
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-3">단계</th>
              <th className="py-3 text-right">기준가</th>
              <th className="py-3 text-right">수량</th>
              <th className="py-3 text-right">스탑 기준</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, index) => {
              const stop =
                index === 0
                  ? riskPlan.trailingStops.initial
                  : index === 1
                    ? riskPlan.trailingStops.afterEntry2
                    : riskPlan.trailingStops.afterEntry3;
              return (
                <tr key={leg.label} className="border-b border-slate-800">
                  <td className="py-3 font-medium text-white">{leg.label}</td>
                  <td className="py-3 text-right font-mono">{currency(leg.price)}</td>
                  <td className="py-3 text-right font-mono">{leg.shares > 0 ? `${leg.shares.toLocaleString()}주` : '수동'}</td>
                  <td className="py-3 text-right font-mono text-orange-300">{currency(stop)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-5 rounded-lg border border-slate-700 bg-slate-950/50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">계산식 보기</summary>
        <div className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
          <p>최대 허용 손실 = 총 자본 x 허용 손실 비율</p>
          <p>초기 손절가 = 패턴 무효화선과 진입가 대비 8% 손실 캡 중 더 가까운 가격</p>
          <p>총 수량 = 최대 허용 손실 / 주당 위험금액</p>
          <p>추가매수 후보가는 고정 ATR 간격이 아니라, 피벗 돌파 후 수익 방향 확인용 참고가입니다.</p>
        </div>
      </details>
    </Card>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 font-mono text-lg font-bold ${danger ? 'text-orange-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}
