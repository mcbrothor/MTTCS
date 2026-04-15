'use client';

import StatusCenter from '@/components/master-filter/StatusCenter';
import MetricsGrid from '@/components/master-filter/MetricsGrid';
import InsightLog from '@/components/master-filter/InsightLog';

export default function MasterFilterPage() {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Market Navigator</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">마스터 필터 (Master Filter)</h1>
        <p className="mt-3 text-sm text-slate-400">
          개별 종목 진입 전 시장의 전체적인 기류(Market Regime)를 분석하여 항해 가능 여부를 판별합니다.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* 상단: 상태 센터 */}
        <StatusCenter />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 중단 좌측: 인사이트 로그 */}
          <div className="lg:col-span-1">
            <InsightLog />
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="text-lg font-bold text-white mb-4">항해 가이드라인</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-bold">GREEN:</span> 
                  공격적인 포지션 구축 및 적극적인 매매 구간
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold">YELLOW:</span> 
                  신규 진입 비중 50% 축소 및 리스크 관리 강화
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400 font-bold">RED:</span> 
                  신규 매수 금지 및 현금 비중 80% 이상 상향 권고
                </li>
              </ul>
            </div>
          </div>

          {/* 중단 우측: 5대 지표 그리드 */}
          <div className="lg:col-span-2">
            <MetricsGrid />
          </div>
        </div>
      </div>
    </div>
  );
}
