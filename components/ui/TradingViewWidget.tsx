'use client';

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import AnalysisChartContainer from '../analysis/AnalysisChartContainer';
import { useIsMobile } from '@/lib/hooks/useViewport';

// TradingView 심볼 변환
export function toTradingViewSymbol(ticker: string, exchange: string): string {
  const upper = exchange.toUpperCase();
  if (/^\d{6}$/.test(ticker)) return `KRX:${ticker}`;
  const exchangeMap: Record<string, string> = {
    NAS: 'NASDAQ', NASDAQ: 'NASDAQ',
    NYSE: 'NYSE', NYS: 'NYSE',
    AMEX: 'AMEX', ARCA: 'ARCA',
  };
  return `${exchangeMap[upper] ?? 'NASDAQ'}:${ticker}`;
}

// 네이버 금융 URL 변환
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toNaverUrl(ticker: string, exchange: string): string {
  // 한국 종목: 6자리 코드
  if (/^\d{6}$/.test(ticker)) {
    return `https://finance.naver.com/item/main.naver?code=${ticker}`;
  }
  // 미국 종목 — 네이버 해외주식 심볼 접미사
  const upper = exchange.toUpperCase();
  const suffixMap: Record<string, string> = {
    NAS: 'O', NASDAQ: 'O',
    NYSE: 'N', NYS: 'N',
    AMEX: 'A', ARCA: 'A',
  };
  const suffix = suffixMap[upper] ?? 'O';
  return `https://finance.naver.com/world/sise.naver?symbol=${ticker}.${suffix}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ChartSource = 'tradingview' | 'naver';

interface TradingViewModalProps {
  ticker: string;
  exchange: string;
  pivotPrice?: number | null;
  stopLossPrice?: number | null;
  onClose: () => void;
}

function TradingViewModal({ 
  ticker, 
  exchange, 
  pivotPrice, 
  stopLossPrice, 
  onClose 
}: TradingViewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[80vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 차트 영역 */}
        <div className="flex-1 bg-slate-950">
          <AnalysisChartContainer 
            ticker={ticker} 
            exchange={exchange} 
            pivotPrice={pivotPrice}
            stopLossPrice={stopLossPrice}
            initialSource={pivotPrice ? 'mtn' : 'tradingview'}
          />
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function NaverChartView({
  ticker,
  naverUrl,
  isKrx,
  tvExternalUrl,
}: {
  ticker: string;
  naverUrl: string;
  isKrx: boolean;
  tvExternalUrl: string;
}) {
  // 한국 종목: fchart iframe (직접 차트 임베드)
  // 미국 종목: 네이버 해외주식 페이지 iframe 시도
  const iframeSrc = isKrx
    ? `https://finance.naver.com/item/fchart.naver?code=${ticker}`
    : naverUrl;

  return (
    <div className="flex h-full flex-col">
      <iframe
        key={iframeSrc}
        src={iframeSrc}
        className="flex-1 w-full border-0"
        title={`${ticker} 네이버 금융 차트`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/80 px-4 py-2 text-xs text-slate-500">
        <span>
          {isKrx
            ? 'KRX 종목은 TradingView 임베드 미지원 — 네이버 금융으로 표시'
            : '네이버 금융 해외주식 페이지'}
        </span>
        <div className="flex gap-3">
          <a href={naverUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
            네이버 금융 →
          </a>
          <a href={tvExternalUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
            TradingView →
          </a>
        </div>
      </div>
    </div>
  );
}

// ===== 외부로 노출되는 버튼 컴포넌트 =====
interface TradingViewWidgetProps {
  ticker: string;
  exchange: string;
  pivotPrice?: number | null;
  stopLossPrice?: number | null;
  variant?: 'icon' | 'text';
  className?: string;
}

export default function TradingViewWidget({
  ticker,
  exchange,
  pivotPrice,
  stopLossPrice,
  variant = 'icon',
  className = ''
}: TradingViewWidgetProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const tvSymbol = toTradingViewSymbol(ticker, exchange);
  const tvExternalUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;

  const btnClass = `inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-all hover:border-emerald-500/50 hover:bg-slate-700 hover:text-emerald-300 ${className}`;
  const label = variant === 'text' ? (pivotPrice ? 'Pro 차트' : '차트') : null;
  const icon = pivotPrice ? <TrendingUp className="h-3 w-3 text-amber-400" /> : <TrendingUp className="h-3 w-3" />;

  if (isMobile) {
    return (
      <a
        href={tvExternalUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`${ticker} TradingView`}
        onClick={(e) => e.stopPropagation()}
        className={btnClass}
      >
        {icon}
        {label}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`${ticker} 차트 보기`}
        className={btnClass}
      >
        {icon}
        {label}
      </button>

      {open && (
        <TradingViewModal
          ticker={ticker}
          exchange={exchange}
          pivotPrice={pivotPrice}
          stopLossPrice={stopLossPrice}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
