import { useState } from 'react';
import { Search } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface TickerInputProps {
  onAnalyze: (ticker: string, exchange: string, totalEquity: number, riskPercent: number) => void;
  loading: boolean;
  initialTicker?: string;
  initialExchange?: string;
}

export default function TickerInput({ onAnalyze, loading, initialTicker = '', initialExchange = 'NAS' }: TickerInputProps) {
  const [ticker, setTicker] = useState(initialTicker);
  const [exchange, setExchange] = useState(initialExchange);
  const [totalEquity, setTotalEquity] = useState(50_000);
  const [riskPercent, setRiskPercent] = useState(3);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ticker.trim() || totalEquity <= 0 || riskPercent <= 0) return;
    onAnalyze(ticker.trim().toUpperCase(), exchange, totalEquity, riskPercent);
  };

  return (
    <Card>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">1. 종목 입력</p>
        <h2 className="mt-1 text-xl font-bold text-white">분석할 종목과 리스크 한도를 입력하세요</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          기본 허용 손실은 총 자본의 3%입니다. 입력한 비율에 따라 최대 손실, 총 수량, 3분할 피라미딩 가격을 다시 계산합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_120px_160px_150px_auto]">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">티커</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoComplete="off"
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              disabled={loading}
              placeholder="예: AAPL"
              className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-10 py-2.5 text-sm uppercase text-white outline-none transition-colors placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">거래소</span>
          <select
            value={exchange}
            onChange={(event) => setExchange(event.target.value)}
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
          <span className="mb-2 block text-sm font-medium text-slate-300">총 자본</span>
          <input
            type="number"
            min="1"
            value={totalEquity}
            onChange={(event) => setTotalEquity(Number(event.target.value))}
            disabled={loading}
            className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
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
            disabled={loading}
            className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />
        </label>

        <div className="flex items-end">
          <Button type="submit" disabled={loading || !ticker.trim() || totalEquity <= 0 || riskPercent <= 0} className="w-full py-2.5">
            {loading ? '분석 중...' : '분석 실행'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
