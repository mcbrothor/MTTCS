'use client';

import { AlertCircle, Bot, Cpu, Sparkles } from 'lucide-react';
import Card from '@/components/ui/Card';
import { useMarket } from '@/contexts/MarketContext';

export default function InsightLog() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <Card className="animate-pulse border-slate-700/50 bg-slate-800/30">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-slate-700/50" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/4 rounded bg-slate-700/50" />
            <div className="h-4 w-3/4 rounded bg-slate-700/50" />
          </div>
        </div>
      </Card>
    );
  }

  const { insightLog, state, isAiGenerated, aiModelUsed } = data;

  const tone =
    state === 'GREEN'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : state === 'RED'
        ? 'border-rose-500/30 bg-rose-500/5'
        : 'border-amber-500/30 bg-amber-500/5';

  return (
    <div className="space-y-4">
      <Card className={`${tone} relative overflow-hidden transition-all duration-500`}>
        {isAiGenerated && <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 bg-indigo-500/5 blur-3xl" />}

        <div className="flex items-start gap-4">
          <div
            className={`rounded-lg border-2 bg-slate-900 p-2.5 ${
              isAiGenerated ? 'border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'border-slate-700'
            }`}
          >
            {isAiGenerated ? <Sparkles className="h-5 w-5 animate-pulse text-indigo-400" /> : <Bot className="h-5 w-5 text-slate-400" />}
          </div>

          <div className="flex-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-200">
                {isAiGenerated ? 'CENTAUR 전략 로그 (AI)' : 'CENTAUR 엔진 로그'}
              </h3>
              {isAiGenerated && (
                <div className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5">
                  <Cpu className="h-3 w-3 text-indigo-400" />
                  <span className="font-mono text-[10px] text-slate-400">{aiModelUsed}</span>
                </div>
              )}
            </div>

            <div className="space-y-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {insightLog.split('\n').map((line, index) => (
                <p key={`${index}-${line.slice(0, 12)}`}>{line}</p>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800/50 pt-4">
              <span className="text-[10px] italic text-slate-500">
                {isAiGenerated ? '마스터 필터와 매크로 컨텍스트 기반 AI 분석' : '사전 정의된 시장 국면 규칙 기반 분석'}
              </span>
              <span className="text-[10px] uppercase tracking-tight text-slate-500">Navigation Protocol 4.0</span>
            </div>
          </div>
        </div>
      </Card>

      {!isAiGenerated && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-indigo-400" />
          <p className="text-[11px] text-indigo-300">
            <strong>Tip:</strong> 환경 변수에 <code>GEMINI_API_KEY</code>를 추가하면 Gemini 기반 시장 코멘트가 함께 표시됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
