'use client';

import { useState } from 'react';
import { X, ExternalLink, TrendingUp } from 'lucide-react';
import TradingViewAdvancedChart from './TradingViewAdvancedChart';

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

type ChartSource = 'tradingview' | 'naver';

interface TradingViewModalProps {
  ticker: string;
  exchange: string;
  onClose: () => void;
}

function TradingViewModal({ ticker, exchange, onClose }: TradingViewModalProps) {
  const symbol = toTradingViewSymbol(ticker, exchange);
  const isKrx = symbol.startsWith('KRX:');
  const naverUrl = toNaverUrl(ticker, exchange);
  const tvExternalUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;

  // KRX는 TradingView 임베드 불가 → 기본값 naver
  const [source, setSource] = useState<ChartSource>(isKrx ? 'naver' : 'tradingview');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[80vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="font-mono font-bold text-white">{ticker}</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{symbol}</span>
            <span className="text-xs text-slate-500">주봉</span>

            {/* 차트 소스 토글 */}
            <div className="ml-2 flex rounded-lg border border-slate-700 bg-slate-800 p-0.5 text-[11px] font-semibold">
              {!isKrx && (
                <button
                  type="button"
                  onClick={() => setSource('tradingview')}
                  className={`rounded-md px-3 py-1 transition-colors ${
                    source === 'tradingview'
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  TradingView
                </button>
              )}
              <button
                type="button"
                onClick={() => setSource('naver')}
                className={`rounded-md px-3 py-1 transition-colors ${
                  source === 'naver'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                네이버 금융
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 현재 소스 외부 링크 */}
            {source === 'naver' ? (
              <a
                href={naverUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-emerald-400 transition-colors hover:bg-slate-800 hover:text-emerald-300"
              >
                <ExternalLink className="h-3 w-3" />
                네이버 금융에서 열기
              </a>
            ) : (
              <a
                href={tvExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
                TradingView에서 열기
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="차트 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 차트 영역 */}
        <div className="flex-1 bg-slate-950">
          {source === 'naver' ? (
            <NaverChartView ticker={ticker} naverUrl={naverUrl} isKrx={isKrx} tvExternalUrl={tvExternalUrl} />
          ) : (
            <TradingViewAdvancedChart symbol={symbol} />
          )}
        </div>
      </div>
    </div>
  );
}

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
  variant?: 'icon' | 'text';
  className?: string;
}

export default function TradingViewWidget({ ticker, exchange, variant = 'icon', className = '' }: TradingViewWidgetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`${ticker} 차트 보기`}
        className={`inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-all hover:border-emerald-500/50 hover:bg-slate-700 hover:text-emerald-300 ${className}`}
      >
        <TrendingUp className="h-3 w-3" />
        {variant === 'text' && '차트'}
      </button>

      {open && <TradingViewModal ticker={ticker} exchange={exchange} onClose={() => setOpen(false)} />}
    </>
  );
}
