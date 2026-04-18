'use client';

import { AlertCircle, Bot, CheckCircle2, Cpu, Sparkles, XCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import { useMarket } from '@/contexts/MarketContext';
import type { AiFallbackAttempt } from '@/types';

function chainTone(status: AiFallbackAttempt['status']) {
  if (status === 'success') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (status === 'failed') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-slate-700 bg-slate-900 text-slate-400';
}

function chainIcon(status: AiFallbackAttempt['status']) {
  if (status === 'success') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5" />;
  return <Cpu className="h-3.5 w-3.5" />;
}

export default function InsightLog() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <Card className="animate-pulse border-slate-700/50 bg-slate-800/30">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-slate-700/50" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/4 rounded bg-slate-700/50" />
            <div className="h-4 w-3/4 rounded bg-slate-700/50" />
          </div>
        </div>
      </Card>
    );
  }

  const {
    insightLog,
    state,
    isAiGenerated,
    aiProviderUsed,
    aiModelUsed,
    aiFallbackChain = [],
    aiErrorSummary,
  } = data;

  const tone =
    state === 'GREEN'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : state === 'RED'
        ? 'border-rose-500/30 bg-rose-500/5'
        : 'border-amber-500/30 bg-amber-500/5';

  const providerLabel = aiProviderUsed || (isAiGenerated ? 'gemini' : 'rules');

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

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-200">
                {isAiGenerated ? 'CENTAUR 전략 로그 (AI)' : 'CENTAUR 규칙 로그'}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">
                  <Cpu className="h-3 w-3 text-indigo-400" />
                  {providerLabel}
                </span>
                {aiModelUsed && (
                  <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 font-mono text-[10px] text-slate-400">
                    {aiModelUsed}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {insightLog.split('\n').filter(Boolean).map((line, index) => (
                <p key={`${index}-${line.slice(0, 12)}`}>{line}</p>
              ))}
            </div>

            {aiFallbackChain.length > 0 && (
              <div className="mt-4 border-t border-slate-800/70 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fallback Chain</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {aiFallbackChain.map((attempt, index) => (
                    <span
                      key={`${attempt.provider}-${attempt.model}-${index}`}
                      title={attempt.message || undefined}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] ${chainTone(attempt.status)}`}
                    >
                      {chainIcon(attempt.status)}
                      <span className="font-semibold uppercase">{attempt.provider}</span>
                      <span className="truncate font-mono opacity-80">{attempt.model}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiErrorSummary && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{aiErrorSummary}</p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800/50 pt-4">
              <span className="text-[10px] italic text-slate-500">
                Gemini 3.1 Flash-Lite → Groq → Cerebras → rule-based 순서로 시장 로그를 생성합니다.
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
            <strong>Tip:</strong> <code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code>, <code>CEREBRAS_API_KEY</code>를 순서대로 설정하면
            Centaur 로그가 가능한 AI provider부터 자동으로 생성됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
