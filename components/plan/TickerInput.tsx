import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Search } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import CapitalBasisSelector from './CapitalBasisSelector';
import type { CapitalBasisKind, CapitalSnapshot, PortfolioRiskSummary, RiskStrategy } from '@/types';

interface TickerInputProps {
  onAnalyze: (ticker: string, exchange: string, totalEquity: number, riskPercent: number, riskStrategy: RiskStrategy, capitalSnapshot: CapitalSnapshot) => void;
  loading: boolean;
  initialTicker?: string;
  initialExchange?: string;
  initialTotalEquity?: number;
  portfolioRisk: PortfolioRiskSummary | null;
  capitalCapturedAt: string;
}

interface TickerLookupState {
  status: 'idle' | 'loading' | 'found' | 'not-found';
  name: string | null;
  symbol: string | null;
  message: string | null;
}

interface SecurityLookupResponse {
  name: string;
  symbol: string | null;
}

export default function TickerInput({
  onAnalyze,
  loading,
  initialTicker = '',
  initialExchange = 'NAS',
  initialTotalEquity = 50000,
  portfolioRisk,
  capitalCapturedAt,
}: TickerInputProps) {
  const previousInitialTotalEquity = useRef(initialTotalEquity);
  const [ticker, setTicker] = useState(initialTicker.toUpperCase());
  const [exchange, setExchange] = useState(initialExchange);
  const [capitalBasis, setCapitalBasis] = useState<CapitalBasisKind>('CURRENT_ACCOUNT');
  const [manualCapital, setManualCapital] = useState(initialTotalEquity);
  const [scenarioPct, setScenarioPct] = useState(-10);
  const [capitalSnapshot, setCapitalSnapshot] = useState<CapitalSnapshot | null>(null);
  const [riskPercent, setRiskPercent] = useState(1);
  const [riskStrategy, setRiskStrategy] = useState<RiskStrategy>('AUTO');
  const [lookup, setLookup] = useState<TickerLookupState>({
    status: 'idle',
    name: null,
    symbol: null,
    message: null,
  });

  const normalizedTicker = ticker.trim().toUpperCase();

  useEffect(() => {
    if (initialTotalEquity <= 0) return;
    setManualCapital((current) => (
      current <= 0 || current === previousInitialTotalEquity.current
        ? initialTotalEquity
        : current
    ));
    previousInitialTotalEquity.current = initialTotalEquity;
  }, [initialTotalEquity]);

  useEffect(() => {
    if (!normalizedTicker) {
      return;
    }

    const controller = new AbortController();
    const lookupTimer = window.setTimeout(async () => {
      setLookup({ status: 'loading', name: null, symbol: null, message: null });

      try {
        const response = await axios.get<SecurityLookupResponse>('/api/security-lookup', {
          params: { ticker: normalizedTicker, exchange },
          signal: controller.signal,
        });

        setLookup({
          status: 'found',
          name: response.data.name,
          symbol: response.data.symbol,
          message: null,
        });
      } catch (err: unknown) {
        if (axios.isCancel(err)) return;

        const message = axios.isAxiosError(err)
          ? err.response?.data?.message || '종목명을 찾을 수 없습니다.'
          : '종목명을 찾을 수 없습니다.';

        setLookup({ status: 'not-found', name: null, symbol: null, message });
      }
    }, 450);

    return () => {
      window.clearTimeout(lookupTimer);
      controller.abort();
    };
  }, [normalizedTicker, exchange]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const selectedCapital = capitalSnapshot?.amount ?? 0;
    if (!ticker.trim() || selectedCapital <= 0 || riskPercent <= 0 || !capitalSnapshot) return;
    onAnalyze(ticker.trim().toUpperCase(), exchange, selectedCapital, riskPercent, riskStrategy, capitalSnapshot);
  };

  const handleTickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTicker = event.target.value.toUpperCase();
    setTicker(nextTicker);

    setLookup({
      status: nextTicker.trim() ? 'loading' : 'idle',
      name: null,
      symbol: null,
      message: null,
    });
  };

  const handleExchangeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setExchange(event.target.value);

    if (normalizedTicker) {
      setLookup({ status: 'loading', name: null, symbol: null, message: null });
    }
  };

  return (
    <Card>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">1. 종목 입력</p>
        <h2 className="mt-1 text-xl font-bold text-white">분석할 종목과 리스크 한도를 입력하세요</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          기본 허용 손실은 선택한 자본 기준의 1%입니다. 현재 계좌, 보수적 기준, 현금 기준, 직접 입력, 가상 시나리오 중 하나로 수량을 계산합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_120px_130px_170px_auto]">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">티커</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoComplete="off"
              value={ticker}
              onChange={handleTickerChange}
              disabled={loading}
              placeholder="예: AAPL"
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-10 py-2.5 text-sm uppercase text-white outline-none transition-colors placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
          </div>
          <div className="mt-2 min-h-5 text-xs">
            {lookup.status === 'loading' && (
              <span className="text-slate-500">종목명을 확인하는 중입니다.</span>
            )}
            {lookup.status === 'found' && lookup.name && (
              <span className="text-emerald-300">
                종목명: <span className="font-semibold text-white">{lookup.name}</span>
                {lookup.symbol && lookup.symbol !== normalizedTicker ? (
                  <span className="ml-1 text-slate-500">({lookup.symbol})</span>
                ) : null}
              </span>
            )}
            {lookup.status === 'not-found' && (
              <span className="text-amber-300">{lookup.message}</span>
            )}
          </div>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">거래소</span>
          <select
            value={exchange}
            onChange={handleExchangeChange}
            disabled={loading}
            className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          >
            <option value="NAS">NASDAQ</option>
            <option value="NYS">NYSE</option>
            <option value="AMS">AMEX</option>
            <option value="KOSPI">KOSPI</option>
            <option value="KOSDAQ">KOSDAQ</option>
          </select>
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
            disabled={loading}
            className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">리스크 전략</span>
          <select
            value={riskStrategy}
            onChange={(event) => setRiskStrategy(event.target.value as RiskStrategy)}
            disabled={loading}
            className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          >
            <option value="AUTO">자동 선택</option>
            <option value="MINERVINI_VCP">VCP 표준</option>
            <option value="HIGH_TIGHT_FLAG">HTF 공격형</option>
            <option value="ATR_VOLATILITY">ATR 변동성</option>
            <option value="CONSERVATIVE">보수적 절반 리스크</option>
            <option value="ONL_PYRAMID">ONL 피라미딩</option>
          </select>
        </label>

        <div className="flex items-end">
          <Button type="submit" disabled={loading || !ticker.trim() || !capitalSnapshot || capitalSnapshot.amount <= 0 || riskPercent <= 0} className="w-full py-2.5">
            {loading ? '분석 중...' : '분석 실행'}
          </Button>
        </div>
        </div>

        <CapitalBasisSelector
          market={exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'KR' : 'US'}
          basis={capitalBasis}
          onBasisChange={setCapitalBasis}
          manualAmount={manualCapital}
          onManualAmountChange={setManualCapital}
          scenarioPct={scenarioPct}
          onScenarioPctChange={setScenarioPct}
          fallbackEquity={initialTotalEquity}
          portfolioRisk={portfolioRisk}
          riskPercent={riskPercent}
          capturedAt={capitalCapturedAt}
          disabled={loading}
          onSnapshotChange={setCapitalSnapshot}
        />
      </form>
    </Card>
  );
}
