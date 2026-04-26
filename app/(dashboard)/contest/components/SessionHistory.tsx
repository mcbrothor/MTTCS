import React from 'react';
import { BeautyContestSession, ContestCandidate } from '@/types';

interface SessionHistoryProps {
  sessions: BeautyContestSession[];
  activeSessionId: string | null;
  onSessionSelect: (session: BeautyContestSession) => void;
  formatDate: (date: string) => string;
  orderedCandidates: (session: BeautyContestSession) => ContestCandidate[];
}

const SessionHistory: React.FC<SessionHistoryProps> = ({
  sessions,
  activeSessionId,
  onSessionSelect,
  formatDate,
  orderedCandidates,
}) => {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6">
      <h3 className="text-lg font-bold text-white mb-4">최근 콘테스트 세션</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.slice(0, 6).map((session) => (
          <button
            key={session.id}
            onClick={() => onSessionSelect(session)}
            className={`group flex flex-col gap-3 rounded-xl border p-4 transition-all text-left ${
              activeSessionId === session.id
                ? 'border-emerald-500/50 bg-emerald-500/5 shadow-lg'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                {session.universe}
              </p>
              <span className="text-[10px] text-slate-500">{formatDate(session.selected_at)}</span>
            </div>
            <div className="flex -space-x-2">
              {orderedCandidates(session).slice(0, 5).map((c) => (
                <div key={c.id} className="h-7 w-7 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[9px] font-bold text-white">
                  {c.ticker.slice(0, 2)}
                </div>
              ))}
              {(session.candidates?.length || 0) > 5 && (
                <div className="h-7 w-7 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-400">
                  +{(session.candidates?.length || 0) - 5}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default React.memo(SessionHistory);
