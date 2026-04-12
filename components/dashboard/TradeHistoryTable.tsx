import StatusBadge from '@/components/ui/StatusBadge';
import Card from '@/components/ui/Card';
import type { Trade } from '@/types';

interface TradeHistoryTableProps {
  trades: Trade[];
}

const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

export default function TradeHistoryTable({ trades }: TradeHistoryTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">최근 매매 기록</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-700 bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">날짜</th>
              <th scope="col" className="px-4 py-3">티커</th>
              <th scope="col" className="px-4 py-3">상태</th>
              <th scope="col" className="px-4 py-3 text-right">SEPA</th>
              <th scope="col" className="px-4 py-3 text-right">계획 리스크</th>
              <th scope="col" className="px-4 py-3 text-right">손익</th>
              <th scope="col" className="px-4 py-3 text-right">규율</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  아직 매매 기록이 없습니다.
                </td>
              </tr>
            ) : (
              trades.slice(0, 10).map((trade) => {
                const sepaPassed = trade.chk_sepa ?? trade.chk_market;
                return (
                  <tr key={trade.id} className="border-b border-slate-800 transition-colors hover:bg-slate-800/50">
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(trade.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-white">{trade.ticker}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={trade.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={sepaPassed ? 'text-emerald-300' : 'text-slate-500'}>
                        {sepaPassed ? 'Pass' : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {trade.planned_risk ? currency(trade.planned_risk) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {trade.status === 'COMPLETED' ? (
                        <span className={(trade.result_amount || 0) >= 0 ? 'text-emerald-500' : 'text-coral-red'}>
                          {(trade.result_amount || 0) >= 0 ? '+' : ''}{currency(trade.result_amount || 0)}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trade.status === 'COMPLETED' ? (
                        <span className={`font-bold ${(trade.final_discipline || 0) >= 80 ? 'text-emerald-500' : 'text-orange-400'}`}>
                          {trade.final_discipline}pt
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
