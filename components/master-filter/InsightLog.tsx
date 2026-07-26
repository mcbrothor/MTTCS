'use client';

import { useState, useMemo } from 'react';

import { AlertCircle, Bot, CheckCircle2, Cpu, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Card from '@/components/ui/Card';
import { useMarket } from '@/contexts/MarketContext';
import { formatTimestamp } from '@/lib/format';
import { friendlyMetricStatus } from '@/lib/market-display';
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
  if (insight.label === 'gemini-primary') return '주 분석 모델';
  if (insight.label === 'gemini-fallback') return '보조 분석 모델';
  if (insight.provider === 'groq') return '고속 분석 모델';
  if (insight.provider === 'cerebras') return '보조 분석 모델';
  if (insight.provider === 'codex-cli') return '코드 분석 모델';
  if (insight.provider === 'local-llm') return '로컬 분석 모델';
  return '규칙 기반 판단';
}

function routerSummary(aiProviderUsed: string) {
  if (aiProviderUsed === 'codex-cli') return '코드 분석 모델이 대표 브리핑을 생성했습니다.';
  if (aiProviderUsed === 'rules') return '자동 분석 응답이 늦어 규칙 기반 브리핑을 표시합니다.';
  return '빠른 클라우드 모델부터 확인해 첫 성공 답변을 즉시 표시합니다.';
}

function providerDisplayLabel(provider: string) {
  if (provider === 'rules') return '규칙 기반 판단';
  if (provider === 'codex-cli') return '코드 분석 모델';
  if (provider === 'local-llm') return '로컬 분석 모델';
  return '자동 분석 모델';
}

function attemptStatusLabel(status: AiFallbackAttempt['status']) {
  if (status === 'success') return '응답 완료';
  if (status === 'failed') return '응답 실패';
  return '건너뜀';
}

function friendlyFailureMessage(message?: string) {
  if (!message) return '응답을 받지 못했습니다. 다른 분석 경로의 결과를 표시합니다.';
  const lower = message.toLowerCase();
  if (lower.includes('timed out') || lower.includes('timeout')) return '응답 시간이 길어져 다른 분석 경로로 전환했습니다.';
  if (lower.includes('rate limit') || lower.includes('429')) return '요청이 몰려 잠시 응답하지 못했습니다.';
  if (lower.includes('model does not exist') || lower.includes('404')) return '현재 사용할 수 없는 분석 모델입니다.';
  if (lower.includes('not available on vercel')) return '현재 운영 환경에서 사용할 수 없는 분석 방식입니다.';
  if (lower.includes('evidencekeys') || lower.includes('numeric claims')) return '답변 형식이 기준에 맞지 않아 사용하지 않았습니다.';
  return '응답을 확인할 수 없어 다른 분석 경로의 결과를 표시합니다.';
}

