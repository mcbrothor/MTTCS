import Card from '@/components/ui/Card';
import type { RiskPlan } from '@/types';

interface RiskCalculatorProps {
  riskPlan: RiskPlan;
}

const currency = (value: number, market: 'US' | 'KR' = 'US') =>
  new Intl.NumberFormat(market === 'KR' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency: market === 'KR' ? 'KRW' : 'USD',
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  }).format(value);

export default function RiskCalculator({ riskPlan }: RiskCalculatorProps) {
  const legs = [riskPlan.entryTargets.e1, riskPlan.entryTargets.e2, riskPlan.entryTargets.e3];
  const market = riskPlan.riskPolicy?.market ?? 'US';
  const pyramidPlan = riskPlan.pyramidPlan ?? null;
  const riskPct = (riskPlan.riskPercent * 100).toFixed(1).replace('.0', '');
  const gateClass =
    riskPlan.riskGate?.status === 'BLOCK'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
      : riskPlan.riskGate?.status === 'REDUCE'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  const strategyLabel =
    riskPlan.strategy === 'HIGH_TIGHT_FLAG'
      ? 'HTF 공격형'
      : riskPlan.strategy === 'ATR_VOLATILITY'
        ? 'ATR 변동성'
        : riskPlan.strategy === 'ONL_PYRAMID'
          ? 'ONL 50/30/20 피라미딩'
        : riskPlan.strategy === 'MANUAL_FIXED_RISK'
          ? '수동 고정 리스크'
        : riskPlan.strategy === 'CONSERVATIVE'
          ? '보수적 절반 리스크'
          : 'VCP 표준';
  const isManual = riskPlan.strategy === 'MANUAL_FIXED_RISK';

  return (
    <Card>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">4. 리스크/포지션 사이징</p>
          <h2 className="mt-1 text-xl font-bold text-white">{isManual ? '수동 입력값 기반 진입 계획' : 'Minervini식 손실 제한 기반 진입 계획'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {isManual
              ? '사용자가 입력한 진입가, 손절가, 목표가를 기준으로 최대 손실, 총 수량, R/R을 계산합니다.'
              : 'VCP 피벗 진입가와 패턴 무효화선을 기준으로 최대 손실, 총 수량, 선택적 추가매수 후보가를 계산합니다.'}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-right">
          <p className="text-xs text-emerald-300">최대 허용 손실</p>
          <p className="font-mono text-xl font-bold text-white">{currency(riskPlan.maxRisk, market)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="허용 손실" value={`${riskPct}%`} />
        <Metric label="ATR 참고값" value={riskPlan.atr.toFixed(2)} />
        <Metric label="피벗 진입가" value={currency(riskPlan.entryPrice, market)} />
        <Metric label="초기 손절가" value={currency(riskPlan.stopLossPrice, market)} danger />
        <Metric label="총 수량" value={`${riskPlan.totalShares.toLocaleString()}주`} />
      </div>

      <div className={`mt-4 rounded-lg border px-4 py-3 ${gateClass}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide">Risk Gate: {riskPlan.riskGate?.status || 'PASS'}</p>
            <p className="mt-1 text-sm">
              {strategyLabel} · Stop {riskPlan.stopQuality || 'UNKNOWN'} ·
              {typeof riskPlan.rewardRiskRatio === 'number' ? ` ${riskPlan.rewardRiskRatio.toFixed(1)}R target` : ' target 미정'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right text-xs md:min-w-64">
            <div>
              <p className="text-slate-400">Risk Budget</p>
              <p className="font-mono font-bold text-white">{currency(riskPlan.riskGate?.riskBudgetRemaining ?? riskPlan.maxRisk, market)}</p>
            </div>
            <div>
              <p className="text-slate-400">Allowed</p>
              <p className="font-mono font-bold text-white">{currency(riskPlan.riskGate?.allowedRiskAmount ?? riskPlan.maxRisk, market)}</p>
            </div>
          </div>
        </div>
        {riskPlan.riskGate?.reasons && riskPlan.riskGate.reasons.length > 0 && (
          <div className="mt-3 space-y-1 text-xs">
            {riskPlan.riskGate.reasons.map((item) => (
              <p key={`${item.code}:${item.message}`}>{item.message}</p>
            ))}
          </div>
        )}
      </div>

      {pyramidPlan && (
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric label="완성 포지션" value={currency(pyramidPlan.completedAmount, market)} />
          <Metric label="완성 평균가" value={currency(pyramidPlan.completedAveragePrice, market)} />
          <Metric label="E3 최소 손절" value={currency(pyramidPlan.minimumStopAfterEntry3, market)} danger />
          <Metric label="E3 권장 손절" value={currency(pyramidPlan.recommendedStopAfterEntry3, market)} />
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-3">단계</th>
              <th className="py-3 text-right">기준가</th>
              <th className="py-3 text-right">계획금액</th>
              <th className="py-3 text-right">수량</th>
              <th className="py-3 text-right">누적리스크</th>
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
                  <td className="py-3 text-right font-mono">{currency(leg.price, market)}</td>
                  <td className="py-3 text-right font-mono">{typeof leg.amount === 'number' ? currency(leg.amount, market) : '-'}</td>
                  <td className="py-3 text-right font-mono">{leg.shares > 0 ? `${leg.shares.toLocaleString()}주` : '수동'}</td>
                  <td className="py-3 text-right font-mono">{typeof leg.openRisk === 'number' ? currency(leg.openRisk, market) : '-'}</td>
                  <td className="py-3 text-right font-mono text-orange-300">{currency(stop, market)}</td>
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
          <p>초기 손절가 = {isManual ? '사용자가 입력한 stop 가격' : '선택한 리스크 전략의 패턴 무효화선, 최대 손실 캡, ATR 스탑 중 정책상 허용되는 가격'}</p>
          <p>총 수량 = 최대 허용 손실 / 주당 위험금액</p>
          {pyramidPlan && <p>ONL 피라미딩 = 완성 포지션을 50%/30%/20%로 나누고, E3 이후 손절을 최소 리스크 보존선 이상으로 올립니다.</p>}
          <p>추가매수 후보가는 전략에 따라 고정 퍼센트 또는 ATR 간격으로 계산됩니다.</p>
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
