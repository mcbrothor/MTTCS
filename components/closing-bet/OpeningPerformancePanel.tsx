import { BarChart3 } from 'lucide-react';
import { CLOSING_LABELS, CLOSING_OPENING_POLICY, CLOSING_POLICY } from '../../lib/closing-bet/config';
import type { ClosingEvaluation, ClosingOpeningExit, ClosingSnapshot } from '../../lib/closing-bet/types';
import { displayedClosingCandidates } from './view-model';

const price = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ko-KR')}원` : '—';
const percent = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
const tone = (value: number | null | undefined) => value && value > 0 ? 'text-rose-300' : value && value < 0 ? 'text-sky-300' : 'text-slate-400';
const labels = { PENDING: '익일 가격 대기', AVAILABLE: '확인 완료', DATA_MISSING: '가격 미확인', NOT_APPLICABLE: '해당 시각 거래 없음' };

function ExitCell({ value }: { value?: ClosingOpeningExit }) {
  return <td className="px-3 py-3 align-top">
    <p className="font-mono text-slate-200">{price(value?.price)}</p>
    <p className={`mt-1 font-mono text-sm font-semibold ${tone(value?.returnPct)}`}>{percent(value?.returnPct)}</p>
    {value?.status === 'AVAILABLE'
      ? <p className="mt-1 text-[10px] text-slate-500">비용 반영 {percent(value.netReturnPct)}</p>
      : <p className="mt-1 text-[10px] text-amber-200/80">{value ? labels[value.status] : '새 기준 평가 대기'}</p>}
    {!!value?.warnings.length && <details className="mt-1 max-w-56 text-[10px] leading-5 text-slate-500"><summary className="cursor-pointer">확인 사항</summary>{value.warnings.join(' · ')}</details>}
  </td>;
}

export function OpeningPerformancePanel({ evaluations, snapshots }: { evaluations: ClosingEvaluation[]; snapshots: ClosingSnapshot[] }) {
  return <section className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4 sm:p-5" aria-label="익일 시초 성과">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><BarChart3 className="h-4 w-4 text-amber-300" aria-hidden />익일 시초 성과</h2>
    <p className="mt-2 text-xs leading-6 text-slate-400">추천일 KRX 종가에 매수했다고 가정하고, 다음 거래일 NXT 08:05·KRX 09:05로 표시된 1분봉의 종가에 각각 매도한 가격 수익률입니다. 실제 주문이나 계좌 체결 결과를 의미하지 않습니다.</p>
    <p className="mt-1 text-[11px] leading-5 text-slate-500">수익률 = (매도 기준 가격 ÷ 추천일 KRX 종가 − 1) × 100. 비용 반영 값은 왕복 {CLOSING_POLICY.costBps}bp 가정입니다. NXT 미거래·분봉 누락은 미확인으로 표시하며 다른 가격으로 대체하지 않습니다. 과거 재현 목록은 검토 후보의 참고 성과입니다.</p>
    {!snapshots.length && <p className="mt-4 text-xs text-slate-500">조회한 날짜의 추천 결과가 없습니다.</p>}
    <div className="mt-4 space-y-5">{snapshots.map((snapshot) => {
      const rows = displayedClosingCandidates(snapshot).map((candidate) => {
        const evaluation = evaluations.find((row) => row.snapshotId === snapshot.id && row.ticker === candidate.ticker && row.market === snapshot.market && row.tradeDate === snapshot.tradeDate);
        return { candidate, evaluation, opening: evaluation?.opening?.version === CLOSING_OPENING_POLICY.version ? evaluation.opening : undefined };
      });
      const nextDate = rows.find((row) => row.evaluation?.nextTradeDate)?.evaluation?.nextTradeDate;
      return <section key={snapshot.id} aria-label={`${CLOSING_LABELS[snapshot.market]} 시초 성과`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold text-teal-200">{CLOSING_LABELS[snapshot.market]} Top5 성과</h3><p className="text-[11px] text-slate-500">매수 기준 {snapshot.tradeDate} → 매도 기준 {nextDate || '다음 거래일 확인 중'} · KST</p></div>
        {rows.length ? <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[600px] text-left text-xs">
          <thead className="bg-slate-900/60 text-[11px] text-slate-400"><tr>{['종목', '추천일 KRX 종가', 'NXT 08:05 종가 / 수익률', 'KRX 09:05 종가 / 수익률'].map((label) => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{rows.map(({ candidate, evaluation, opening }, index) => <tr key={candidate.ticker} className="border-t border-slate-800/60" aria-label={`${candidate.name} 시초 성과`}>
            <th scope="row" className="px-3 py-3 align-top font-medium text-slate-200"><p>{index + 1}. {candidate.name}</p><p className="mt-1 text-[10px] font-normal text-slate-500">{candidate.ticker}</p></th>
            <td className="px-3 py-3 align-top font-mono text-slate-300">{price(opening?.basisPrice)}{!opening && <p className="mt-1 text-[10px] font-sans text-slate-500">새 기준 평가 대기</p>}{opening && opening.basisPrice === null && <p className="mt-1 text-[10px] font-sans text-amber-200/80">매수 기준 가격 미확인</p>}{!!evaluation?.warnings.length && <details className="mt-1 max-w-48 font-sans text-[10px] leading-5 text-slate-500"><summary className="cursor-pointer">평가 기준</summary>{evaluation.warnings.join(' · ')}</details>}</td>
            <ExitCell value={opening?.nxt} /><ExitCell value={opening?.krx} />
          </tr>)}</tbody>
        </table></div> : <p className="mt-3 text-xs text-slate-500">선정 종목이 없어 성과를 계산하지 않습니다.</p>}
      </section>;
    })}</div>
  </section>;
}
