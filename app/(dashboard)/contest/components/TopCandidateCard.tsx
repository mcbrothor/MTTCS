import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ContestCandidate } from '@/types';
import { verdictRecommendationClass } from '@/lib/contest-ui-utils';

// lucide-react@1.8.0 bundler resolution 이슈 대응
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Crown, Medal, Zap } = require('lucide-react') as {
  Crown: React.FC<React.SVGProps<SVGSVGElement>>;
  Medal: React.FC<React.SVGProps<SVGSVGElement>>;
  Zap: React.FC<React.SVGProps<SVGSVGElement>>;
};

interface TopCandidateCardProps {
  candidate: ContestCandidate;
  idx: number;
  verdict: any;
  busyId: string | null;
  updateCandidate: (candidate: ContestCandidate, invested: boolean) => void;
}

const TopCandidateCard: React.FC<TopCandidateCardProps> = ({
  candidate,
  idx,
  verdict,
  busyId,
  updateCandidate,
}) => {
  const isSelected = candidate.actual_invested;

  return (
    <div className={`group relative overflow-hidden rounded-3xl border transition-all duration-500 hover:scale-[1.02] ${
      isSelected 
        ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_40px_rgba(16,185,129,0.1)]' 
        : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'
    }`}>
      {idx === 0 && (
        <div className="absolute -right-6 -top-6 h-20 w-20 rotate-12 bg-amber-500/10 blur-2xl" />
      )}
      
      <div className="p-8">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-lg bg-slate-800 text-[10px] font-black text-slate-400 ${idx === 0 ? 'bg-amber-500/20 text-amber-500' : ''}`}>
                {idx + 1}
              </span>
              <p className="font-mono text-2xl font-black tracking-tighter text-white group-hover:text-emerald-400 transition-colors">
                {candidate.ticker}
              </p>
            </div>
            <p className="truncate text-xs font-medium text-slate-500">{candidate.name}</p>
          </div>
          {idx === 0 ? <Crown className="h-6 w-6 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" /> : <Medal className="h-6 w-6 text-slate-600" />}
        </div>

        <div className="mt-8 space-y-4">
          <div className={`rounded-2xl border p-4 transition-all ${verdictRecommendationClass(verdict.recommendation)}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-70">MTN Verdict</span>
              <Zap className="h-3 w-3" />
            </div>
            <p className="mt-1 text-lg font-black tracking-tight">{verdict.title}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-900/50 p-3 border border-slate-800/50">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">VCP Grade</p>
              <p className="mt-1 text-sm font-black text-white">{(candidate.snapshot as any)?.vcp_status || 'N/A'}</p>
            </div>
            <div className="rounded-xl bg-slate-900/50 p-3 border border-slate-800/50">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">RS Rating</p>
              <p className="mt-1 text-sm font-black text-white">{(candidate.snapshot as any)?.rs_rating || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={() => updateCandidate(candidate, !isSelected)}
            disabled={busyId === candidate.id}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-xs font-black transition-all active:scale-95 ${
              isSelected
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {busyId === candidate.id ? <LoadingSpinner /> : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {isSelected ? '투자 계획에 포함됨' : '투자 계획에 추가'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TopCandidateCard);
