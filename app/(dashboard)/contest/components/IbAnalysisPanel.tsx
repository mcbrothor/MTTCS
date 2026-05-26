import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown,
  ChevronUp,
  Clipboard,
  Target,
  Users,
  Send,
} from 'lucide-react';

import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { BeautyContestSession, ContestCandidate } from '@/types';

// lucide-react@1.8.0 bundler resolution workaround
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Copy, BrainCircuit } = require('lucide-react') as {
  Copy: React.FC<React.SVGProps<SVGSVGElement>>;
  BrainCircuit: React.FC<React.SVGProps<SVGSVGElement>>;
};

interface IbCandidateMeta {
  ticker: string;
  name?: string | null;
  ib_rank?: number;
  ib_verdict?: string;
  mtn_alignment?: string;
  price_target_12m?: string | null;
}

interface IbCommitteeAnalysis {
  committee_consensus?: {
    top3_tickers?: string[];
    mtn_alignment?: string;
    regime_label?: string;
  };
  candidates?: IbCandidateMeta[];
  report_markdown?: string;
}

interface IbAnalysisPanelProps {
  ibAnalysis: IbCommitteeAnalysis | null;
  ibBusy: boolean;
  localIbBusy: boolean;
  ibError: string | null;
  ibPromptOpen: boolean;
  ibPromptText: string | null;
  activeSession: BeautyContestSession | null;
  copyIbPrompt: () => void;
  runIbValidation: () => void;
  runLocalTelegramIbValidation: () => void;
  setIbPromptOpen: (open: boolean) => void;
}

function ibVerdictColor(verdict?: string) {
  if (verdict === 'STRONG_BUY' || verdict === 'BUY') return 'text-emerald-300';
  if (verdict === 'STRONG_SELL' || verdict === 'SELL') return 'text-rose-300';
  return 'text-amber-300';
}

function ibAlignmentBadge(alignment?: string) {
  if (alignment === 'CONFIRMS') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (alignment === 'DOWNGRADES') return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  if (alignment === 'UPGRADES') return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
}

function candidateName(activeSession: BeautyContestSession | null, ticker: string, meta?: IbCandidateMeta | null) {
  if (meta?.name) return meta.name;
  const sessionCandidates = (activeSession?.candidates || []) as ContestCandidate[];
  return sessionCandidates.find((candidate) => candidate.ticker === ticker)?.name || null;
}

function reportText(ibAnalysis: IbCommitteeAnalysis | null) {
  return typeof ibAnalysis?.report_markdown === 'string' && ibAnalysis.report_markdown.trim()
    ? ibAnalysis.report_markdown.trim()
    : '리포트 내용이 없습니다.';
}

function renderEngineBadge(providerString?: string | null) {
  if (!providerString) return null;
  const lower = providerString.toLowerCase();
  
  if (lower.includes('local-llm') || lower.includes('ollama')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-emerald-300">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        </span>
        🟢 Local M4 Engine (Qwen3.6:14B)
      </span>
    );
  }
  
  if (lower.includes('gemini')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-purple-300">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75"></span>
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-500"></span>
        </span>
        ⚡ Gemini Cloud (1.5 Pro)
      </span>
    );
  }

  let displayName = 'Cloud Fallback';
  if (lower.includes('groq')) displayName = 'Groq Cloud (Llama)';
  else if (lower.includes('cerebras')) displayName = 'Cerebras Cloud (Llama)';

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-amber-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"></span>
      </span>
      ⚠️ {displayName}
    </span>
  );
}


