import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Users, 
  Clipboard, 
  ChevronUp, 
  ChevronDown,
} from 'lucide-react';

// lucide-react@1.8.0 bundler resolution 이슈 대응
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Copy, BrainCircuit } = require('lucide-react') as {
  Copy: React.FC<React.SVGProps<SVGSVGElement>>;
  BrainCircuit: React.FC<React.SVGProps<SVGSVGElement>>;
};

import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { BeautyContestSession } from '@/types';

interface IbAnalysisPanelProps {
  ibAnalysis: any;
  ibBusy: boolean;
  ibError: string | null;
  ibPromptOpen: boolean;
  ibPromptText: string | null;
  activeSession: BeautyContestSession | null;
  copyIbPrompt: () => void;
  runIbValidation: () => void;
  setIbPromptOpen: (open: boolean) => void;
}

function ibVerdictColor(verdict?: string) {
  if (verdict === 'STRONG_BUY' || verdict === 'BUY') return 'text-emerald-400';
  if (verdict === 'STRONG_SELL' || verdict === 'SELL') return 'text-rose-400';
  return 'text-amber-400';
}

function ibAlignmentBadge(alignment?: string) {
  if (alignment === 'CONFIRMS') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (alignment === 'DOWNGRADES') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
}

const IbAnalysisPanel: React.FC<IbAnalysisPanelProps> = ({
  ibAnalysis,
  ibBusy,
  ibError,
  ibPromptOpen,
  ibPromptText,
  activeSession,
  copyIbPrompt,
  runIbValidation,
  setIbPromptOpen,
}) => {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/30 overflow-hidden shadow-2xl">
      {!ibAnalysis ? (
        <div className="p-12 flex flex-col items-center justify-center text-center space-y-6">
          <div className="h-20 w-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner">
            <Users className="h-10 w-10 text-slate-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">상세 투자 계획 영향 평가</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              MTN의 1차 정량 평가를 바탕으로 외부 LLM이 펀더멘털, 이벤트, 집행 리스크를 재검토하여 최종 투자 결정을 보완합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button 
              onClick={copyIbPrompt} 
              variant="outline" 
              className="gap-2 rounded-xl border-slate-700 h-12 px-6"
            >
              <Copy className="h-4 w-4" /> 프롬프트 복사
            </Button>
            <Button 
              onClick={runIbValidation} 
              disabled={ibBusy}
              className="h-12 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold gap-2 shadow-lg shadow-indigo-600/20 border-none"
            >
              {ibBusy ? <LoadingSpinner /> : <BrainCircuit className="h-5 w-5" />}
              인앱 분석 실행
            </Button>
          </div>
          {ibError && <p className="text-xs text-rose-400 font-medium">오류: {ibError}</p>}
        </div>
      ) : (
        <div className="divide-y divide-slate-800/50">
          <div className="p-8 bg-indigo-500/5">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <BrainCircuit className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">IB 투자 위원회 분석 완료</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    {ibAnalysis.committee_consensus?.regime_label || '시장 국면 고려'} · {ibAnalysis.committee_consensus?.mtn_alignment || 'MTN 의견 보완'}
                  </p>
                </div>
              </div>
              <Button 
                onClick={() => setIbPromptOpen(!ibPromptOpen)} 
                variant="ghost" 
                className="text-slate-500 hover:text-slate-300 gap-2 h-10"
              >
                {ibPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {ibPromptOpen ? '리포트 닫기' : '리포트 상세 보기'}
              </Button>
            </div>
          </div>

          {ibPromptOpen && (
            <div className="p-8 bg-slate-950/50 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-strong:text-emerald-400 prose-code:text-indigo-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {ibAnalysis.report_markdown || '리포트 내용이 없습니다.'}
                </ReactMarkdown>
              </div>
            </div>
          )}

          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">위원회 선별 Top Pick</h4>
              <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Decision Influencing Review</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(ibAnalysis.committee_consensus?.top3_tickers || []).map((ticker: string, idx: number) => {
                const meta = ibAnalysis.candidates?.find((c: any) => c.ticker === ticker);
                return (
                  <div key={ticker} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-5 group hover:border-indigo-500/50 transition-all">
                    <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-indigo-500/10 blur-xl group-hover:bg-indigo-500/20" />
                    <div className="flex items-center justify-between relative">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-indigo-400">#{idx + 1}</span>
                        <p className="font-mono text-lg font-black text-white">{ticker}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ibAlignmentBadge(meta?.mtn_alignment)}`}>
                        {meta?.mtn_alignment || 'NEW'}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500 font-medium">위원회 판정</span>
                        <span className={`font-black ${ibVerdictColor(meta?.ib_verdict)}`}>{meta?.ib_verdict || 'BUY'}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500 font-medium">목표가(12M)</span>
                        <span className="text-white font-bold">{meta?.price_target_12m || '-'}</span>
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
        <div className="p-6 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <Clipboard className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-xs text-slate-400 font-medium truncate max-w-md">복사된 프롬프트를 외부 LLM(ChatGPT, Claude 등)에 사용하세요.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setIbPromptOpen(true)} className="text-[10px] uppercase font-bold text-slate-500">
            상세 리포트 직접 보기
          </Button>
        </div>
      )}
    </section>
  );
};

export default React.memo(IbAnalysisPanel);