function localizeBriefingText(text: string) {
  return text
    .replaceAll('Trend Alignment', '지수 평균선 위치')
    .replaceAll('Above 200D (Breadth)', '시장 폭')
    .replaceAll('Distribution Pressure', '분산일')
    .replaceAll('Volatility (VIX)', '시장 불안도')
    .replaceAll('50D > 200D, price > 50D/200D', '50일선 > 200일선, 현재가 > 50일선·200일선')
    .replaceAll('50D', '50일선')
    .replaceAll('200D', '200일선')
    .replace(/(\d+(?:\.\d+)?)days\b/gi, '$1일')
    .replace(/(\d+(?:\.\d+)?)pts\b/gi, '$1포인트');
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
      <div className="space-y-4">
        <p className="text-lg md:text-xl font-extrabold leading-snug text-white tracking-tight">{localizeBriefingText(insight.headline)}</p>
        {insight.bullets && insight.bullets.length > 0 && (
          <ul className="space-y-2">
            {insight.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] md:text-sm text-slate-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span className="leading-relaxed">{localizeBriefingText(b)}</span>
              </li>
            ))}
          </ul>
        )}
        {insight.detail && (
          <div className="mt-3 rounded-lg bg-slate-900/50 p-3.5 border border-slate-700/50">
            <div className="prose prose-invert prose-sm max-w-none leading-relaxed text-slate-300">
              <ReactMarkdown>{localizeBriefingText(insight.detail)}</ReactMarkdown>
            </div>
          </div>
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
  const visibleText = localizeBriefingText(selectedInsight?.text || insightLog);
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
                  {isAiGenerated ? '오늘 시장 브리핑' : '시장 규칙 브리핑'}
                </h3>
                <p className="mt-1 text-[11px] text-slate-500">
                  {showingRouterPick ? routerSummary(providerLabel) : '선택한 모델의 수집 답변을 보고 있습니다.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">
                  <Cpu className="h-3 w-3 text-indigo-400" />
                  {providerDisplayLabel(providerLabel)}
                </span>
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
                    시장 건강 {data.metrics.p3Score ?? 0}/100
                  </span>
                  <span
                    className={`rounded border px-2 py-1 ${
                      data.metrics.trend.status === 'PASS' ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'
                    }`}
                  >
                    추세 {friendlyMetricStatus(data.metrics.trend.status)}
                  </span>
                  <span
                    className={`rounded border px-2 py-1 ${
                      data.metrics.breadth.status === 'PASS' ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'
                    }`}
                  >
                    함께 오르는 종목 {friendlyMetricStatus(data.metrics.breadth.status)}
                  </span>
                </div>
              </div>
            )}

            {aiModelInsights.length > 0 && (
              <div className="mt-5 border-t border-slate-800/70 pt-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">수집된 브리핑 답변</p>
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
                          {insight.selected && <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] uppercase text-emerald-100">대표</span>}
                        </span>
                        <span className="mt-1 block text-[10px] opacity-80">
                          {insight.status === 'success' ? '응답 완료' : insight.status === 'failed' ? '응답 실패' : '응답 대기'}
                        </span>
                        <span className="mt-1.5 block">
                          <CacheAgeBadge cachedAt={insight.cachedAt} />
                        </span>
                      </button>
                    ))}
                </div>

                {selectedInsight && selectedInsight.status !== 'success' && (
                  <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-5 text-rose-100">
                    <p className="font-semibold">{labelFor(selectedInsight)} 응답 수집 실패</p>
                    <p className="mt-1">{friendlyFailureMessage(selectedInsight.message)}</p>
                    {selectedInsight.message && (
                      <details className="mt-2 text-[10px] text-rose-200/70">
                        <summary className="cursor-pointer">기술 정보 보기</summary>
                        <p className="mt-1 break-words font-mono">{selectedInsight.message}</p>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}

            {aiFallbackChain.length > 0 && (
              <div className="mt-4 border-t border-slate-800/70 pt-4">
                <p className="text-[11px] font-semibold tracking-wide text-slate-500">분석 응답 상태</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {aiFallbackChain.map((attempt, index) => (
                    <span
                      key={`${attempt.provider}-${attempt.model}-${index}`}
                      title={attempt.message ? friendlyFailureMessage(attempt.message) : undefined}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] ${chainTone(attempt.status)}`}
                    >
                      {chainIcon(attempt.status)}
                      <span className="font-semibold">{attemptStatusLabel(attempt.status)}</span>
                    </span>
                  ))}
                </div>
                <details className="mt-2 text-[10px] text-slate-600">
                  <summary className="cursor-pointer">분석 모델 기술 정보 보기</summary>
                  <div className="mt-2 space-y-1 font-mono">
                    {aiFallbackChain.map((attempt, index) => (
                      <p key={`${attempt.provider}-${attempt.model}-detail-${index}`}>
                        {attempt.provider} · {attempt.model}
                      </p>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {aiErrorSummary && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>일부 자동 분석 응답이 지연되었지만, 사용 가능한 결과와 규칙 기반 판단은 정상 표시됩니다.</p>
                  <details className="mt-1 text-[10px] text-amber-200/70">
                    <summary className="cursor-pointer">기술 정보 보기</summary>
                    <p className="mt-1 break-words font-mono">{aiErrorSummary}</p>
                  </details>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800/50 pt-4">
              <span className="text-[10px] italic text-slate-500">
                여러 분석 경로를 순서대로 확인해 가장 먼저 성공한 답변을 대표로 표시합니다.
              </span>
              <span className="text-[10px] tracking-tight text-slate-500">판단 보조 자료</span>
            </div>
          </div>
        </div>
      </Card>

      {!isAiGenerated && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-indigo-400" />
          <p className="text-[11px] text-indigo-300">
            자동 분석 응답이 늦을 때는 검증된 시장 규칙으로 만든 브리핑을 대신 표시합니다.
          </p>
        </div>
      )}
    </div>
  );
}
