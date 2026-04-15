'use client';

import { useMarket } from '@/contexts/MarketContext';
import { Bot, Sparkles, Cpu } from 'lucide-react';
import Card from '@/components/ui/Card';

export default function InsightLog() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <Card className="animate-pulse bg-slate-800/30 border-slate-700/50">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-slate-700/50" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/4 bg-slate-700/50 rounded" />
            <div className="h-4 w-3/4 bg-slate-700/50 rounded" />
          </div>
        </div>
      </Card>
    );
  }

  const { insightLog, state, isAiGenerated, aiModelUsed } = data;

  const getBorderColor = () => {
    if (state === 'GREEN') return 'border-emerald-500/30 bg-emerald-500/5';
    if (state === 'RED') return 'border-rose-500/30 bg-rose-500/5';
    return 'border-amber-500/30 bg-amber-500/5';
  };

  return (
    <div className="space-y-4">
      <Card className={`${getBorderColor()} relative overflow-hidden transition-all duration-500`}>
        {/* AI Deco Gradient */}
        {isAiGenerated && (
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl -mr-16 -mt-16 pointer-events-none" />
        )}

        <div className="flex items-start gap-4">
          <div className={`rounded-xl bg-slate-900 p-2.5 border-2 ${isAiGenerated ? 'border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'border-slate-700'}`}>
            {isAiGenerated ? (
              <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
            ) : (
              <Bot className="h-5 w-5 text-slate-400" />
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-200">
                {isAiGenerated ? 'CENTAUR STRATEGY LOG (AI)' : 'CENTAUR ENGINE LOG'}
              </h3>
              {isAiGenerated && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700">
                  <Cpu className="h-3 w-3 text-indigo-400" />
                  <span className="text-[10px] text-slate-400 font-mono">{aiModelUsed}</span>
                </div>
              )}
            </div>
            
            <div className="text-sm text-slate-300 leading-relaxed space-y-3 whitespace-pre-wrap font-sans">
              {insightLog.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-center">
              <span className="text-[10px] text-slate-500 italic">
                {isAiGenerated ? 'Analysis based on Market Filter + Macro Context (Gemini Engine)' : 'Analysis based on predefined market regime rules'}
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-tighter">
                Navigation Protocol 4.0
              </span>
            </div>
          </div>
        </div>
      </Card>
      
      {!isAiGenerated && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-indigo-400" />
          <p className="text-[11px] text-indigo-300">
            <strong>Tip:</strong> 환경 변수에 <code>GEMINI_API_KEY</code>를 추가하면 Gemini 3.1 기반의 지능형 매크로 분석 기능을 사용하실 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}

// Sub-component Helper
function AlertCircle(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
