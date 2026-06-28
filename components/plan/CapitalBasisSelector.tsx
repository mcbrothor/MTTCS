import { useEffect, useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { buildCapitalSnapshot } from '@/lib/finance/core/capital-basis';
import type { CapitalBasisKind, CapitalSnapshot, PortfolioRiskSummary } from '@/types';

interface CapitalBasisSelectorProps {
  market: 'US' | 'KR';
  basis: CapitalBasisKind;
  onBasisChange: (basis: CapitalBasisKind) => void;
  manualAmount: number;
  onManualAmountChange: (amount: number) => void;
  scenarioPct: number;
  onScenarioPctChange: (pct: number) => void;
  fallbackEquity: number;
  portfolioRisk: PortfolioRiskSummary | null;
  riskPercent: number;
  capturedAt: string;
  disabled?: boolean;
  onSnapshotChange: (snapshot: CapitalSnapshot) => void;
}

const basisOptions: { value: CapitalBasisKind; label: string; help: string }[] = [
  { value: 'CURRENT_ACCOUNT', label: '현재 계좌 기준', help: '현금과 보유 포지션 평가금액을 합친 현재 순자산을 사용합니다.' },
  { value: 'CONSERVATIVE', label: '보수적 기준', help: '현재 순자산에서 기존 포지션의 손절 리스크를 차감합니다.' },
  { value: 'AVAILABLE_CASH', label: '투자 가능 현금 기준', help: '신규 매수에 바로 쓸 수 있는 현금만 사용합니다.' },
  { value: 'MANUAL', label: '직접 입력', help: '임시 계산이나 외부 계좌를 반영할 때 사용합니다.' },
  { value: 'SCENARIO', label: '가상 시나리오', help: '자본이 늘거나 줄어든 상황을 가정해 수량을 확인합니다.' },
];

const currency = (value: number | null | undefined, market: 'US' | 'KR') => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(market === 'KR' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency: market === 'KR' ? 'KRW' : 'USD',
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  }).format(value);
};

export default function CapitalBasisSelector({
  market,
  basis,
  onBasisChange,
  manualAmount,
  onManualAmountChange,
  scenarioPct,
  onScenarioPctChange,
  fallbackEquity,
  portfolioRisk,
  riskPercent,
  capturedAt,
  disabled = false,
  onSnapshotChange,
}: CapitalBasisSelectorProps) {
  const snapshot = useMemo(() => buildCapitalSnapshot({
    basis,
    market,
    portfolio: portfolioRisk,
    fallbackEquity,
    manualAmount,
    scenarioPct,
    capturedAt,
  }), [basis, capturedAt, fallbackEquity, manualAmount, market, portfolioRisk, scenarioPct]);
  const selectedHelp = basisOptions.find((option) => option.value === basis)?.help;
  const plannedRisk = snapshot.amount * (riskPercent / 100);
  const capturedAtLabel = capturedAt ? new Date(capturedAt).toLocaleString('ko-KR') : '계좌 조회 전';

  useEffect(() => {
    onSnapshotChange(snapshot);
  }, [onSnapshotChange, snapshot]);

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-sky-300" />
            <p className="text-sm font-bold text-white">이번 계산에 사용할 자본 기준</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            계획 저장 시 선택한 기준과 계좌 상태가 함께 고정됩니다.
          </p>
        </div>
        <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-left lg:min-w-56 lg:text-right">
          <p className="text-xs text-sky-200">기준 금액</p>
          <p className="mt-1 font-mono text-xl font-bold text-white">{currency(snapshot.amount, market)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-slate-400">자본 기준</span>
          <select
            value={basis}
            onChange={(event) => onBasisChange(event.target.value as CapitalBasisKind)}
            disabled={disabled}
            className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
          >
            {basisOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="mt-2 min-h-5 text-xs leading-5 text-slate-500">{selectedHelp}</p>
        </label>

        {basis === 'MANUAL' ? (
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-400">직접 입력 금액</span>
            <input
              type="number"
              min="1"
              value={manualAmount}
              onChange={(event) => onManualAmountChange(Number(event.target.value))}
              disabled={disabled}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />
          </label>
        ) : basis === 'SCENARIO' ? (
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-400">자본 변화율 %</span>
            <input
              type="number"
              min="-90"
              max="200"
              step="1"
              value={scenarioPct}
              onChange={(event) => onScenarioPctChange(Number(event.target.value))}
              disabled={disabled}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />
          </label>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-400">기준 시각</p>
            <p className="mt-2 text-xs text-slate-300">{capturedAtLabel}</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniMetric label="총 평가자산" value={currency(snapshot.portfolio.totalEquity, market)} />
        <MiniMetric label="사용 가능 현금" value={currency(snapshot.portfolio.cash, market)} />
        <MiniMetric label="기존 손절 리스크" value={currency(snapshot.portfolio.totalOpenRisk, market)} />
        <MiniMetric label="남은 리스크 예산" value={currency(snapshot.portfolio.riskBudgetRemaining, market)} />
        <MiniMetric label="이번 거래 최대 손실" value={currency(plannedRisk, market)} accent />
      </div>

      {snapshot.fallbackUsed ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>계좌 값을 불러오지 못해 기본값 또는 직접 입력값을 사용 중입니다. 실제 계좌와 다르면 수량을 다시 계산하세요.</p>
        </div>
      ) : null}
    </div>
  );
}

function MiniMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-bold ${accent ? 'text-sky-200' : 'text-slate-100'}`}>{value}</p>
    </div>
  );
}
