import type { Trade } from '@/types';
import { currency, numberText, getEntryTargets, getTrailingStops, getRiskPercent, getSepaEvidence, isKorean } from './shared';
import { DetailMetric } from './TradeExecutionsPanel';
import { HistoryChart } from './HistoryChart';
import { Star } from 'lucide-react';

function NoteBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
      <p className="mb-1 text-xs font-semibold text-slate-500">{title}</p>
      {text}
    </div>
  );
}

export function StrategyDetail({ trade }: { trade: Trade }) {
  const targets = getEntryTargets(trade.entry_targets);
  const stops = getTrailingStops(trade.trailing_stops);
  const sepa = getSepaEvidence(trade.sepa_evidence);
  const riskPct = (getRiskPercent(trade) * 100).toFixed(1).replace('.0', '');
  const metrics = trade.metrics;
  const exchange = isKorean(trade.ticker) ? 'KOSPI' : 'NAS';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-bold text-white">
            주가 추이 리서치 <span className="text-[10px] font-normal text-slate-500">(최근 200거래일)</span>
          </h4>
        </div>
        <div className="h-[250px] w-full">
          <HistoryChart ticker={trade.ticker} exchange={exchange} stopPrice={trade.stoploss_price} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DetailMetric label="총 자본" value={currency(trade.total_equity, trade.ticker)} />
        <DetailMetric label="허용 손실" value={`${riskPct}%`} />
        <DetailMetric label="ATR 참고" value={numberText(trade.atr_value)} />
        <DetailMetric label="진입가" value={currency(metrics?.avgEntryPrice ?? trade.entry_price, trade.ticker)} />
        <DetailMetric 
          label="현재가" 
          value={currency(metrics?.currentPrice, trade.ticker)} 
          highlight={!!metrics?.currentPrice}
          color={metrics?.unrealizedPnL && metrics.unrealizedPnL >= 0 ? 'emerald' : 'coral'}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <NoteBox title="진입 전 시나리오" text={trade.plan_note || '수정 버튼으로 계획의 핵심 시나리오를 기록하세요.'} />
        <NoteBox title="무효화 조건" text={trade.invalidation_note || '이 아이디어가 틀렸다고 판단할 조건을 짧게 적어두면 복기가 쉬워집니다.'} />
      </div>

      {targets && stops && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-white">진입 및 스탑 계획</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">단계</th>
                  <th className="py-2 text-right">기준가</th>
                  <th className="py-2 text-right">수량</th>
                  <th className="py-2 text-right">계획 스탑</th>
                  <th className="py-2 text-right">현재가 대비</th>
                </tr>
              </thead>
              <tbody>
                {[targets.e1, targets.e2, targets.e3].map((leg, index) => {
                  const stop = index === 0 ? stops.initial : index === 1 ? stops.afterEntry2 : stops.afterEntry3;
                  const currentPrice = trade.metrics?.currentPrice;
                  const distToStop = currentPrice && stop ? ((stop - currentPrice) / currentPrice) * 100 : null;
                  
                  return (
                    <tr key={leg.label} className="border-b border-slate-900">
                      <td className="py-2 font-medium text-white">{leg.label}</td>
                      <td className="py-2 text-right font-mono">{currency(leg.price, trade.ticker)}</td>
                      <td className="py-2 text-right font-mono">{leg.shares > 0 ? `${leg.shares.toLocaleString()}주` : '수동'}</td>
                      <td className="py-2 text-right font-mono text-orange-300">{currency(stop, trade.ticker)}</td>
                      <td className="py-2 text-right font-mono">
                        {distToStop !== null ? (
                          <span className={distToStop > -2 ? 'text-coral-red font-bold' : 'text-slate-400'}>
                            {distToStop.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {trade.status === 'ACTIVE' && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                <Star className="h-3 w-3 fill-current" /> 트레일링 스탑 가이드 (고가 대비 하락폭 예시)
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                현재가 {currency(trade.metrics?.currentPrice, trade.ticker)} 기준, 
                만약 현재가에서 <span className="text-orange-300">-5%</span> 하락 시 
                <span className="ml-1 text-white">{currency((trade.metrics?.currentPrice || 0) * 0.95, trade.ticker)}</span>까지 스탑을 올리는 것을 고려하세요.
                (Minervini: &quot;Give back no more than half of your peak gain&quot;)
              </p>
            </div>
          )}
        </div>
      )}

      {sepa && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-white">SEPA 판정 근거</h4>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-emerald-500/30 px-2 py-1 text-emerald-300">통과 {sepa.summary.passed}</span>
            <span className="rounded-lg border border-red-500/30 px-2 py-1 text-red-300">실패 {sepa.summary.failed}</span>
            <span className="rounded-lg border border-sky-500/30 px-2 py-1 text-sky-300">정보 {sepa.summary.info}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {sepa.criteria.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.label}</p>
                  <span className={item.status === 'pass' ? 'text-emerald-300' : item.status === 'fail' ? 'text-red-300' : 'text-sky-300'}>
                    {item.status === 'pass' ? 'Pass' : item.status === 'fail' ? 'Fail' : 'Info'}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">{item.actual ?? '-'}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {trade.emotion_note && (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
          {trade.emotion_note}
        </div>
      )}
    </div>
  );
}
