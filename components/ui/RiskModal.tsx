'use client';

import { ShieldAlert } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';
import Button from '@/components/ui/Button';

export default function RiskModal() {
  const { data, isLoading, bypassRisk, setBypassRisk } = useMarket();

  if (isLoading || !data) return null;

  if (data.state === 'RED' && !bypassRisk) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
        <div className="max-w-md rounded-xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-rose-500/10 p-4">
              <ShieldAlert className="h-12 w-12 text-rose-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-white">RED 국면 시스템 차단</h2>
            
            <p className="text-slate-300">
              현재 마스터 필터가 치명적인 시장 위험 상태(RED)를 감지했습니다.<br/>
              무분별한 강제 매수 및 뇌동매매를 방지하기 위해 스캐너와 종목 상세 정보 접근을 일시적으로 제한합니다.
            </p>

            <div className="mt-4 w-full rounded-lg bg-rose-950/50 p-4 text-sm text-rose-200 border border-rose-900/50">
              <strong>Centaur 경고문:</strong>
              <p className="mt-1">{data.insightLog}</p>
            </div>

            <div className="mt-6 flex w-full flex-col gap-3">
              <Button 
                variant="primary" 
                className="w-full bg-slate-700 hover:bg-slate-600 border-none"
                onClick={() => window.location.href = '/'}
              >
                대시보드로 돌아가기
              </Button>
              <button 
                className="text-xs text-slate-500 underline hover:text-slate-400"
                onClick={() => setBypassRisk(true)}
              >
                위험을 모두 인지했으며, 예외적으로 종목 정보를 확인하겠습니다.
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
