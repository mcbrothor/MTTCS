'use client';

import InsightLog from '@/components/master-filter/InsightLog';
import MetricsGrid from '@/components/master-filter/MetricsGrid';
import StatusCenter from '@/components/master-filter/StatusCenter';

export default function MasterFilterPage() {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Market Navigator</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">마스터 필터</h1>
        <p className="mt-3 text-sm text-slate-400">
          개별 종목 진입 전에 시장의 전체 기류를 점수화합니다. FTD, 분산일, 내부 강도, 200일선 참여율, 섹터 로테이션을 같은
          가중치로 확인합니다.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <StatusCenter />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <InsightLog />
            <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="mb-4 text-lg font-bold text-white">운영 가이드라인</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex gap-2">
                  <span className="font-bold text-emerald-400">GREEN:</span>
                  공격적인 후보 선별과 계획된 진입을 허용합니다.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-amber-400">YELLOW:</span>
                  신규 진입 비중을 줄이고 리스크 관리를 강화합니다.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-rose-400">RED:</span>
                  신규 매수를 중단하고 현금 비중을 높입니다.
                </li>
              </ul>
            </div>
          </div>

          <div className="lg:col-span-2">
            <MetricsGrid />
          </div>
        </div>
      </div>
    </div>
  );
}
