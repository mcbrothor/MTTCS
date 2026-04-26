import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ContestCandidate } from '@/types';
import { verdictRecommendationClass } from '@/lib/contest-ui-utils';

interface CandidateResultTableProps {
  candidates: ContestCandidate[];
  busyId: string | null;
  updateCandidate: (candidate: ContestCandidate, invested: boolean) => void;
  getContestStructuredVerdict: (candidate: ContestCandidate) => any;
}

const CandidateResultTable: React.FC<CandidateResultTableProps> = ({
  candidates,
  busyId,
  updateCandidate,
  getContestStructuredVerdict,
}) => {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/50 overflow-hidden">
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">1차 평가 및 기타 후보</h3>
        <p className="text-xs text-slate-500 font-medium">{candidates.length}개 정량 평가 결과</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-500">
            <tr>
              <th className="px-6 py-4">순위</th>
              <th className="px-6 py-4">종목</th>
              <th className="px-6 py-4">MTN 1차 신호</th>
              <th className="px-6 py-4">핵심 리스크</th>
              <th className="px-6 py-4 text-right">계획 후보</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {candidates.map((candidate) => {
              const verdict = getContestStructuredVerdict(candidate);
              return (
                <tr key={candidate.id} className={`group transition-colors hover:bg-slate-900/40 ${candidate.actual_invested ? 'bg-emerald-500/[0.02]' : ''}`}>
                  <td className="px-6 py-4">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono font-bold ${(candidate.llm_rank ?? 99) <= 3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {candidate.llm_rank || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-white">{candidate.ticker}</p>
                    <p className="text-[10px] text-slate-500 uppercase">{candidate.name || candidate.exchange}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${verdictRecommendationClass(verdict.recommendation)}`}>
                        {verdict.recommendation || '-'}
                      </span>
                      <span className="text-xs text-slate-400">{Math.round((verdict.confidence || 0) * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="max-w-xs truncate text-xs text-slate-400">{verdict.keyRisk || '-'}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => updateCandidate(candidate, !candidate.actual_invested)}
                      disabled={busyId === candidate.id}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                        candidate.actual_invested 
                          ? 'border-emerald-500 bg-emerald-500 text-white' 
                          : 'border-slate-700 text-slate-500 hover:border-slate-500'
                      }`}
                    >
                      {busyId === candidate.id ? <LoadingSpinner size="sm" /> : <CheckCircle2 className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default React.memo(CandidateResultTable);