const IbAnalysisPanel: React.FC<IbAnalysisPanelProps> = ({
  ibAnalysis,
  ibBusy,
  localIbBusy,
  ibError,
  ibPromptOpen,
  ibPromptText,
  activeSession,
  copyIbPrompt,
  runIbValidation,
  runLocalTelegramIbValidation,
  setIbPromptOpen,
}) => {
  const topTickers = (ibAnalysis?.committee_consensus?.top3_tickers || []) as string[];
  const candidateMeta = (ibAnalysis?.candidates || []) as IbCandidateMeta[];

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/40 shadow-2xl">
      {!ibAnalysis ? (
        <div className="flex flex-col items-center justify-center space-y-6 p-12 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900 shadow-inner">
            <Users className="h-10 w-10 text-slate-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">IB 투자 위원회 검토</h3>
            <p className="max-w-sm text-sm leading-6 text-slate-500">
              MTN 1차 정량 평가를 바탕으로 펀더멘털, 촉매, 리스크, 집행 가능성을 재검토한 투자위원회 리포트를 생성합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button onClick={copyIbPrompt} variant="outline" className="h-12 gap-2 rounded-xl border-slate-700 px-6">
              <Copy className="h-4 w-4" /> 프롬프트 복사
            </Button>
            <Button
              onClick={runIbValidation}
              disabled={ibBusy || localIbBusy}
              className="h-12 gap-2 rounded-xl border-none bg-indigo-600 px-8 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
            >
              {ibBusy ? <LoadingSpinner /> : <BrainCircuit className="h-5 w-5" />}
              인앱 리포트 생성
            </Button>
            <Button
              onClick={runLocalTelegramIbValidation}
              disabled={localIbBusy || ibBusy}
              className="h-12 gap-2 rounded-xl border-none bg-sky-600 px-8 font-bold text-white shadow-lg shadow-sky-600/20 hover:bg-sky-500"
            >
              {localIbBusy ? <LoadingSpinner /> : <Send className="h-5 w-5" />}
              로컬 LLM + 텔레그램 전송 ✈️
            </Button>
          </div>
          {ibError && <p className="text-xs font-medium text-rose-400">오류: {ibError}</p>}
        </div>
      ) : (
        <div className="divide-y divide-slate-800/50">
          <div className="bg-indigo-500/5 p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/20">
                  <BrainCircuit className="h-8 w-8 text-white" />
                </div>
                <div>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <h3 className="text-xl font-black text-white">IB 투자 위원회 분석 완료</h3>
                    {renderEngineBadge(activeSession?.ib_provider)}
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-400">
                    {ibAnalysis.committee_consensus?.regime_label || '시장 국면 고려'} · {ibAnalysis.committee_consensus?.mtn_alignment || 'IB 최종 판단'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={copyIbPrompt} variant="outline" size="sm" className="h-9 gap-2 rounded-xl border-slate-700 px-3 text-xs text-slate-300">
                  <Copy className="h-3.5 w-3.5" /> 프롬프트 복사
                </Button>
                <Button
                  onClick={runIbValidation}
                  disabled={ibBusy || localIbBusy}
                  size="sm"
                  className="h-9 gap-2 rounded-xl border-none bg-indigo-600 px-4 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                >
                  {ibBusy ? <LoadingSpinner /> : <BrainCircuit className="h-4 w-4" />}
                  인앱 리포트 생성
                </Button>
                <Button
                  onClick={runLocalTelegramIbValidation}
                  disabled={localIbBusy || ibBusy}
                  size="sm"
                  className="h-9 gap-2 rounded-xl border-none bg-sky-600 px-4 text-xs font-bold text-white shadow-lg shadow-sky-600/20 hover:bg-sky-500"
                >
                  {localIbBusy ? <LoadingSpinner /> : <Send className="h-3.5 w-3.5" />}
                  로컬 LLM + 텔레그램 전송 ✈️
                </Button>
                <div className="mx-1 hidden h-4 w-px bg-slate-800 sm:block" />
                <Button onClick={() => setIbPromptOpen(!ibPromptOpen)} variant="ghost" size="sm" className="h-9 gap-2 px-3 text-xs text-slate-500 hover:text-slate-300">
                  {ibPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {ibPromptOpen ? '리포트 닫기' : '리포트 보기'}
                </Button>
              </div>
              {ibError && <p className="mt-1 text-right text-[10px] font-medium text-rose-400">오류: {ibError}</p>}
            </div>
          </div>

          {ibPromptOpen && (
            <div className="bg-slate-950/70 p-5 sm:p-8">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-inner">
                <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 shadow-lg shadow-sky-500/20">
                      <Clipboard className="h-4 w-4 text-sky-400" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">AI-CIO Daily Execution Briefing</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">프리미엄 AI 비서 실전 브리핑 · 전체 본문 스크롤 가능</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeSession?.ib_provider && (
                      <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        {activeSession.ib_provider}
                      </span>
                    )}
                    <span className="rounded-lg bg-sky-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-sky-300 shadow-sm">
                      AI-CIO Execution Guide
                    </span>
                  </div>
                </div>
                <div className="relative max-h-[72vh] overflow-y-auto bg-slate-900/80 px-6 py-8 sm:px-10 sm:py-12">
                  <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500"></div>
                  <div className="prose prose-invert max-w-none prose-headings:scroll-mt-24 prose-headings:font-black prose-headings:tracking-tight prose-h1:border-b prose-h1:border-slate-800 prose-h1:pb-4 prose-h1:text-3xl prose-h1:text-transparent prose-h1:bg-clip-text prose-h1:bg-gradient-to-r prose-h1:from-sky-400 prose-h1:to-indigo-300 prose-h2:mb-4 prose-h2:mt-10 prose-h2:border-b prose-h2:border-slate-800/60 prose-h2:pb-2 prose-h2:text-xl prose-h2:text-white prose-h3:text-lg prose-h3:text-sky-300 prose-p:text-slate-300 prose-p:leading-relaxed prose-strong:font-bold prose-strong:text-white prose-li:marker:text-sky-500 prose-blockquote:rounded-r-xl prose-blockquote:border-l-4 prose-blockquote:border-l-sky-500 prose-blockquote:bg-sky-500/10 prose-blockquote:px-6 prose-blockquote:py-3 prose-blockquote:font-medium prose-blockquote:text-sky-100 prose-blockquote:shadow-sm prose-table:text-sm prose-th:bg-slate-800/50 prose-th:border-slate-700 prose-th:py-3 prose-th:text-slate-200 prose-td:border-slate-800/50 prose-td:py-3">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {reportText(ibAnalysis)}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6 p-8">
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-400">위원회 선별 Top Pick</h4>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">IB Final Judgment</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {topTickers.map((ticker, idx) => {
                const meta = candidateMeta.find((candidate) => candidate.ticker === ticker);
                const name = candidateName(activeSession, ticker, meta);
                return (
                  <div key={ticker} className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-all hover:border-indigo-500/50">
                    <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-indigo-500/10 blur-xl group-hover:bg-indigo-500/20" />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-indigo-400">#{idx + 1}</span>
                          <p className="font-mono text-lg font-black text-white">{ticker}</p>
                        </div>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-400">{name || '종목명 미확인'}</p>
                      </div>
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold ${ibAlignmentBadge(meta?.mtn_alignment)}`}>
                        {meta?.mtn_alignment || 'NEW'}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-medium text-slate-500">위원회 판정</span>
                        <span className={`font-black ${ibVerdictColor(meta?.ib_verdict)}`}>{meta?.ib_verdict || 'BUY'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-medium text-slate-500">목표가(12M)</span>
                        <span className="font-bold text-white">{meta?.price_target_12m || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                        <Target className="h-3 w-3 text-indigo-400" />
                        <span>매매 계획 후보</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {ibPromptText && (
        <div className="flex items-center justify-between gap-4 border-t border-slate-800 bg-slate-900/80 p-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
              <Clipboard className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="max-w-md truncate text-xs font-medium text-slate-400">복사된 프롬프트를 외부 LLM에도 사용할 수 있습니다.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setIbPromptOpen(true)} className="text-[10px] font-bold uppercase text-slate-500">
            리포트 보기
          </Button>
        </div>
      )}
    </section>
  );
};

export default React.memo(IbAnalysisPanel);
