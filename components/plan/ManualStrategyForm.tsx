import { useEffect, useMemo, useRef, useState } from 'react';
import { Target } from 'lucide-react';
import AnalysisChartContainer from '@/components/analysis/AnalysisChartContainer';
import Card from '@/components/ui/Card';
import { calculateManualRiskPlan } from '@/lib/finance/core/position-sizing';
import type { Direction, RiskPlan } from '@/types';

export interface ManualStrategyDraft {
  ticker: string;
  exchange: string;
  direction: Direction;
  totalEquity: number;
  riskPercent: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  planNote: string;
  setupTags: string[];
  riskPlan: RiskPlan;
}

interface ManualStrategyFormProps {
  initialTicker?: string;
  initialExchange?: string;
  initialTotalEquity: number;
  market: 'US' | 'KR';
  onChange: (draft: ManualStrategyDraft) => void;
}

export default function ManualStrategyForm({
  initialTicker = '',
  initialExchange = 'NAS',
  initialTotalEquity,
  market,
  onChange,
}: ManualStrategyFormProps) {
  const previousInitialTotalEquity = useRef(initialTotalEquity);
  const [ticker, setTicker] = useState(initialTicker.toUpperCase());
  const [exchange, setExchange] = useState(initialExchange);
  const [direction, setDirection] = useState<Direction>('LONG');
  const [totalEquity, setTotalEquity] = useState(initialTotalEquity);
  const [riskPercent, setRiskPercent] = useState(1);
  const [entryPrice, setEntryPrice] = useState(0);
  const [stopPrice, setStopPrice] = useState(0);
  const [targetPrice, setTargetPrice] = useState(0);
  const [planNote, setPlanNote] = useState('');
  const [setupTagInput, setSetupTagInput] = useState('manual');

  useEffect(() => {
    if (initialTotalEquity <= 0) return;
    setTotalEquity((current) => (
      current <= 0 || current === previousInitialTotalEquity.current
        ? initialTotalEquity
        : current
    ));
    previousInitialTotalEquity.current = initialTotalEquity;
  }, [initialTotalEquity]);

  const riskPlan = useMemo(() => calculateManualRiskPlan(
    totalEquity,
    entryPrice,
    stopPrice,
    targetPrice,
    riskPercent / 100,
    { direction, market }
  ), [direction, entryPrice, market, riskPercent, stopPrice, targetPrice, totalEquity]);
  const setupTags = useMemo(() => setupTagInput
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12), [setupTagInput]);
  const invalidMessage =
    entryPrice <= 0 || stopPrice <= 0 || targetPrice <= 0
      ? '진입가, 손절가, 목표가를 모두 입력하면 수량과 R/R이 계산됩니다.'
      : riskPlan.riskPerShare <= 0
        ? direction === 'LONG'
          ? 'LONG 수동 계획은 손절가가 진입가보다 낮아야 합니다.'
          : 'SHORT 수동 계획은 손절가가 진입가보다 높아야 합니다.'
        : riskPlan.rewardRiskRatio === null
          ? direction === 'LONG'
            ? 'LONG 수동 계획은 목표가가 진입가보다 높아야 합니다.'
            : 'SHORT 수동 계획은 목표가가 진입가보다 낮아야 합니다.'
          : riskPlan.totalShares <= 0
            ? '허용 손실 대비 주당 리스크가 커서 최소 1주를 산출할 수 없습니다.'
            : null;

  useEffect(() => {
    onChange({
      ticker: ticker.trim().toUpperCase(),
      exchange,
      direction,
      totalEquity,
      riskPercent,
      entryPrice,
      stopPrice,
      targetPrice,
      planNote,
      setupTags,
      riskPlan,
    });
  }, [direction, entryPrice, exchange, onChange, planNote, riskPercent, riskPlan, setupTags, stopPrice, targetPrice, ticker, totalEquity]);

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-400">Manual Strategy</p>
          <h2 className="mt-1 text-xl font-bold text-white">수동 전략 산출</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            사용자가 정한 진입가, 손절가, 목표가로 포지션 수량과 R/R을 계산합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
          <label className="block lg:col-span-2">
            <span className="mb-2 block text-sm font-medium text-slate-300">티커</span>
            <input
              type="text"
              autoComplete="off"
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="예: AAPL"
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm uppercase text-white outline-none transition-colors placeholder:text-slate-500 focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">거래소</span>
            <select
              value={exchange}
              onChange={(event) => setExchange(event.target.value)}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            >
              <option value="NAS">NASDAQ</option>
              <option value="NYS">NYSE</option>
              <option value="AMS">AMEX</option>
              <option value="KOSPI">KOSPI</option>
              <option value="KOSDAQ">KOSDAQ</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">방향</span>
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as Direction)}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            >
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">총 자본</span>
            <input
              type="number"
              min="1"
              value={totalEquity}
              onChange={(event) => setTotalEquity(Number(event.target.value))}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">허용 손실 %</span>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={riskPercent}
              onChange={(event) => setRiskPercent(Number(event.target.value))}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <PriceInput label="진입가 Entry" value={entryPrice} onChange={setEntryPrice} />
          <PriceInput label="손절가 Stop" value={stopPrice} onChange={setStopPrice} />
          <PriceInput label="목표가 Target" value={targetPrice} onChange={setTargetPrice} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">계획 메모</span>
            <textarea
              value={planNote}
              onChange={(event) => setPlanNote(event.target.value)}
              rows={3}
              placeholder="진입 근거, 무효화 조건, 실행 시 주의할 점"
              className="block w-full resize-none rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">셋업 태그</span>
            <input
              type="text"
              value={setupTagInput}
              onChange={(event) => setSetupTagInput(event.target.value)}
              placeholder="manual, pullback"
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />
            <p className="mt-2 text-xs text-slate-500">쉼표로 여러 태그를 구분합니다.</p>
          </label>
        </div>

        <div className={`mt-5 rounded-lg border px-4 py-3 text-sm ${invalidMessage ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-sky-500/30 bg-sky-500/10 text-sky-100'}`}>
          <div className="flex items-start gap-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {invalidMessage || `계획 수량 ${riskPlan.totalShares.toLocaleString()}주 · R/R ${riskPlan.rewardRiskRatio?.toFixed(2)}R · 주당 리스크 ${riskPlan.riskPerShare.toLocaleString()}`}
            </p>
          </div>
        </div>
      </Card>

      {ticker.trim() ? (
        <div className="h-[620px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
          <AnalysisChartContainer
            ticker={ticker.trim().toUpperCase()}
            exchange={exchange}
            pivotPrice={entryPrice > 0 ? entryPrice : null}
            stopLossPrice={stopPrice > 0 ? stopPrice : null}
            targetPrice={targetPrice > 0 ? targetPrice : null}
            pivotLabel="Entry"
            initialSource="mtn"
          />
        </div>
      ) : null}
    </div>
  );
}

function PriceInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value || ''}
        onChange={(event) => onChange(Number(event.target.value))}
        className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
      />
    </label>
  );
}
