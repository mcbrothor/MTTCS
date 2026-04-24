'use client';

import { useState, useMemo } from 'react';

import { AlertCircle, Bot, CheckCircle2, Cpu, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Card from '@/components/ui/Card';
import { useMarket } from '@/contexts/MarketContext';
import { formatTimestamp } from '@/lib/format';
import type { AiFallbackAttempt, AiModelInsight } from '@/types';

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

function insightTone(insight: AiModelInsight) {
  if (insight.selected) return 'border-emerald-500/50 bg-emerald-500/15 text-emerald-100';
  if (insight.status === 'success') return 'border-sky-500/40 bg-sky-500/10 text-sky-100';
  if (insight.status === 'failed') return 'border-rose-500/40 bg-rose-500/10 text-rose-100';
  return 'border-slate-700 bg-slate-900 text-slate-400';
}

function labelFor(insight: AiModelInsight) {
  if (insight.label === 'gemini-primary') return 'Gemini Primary';
  if (insight.label === 'gemini-fallback') return 'Gemini Fallback';
  if (insight.provider === 'groq') return 'Groq';
  if (insight.provider === 'cerebras') return 'Cerebras';
  return 'Rules';
}

function CacheAgeBadge({ cachedAt }: { cachedAt?: string }) {
  const rel = formatTimestamp(cachedAt, 'relative');
  if (!cachedAt || rel === '-') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        실시간
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      {rel} 갱신
    </span>
  );
}

function StructuredContent({ insight, fallbackText }: { insight: AiModelInsight; fallbackText: string }) {
  if (insight.headline) {
    return (
      <div className="space-y-3">
        <p className="text-base font-bold leading-snug text-white">{insight.headline}</p>
        {insight.bullets && insight.bullets.length > 0 && (
          <ul className="space-y-1.5">
            {insight.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {insight.detail && (
          <details className="group">
            <summary className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-300 transition-colors list-none flex items-center gap-1">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              상세 분석
            </summary>
            <div className="mt-2 prose prose-invert prose-sm max-w-none leading-relaxed text-slate-400 border-l-2 border-slate-700 pl-3">
              {insight.detail}
            </div>
          </details>
        )}
      </div>
    );
  }
  return (
    <div className="prose prose-invert prose-sm max-w-none space-y-3 whitespace-pre-wrap leading-relaxed text-slate-300">
      <ReactMarkdown>{fallbackText}</ReactMarkdown>
    </div>
  );
}

export default function InsightLog() {
  const { data, isLoading } = useMarket();
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);

  const selectedInsight = useMemo(() => {
    const insights = data?.aiModelInsights || [];
    return insights.find((item) => item.id === selectedInsightId)
      || insights.find((item) => item.selected)
      || insights.find((item) => item.status === 'success')
      || null;
  }, [data?.aiModelInsights, selectedInsightId]);

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
    aiModelInsights = [],
    aiErrorSummary,
  } = data;

  const tone =
    state === 'GREEN'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : state === 'RED'
        ? 'border-rose-500/30 bg-rose-500/5'
        : 'border-amber-500/30 bg-amber-500/5';

  const providerLabel = aiProviderUsed || (isAiGenerated ? 'gemini' : 'rules');
  const visibleText = selectedInsight?.text || insightLog;
  const showingRouterPick = !selectedInsight || selectedInsight.selected;

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
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-200">
                  {isAiGenerated ? 'LLM 시장 브리핑 (AI Router)' : '시장 규칙 브리핑'}
                </h3>
                <p className="mt-1 text-[11px] text-slate-500">
                  {showingRouterPick ? 'Router 우선순위 모델의 대표 답변입니다.' : '선택한 모델의 수집 답변을 보고 있습니다.'}
                </p>
              </div>
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

            {selectedInsight ? (
              <StructuredContent insight={selectedInsight} fallbackText={visibleText} />
            ) : (
              <div className="prose prose-invert prose-sm max-w-none space-y-3 whitespace-pre-wrap leading-relaxed text-slate-300">
                <ReactMarkdown>{visibleText}</ReactMarkdown>
              </div>
            )}

            {data?.metrics && (
              <div className="mt-4 border-t border-slate-800/70 pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  분석 시점 지표 스냅샷
                </p>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
                    P3 {data.metrics.p3Score ?? 0}/100
                  </span>
                  <span
                    className={`rounded border px-2 py-1 ${
                      data.metrics.trend.status === 'PASS' ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'
                    }`}
                  >
                    추세 {data.metrics.trend.status}
                  </span>
                  <span
                    className={`rounded border px-2 py-1 ${
                      data.metrics.breadth.status === 'PASS' ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'
                    }`}
                  >
                    시장폭 {data.metrics.breadth.status}
                  </span>
                </div>
              </div>
            )}

            {aiModelInsights.length > 0 && (
              <div className="mt-5 border-t border-slate-800/70 pt-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Collected Model Responses</p>
                    <p className="text-[11px] text-slate-500">성공한 다른 모델 답변은 클릭해서 비교할 수 있습니다.</p>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    성공 {aiModelInsights.filter((item) => item.status === 'success').length} / 전체 {aiModelInsights.length}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {aiModelInsights
                    .slice()
                    .sort((a, b) => a.priority - b.priority)
                    .map((insight) => (
                      <button
                        key={insight.id}
                        type="button"
                        onClick={() => setSelectedInsightId(insight.id)}
                        className={`max-w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-emerald-400 ${insightTone(insight)}`}
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-bold">
                          {chainIcon(insight.status)}
                          {labelFor(insight)}
                          {insight.selected && <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] uppercase text-emerald-100">router pick</span>}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] opacity-80">{insight.model}</span>
                        <span className="mt-1.5 block">
                          <CacheAgeBadge cachedAt={insight.cachedAt} />
                        </span>
                      </button>
                    ))}
                </div>

                {selectedInsight && selectedInsight.status !== 'success' && (
                  <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-5 text-rose-100">
                    <p className="font-semibold">{labelFor(selectedInsight)} 응답 수집 실패</p>
                    <p className="mt-1 break-words">{selectedInsight.message || '실패 사유가 제공되지 않았습니다.'}</p>
                  </div>
                )}
              </div>
            )}

            {aiFallbackChain.length > 0 && (
              <div className="mt-4 border-t border-slate-800/70 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Router Chain</p>
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
                Gemini → Groq → Cerebras 순서로 답변을 수집하고, router 우선순위의 첫 성공 답변을 대표로 표시합니다.
              </span>
              <span className="text-[10px] uppercase tracking-tight text-slate-500">Navigation Protocol 4.1</span>
            </div>
          </div>
        </div>
      </Card>

      {!isAiGenerated && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-indigo-400" />
          <p className="text-[11px] text-indigo-300">
            <strong>Tip:</strong> <code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code>, <code>CEREBRAS_API_KEY</code>를 설정하면
            Centaur가 가능한 모델 답변을 모두 수집합니다.
          </p>
        </div>
      )}
    </div>
  );
}
