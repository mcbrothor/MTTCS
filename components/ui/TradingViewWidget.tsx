'use client';

import { useState } from 'react';
import { X, ExternalLink, TrendingUp } from 'lucide-react';

// 거래소 코드를 TradingView 심볼 접두사로 변환
// 왜: TradingView의 심볼 포맷은 "EXCHANGE:TICKER" 형태이며,
//     KIS/Yahoo 거래소 코드와 매핑이 필요하다.
function toTradingViewSymbol(ticker: string, exchange: string): string {
  const upper = exchange.toUpperCase();
  // 한국 종목: 6자리 숫자 코드
  if (/^\d{6}$/.test(ticker)) {
    return `KRX:${ticker}`;
  }
  // 미국 거래소 매핑
  const exchangeMap: Record<string, string> = {
    NAS: 'NASDAQ',
    NASDAQ: 'NASDAQ',
    NYSE: 'NYSE',
    NYS: 'NYSE',
    AMEX: 'AMEX',
    ARCA: 'ARCA',
  };
  const tv = exchangeMap[upper] ?? 'NASDAQ';
  return `${tv}:${ticker}`;
}

// ===== 인라인 모달 컴포넌트 =====
interface TradingViewModalProps {
  ticker: string;
  exchange: string;
  onClose: () => void;
}

function TradingViewModal({ ticker, exchange, onClose }: TradingViewModalProps) {
  const symbol = toTradingViewSymbol(ticker, exchange);
  // TradingView Widget 임베드 URL — 무료, API 키 불필요
  // interval=W : 주봉 (VCP 패턴 확인에 적합)
  const widgetUrl = `https://www.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}&interval=W&theme=dark&style=1&locale=ko&toolbar_bg=%23131722&enable_publishing=0&hide_top_toolbar=0&hide_legend=0&save_image=0&calendar=0&studies=RSI%40tv-basicstudies&support_host=https%3A%2F%2Fwww.tradingview.com`;
  const externalUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;

  return (
    // 배경 오버레이 — 클릭 시 모달 닫기
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[80vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()} // 내부 클릭 시 모달 유지
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="font-mono font-bold text-white">{ticker}</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{symbol}</span>
            <span className="text-xs text-slate-500">주봉</span>
          </div>
          <div className="flex items-center gap-2">
            {/* TradingView에서 전체 화면 열기 */}
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ExternalLink className="h-3 w-3" />
              TradingView에서 열기
            </a>
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

        {/* TradingView iframe */}
        <iframe
          src={widgetUrl}
          title={`${ticker} TradingView 차트`}
          className="flex-1 border-0 bg-slate-950"
          allowFullScreen
          // 보안: allow-scripts만 허용 (외부 TradingView 도메인)
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>
    </div>
  );
}

// ===== 외부로 노출되는 버튼 컴포넌트 =====
interface TradingViewWidgetProps {
  ticker: string;
  exchange: string;
  /** 버튼 표시 방식: 'icon' = 아이콘만, 'text' = 텍스트 포함 */
  variant?: 'icon' | 'text';
  className?: string;
}

/**
 * TradingView 차트를 모달 팝업으로 여는 버튼 컴포넌트.
 * 스캐너, 계획서, 관심종목 등 어디서든 재사용할 수 있도록 설계.
 *
 * 사용 예:
 * <TradingViewWidget ticker="AAPL" exchange="NAS" variant="text" />
 */
export default function TradingViewWidget({ ticker, exchange, variant = 'icon', className = '' }: TradingViewWidgetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // 테이블 행 클릭(드릴다운) 이벤트와 분리
          setOpen(true);
        }}
        title={`${ticker} 차트 보기`}
        className={`inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-all hover:border-emerald-500/50 hover:bg-slate-700 hover:text-emerald-300 ${className}`}
      >
        <TrendingUp className="h-3 w-3" />
        {variant === 'text' && '차트'}
      </button>

      {/* 모달은 Portal 없이 DOM에 직접 마운트 — Next.js App Router 호환 */}
      {open && <TradingViewModal ticker={ticker} exchange={exchange} onClose={() => setOpen(false)} />}
    </>
  );
}
