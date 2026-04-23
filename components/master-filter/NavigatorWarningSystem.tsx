'use client';

import { useMarket } from '@/contexts/MarketContext';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ShieldAlert, X, Eye } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function NavigatorWarningSystem() {
  const { data, bypassRisk, setBypassRisk } = useMarket();
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);

  // RED 국면 판정 로직
  const isRed = data?.state === 'RED';
  const isYellow = data?.state === 'YELLOW';
  
  // 블러 적용 범위: 스캐너(/scanner) 및 개별 종목(/trades) 관련 페이지
  const isTargetPage = pathname.startsWith('/scanner') || pathname.startsWith('/trades');
  
  // 모달은 모든 페이지에서 처음 진입 시 노출, 블러는 대상 페이지에서만 bypassRisk가 false일 때 적용
  const showBlur = isRed && isTargetPage && !bypassRisk;
  const showModal = isRed && !bypassRisk;

  // ✅ useEffect는 항상 최상단에, 조건은 내부에서 처리 (Hook 규칙 준수)
  useEffect(() => {
    if (showBlur) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => document.body.classList.remove('overflow-hidden');
  }, [showBlur]);

  // ✅ early return은 모든 훅 선언 이후
  if (!data) return null;

  // 1. YELLOW 국면 - 상단 스티키 배너
  const renderYellowBanner = () => {
    if (!isYellow || !isVisible) return null;
    return (
      <div className="sticky top-[108px] z-[60] w-full bg-amber-500/95 backdrop-blur-md px-4 py-2 border-b border-amber-600/50 shadow-lg animate-in slide-in-from-top duration-500">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-xs font-bold leading-tight uppercase tracking-tight">
              Navigator Warning: 시장의 힘이 분배되고 있습니다. 신규 진입 시 비중을 50% 이하로 제한하고 방어적으로 운용하십시오.
            </span>
          </div>
          <button 
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-slate-900/10 rounded-full transition-colors"
          >
            <X className="h-3.5 w-3.5 text-slate-900" />
          </button>
        </div>
      </div>
    );
  };

  // 2. RED 국면 - 경고 모달 및 블러 제어
  const renderRedAlertSystem = () => {
    if (!isRed) return null;

    return (
      <>
        {/* 블러 레이어 (대상 페이지 전용) */}
        {showBlur && (
          <div className="fixed inset-0 z-[70] backdrop-blur-[12px] bg-slate-950/40 pointer-events-auto transition-all duration-700" />
        )}

        {/* 레드 경고 모달 */}
        {showModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500/50 rounded-2xl p-8 shadow-[0_0_50px_rgba(244,63,94,0.3)] animate-in zoom-in-95 duration-300">
              <div className="flex flex-col items-center text-center gap-6">
                <div className="p-4 rounded-full bg-rose-500/10 border border-rose-500/30 animate-pulse">
                  <ShieldAlert className="h-12 w-12 text-rose-500" />
                </div>
                
                <div className="space-y-3">
                  <h2 className="text-2xl font-black text-rose-500 uppercase tracking-tight">
                    항해 불가능 구간 (BEAR)
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed font-medium">
                    마스터 필터가 강력한 하락 신호를 가리키고 있습니다.<br />
                    이 구간에서의 돌파 시도는 <strong className="text-rose-400">대부분 실패로 끝납니다.</strong> 모든 신규 매수를 중단하고 현금을 확보하십시오.
                  </p>
                </div>

                <div className="w-full flex flex-col gap-3 mt-4">
                  <button
                    onClick={() => setBypassRisk(true)}
                    className="w-full h-12 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95"
                  >
                    위험을 인지했으며 단순 관찰하겠습니다
                  </button>
                  <button
                    onClick={() => window.history.back()}
                    className="w-full h-12 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all"
                  >
                    메인으로 돌아가기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 관찰 모드 알림 툴팁 (Bypass 시 가독성 보조) */}
        {isRed && bypassRisk && isTargetPage && (
          <div className="fixed bottom-6 right-6 z-[60] px-4 py-2 bg-rose-500 text-white text-[10px] font-bold rounded-lg shadow-xl flex items-center gap-2 animate-bounce">
            <Eye className="h-3 w-3" />
            관찰 모드 (위험 구간) 가동 중
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {renderYellowBanner()}
      {renderRedAlertSystem()}
    </>
  );
}
