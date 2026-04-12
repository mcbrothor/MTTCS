import { useState } from 'react';
import { Search } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface TickerInputProps {
  onAnalyze: (ticker: string, exchange: string, totalEquity: number) => void;
  loading: boolean;
}

export default function TickerInput({ onAnalyze, loading }: TickerInputProps) {
  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('NAS');
  const [totalEquity, setTotalEquity] = useState(50000);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim() || totalEquity <= 0) return;
    onAnalyze(ticker.trim().toUpperCase(), exchange, totalEquity);
  };

  return (
    <Card>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">1. 종목 입력</p>
        <h2 className="mt-1 text-xl font-bold text-white">분석할 종목과 운용 자본을 입력하세요</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          KIS 데이터를 우선 조회하고, 실패하면 Yahoo Finance 데이터로 SEPA와 리스크 계산을 이어갑니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_140px_180px_auto]">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">티커</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoComplete="off"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
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
            onChange={(e) => setExchange(e.target.value)}
            disabled={loading}
            className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          >
            <option value="NAS">NASDAQ</option>
            <option value="NYS">NYSE</option>
            <option value="AMS">AMEX</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-300">총 자본</span>
          <input
            type="number"
            min="1"
            value={totalEquity}
            onChange={(e) => setTotalEquity(Number(e.target.value))}
            disabled={loading}
            className="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />
        </label>

        <div className="flex items-end">
          <Button type="submit" disabled={loading || !ticker.trim() || totalEquity <= 0} className="w-full py-2.5">
            {loading ? '분석 중...' : '분석 실행'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
