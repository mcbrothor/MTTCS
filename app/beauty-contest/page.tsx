'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Compass, Clipboard, Sparkles, Trash2, Trophy, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';
import MarketBanner from '@/components/ui/MarketBanner';
import { ScannerResult } from '@/types';
import { generateBeautyContestPrompt } from '@/lib/ai/prompt-generator';

export default function BeautyContestPage() {
  const [candidates, setCandidates] = useState<ScannerResult[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    let timeout: number | null = null;
    const raw = localStorage.getItem('mtn:contest-candidates');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ScannerResult[];
        timeout = window.setTimeout(() => setCandidates(parsed), 0);
      } catch (e) {
        console.error('Failed to parse candidates', e);
      }
    }
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  const handleGeneratePrompt = () => {
    const generated = generateBeautyContestPrompt(candidates);
    setPrompt(generated);
  };

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const removeCandidate = (ticker: string) => {
    const updated = candidates.filter((c) => c.ticker !== ticker);
    setCandidates(updated);
    localStorage.setItem('mtn:contest-candidates', JSON.stringify(updated));
  };

  return (
    <div className="container mx-auto space-y-8 px-4 py-8 max-w-6xl relative">
      <MarketBanner />

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: -40, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -40, x: '-50%' }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed top-12 left-1/2 z-[9999] flex items-center gap-3 rounded-2xl border border-emerald-500 bg-slate-900/95 px-8 py-4 shadow-[0_20px_50px_rgba(16,185,129,0.4)] backdrop-blur-2xl"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white tracking-tight">클립보드 복사 완료</span>
              <span className="text-[10px] text-emerald-400/80">LLM 분석을 위한 준비가 끝났습니다.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/scanner">
            <button className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all">
              <Compass className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Trophy className="h-8 w-8 text-amber-400" /> 뷰티 콘테스트
            </h1>
            <p className="text-slate-400 mt-1">최고의 주도주 선별을 위한 정밀 분석 패키지를 생성합니다.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left: Candidates List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">후보 종목 ({candidates.length})</h2>
            {candidates.length > 0 && (
              <Button 
                onClick={handleGeneratePrompt}
                className="bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
                icon={<Sparkles className="h-4 w-4" />}
                size="sm"
              >
                프롬프트 생성
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {candidates.map((c) => (
              <motion.div 
                key={c.ticker}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.01 }}
                className="group relative flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-slate-700 transition-all"
              >
                <div className="flex flex-col">
                  <span className="font-bold text-white tracking-tight">{c.ticker}</span>
                  <span className="text-xs text-slate-500 truncate max-w-[150px]">{c.name}</span>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-xs font-bold ${c.vcpGrade === 'strong' ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {c.vcpGrade}
                    </div>
                    <div className="text-[10px] text-slate-500">{c.vcpScore}점</div>
                  </div>
                  <button 
                    onClick={() => removeCandidate(c.ticker)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ))}

            {candidates.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center">
                <p className="text-slate-500 text-sm">먼저 스캐너에서 후보를 선택해 주세요.</p>
                <Link href="/scanner" className="mt-4 inline-block text-emerald-400 text-sm hover:underline">
                  스캐너로 이동
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right: Generated Prompt */}
        <div className="lg:col-span-8">
          <motion.div 
            layout
            className="flex flex-col h-full min-h-[500px] rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-6 py-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                <h3 className="font-semibold text-white">글로벌 IB 리서치 프롬프트</h3>
              </div>
              <button
                onClick={handleCopy}
                disabled={!prompt}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  prompt 
                    ? 'bg-slate-800 text-white hover:bg-slate-700 active:scale-95' 
                    : 'text-slate-600 bg-slate-900/50 cursor-not-allowed'
                }`}
              >
                <Clipboard className={`h-4 w-4 ${showToast ? 'text-emerald-400' : ''}`} />
                {showToast ? '복사 완료' : '프롬프트 복사'}
              </button>
            </div>

            <div className="flex-1 p-6 font-mono text-sm leading-relaxed overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-800">
              {prompt ? (
                <pre className="whitespace-pre-wrap text-slate-300 select-all">{prompt}</pre>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-slate-600 gap-4 opacity-50">
                  <Clipboard className="h-12 w-12" />
                  <p className="text-center">왼쪽의 &apos;프롬프트 생성&apos; 버튼을 누르면<br />최신 데이터가 포함된 전문 분석 지시문이 준비됩니다.</p>
                </div>
              )}
            </div>
            
            <div className="bg-emerald-500/5 border-t border-emerald-500/10 p-4">
              <p className="text-[11px] text-emerald-500/70 text-center leading-normal">
                이 프롬프트는 <strong>제공된 주가 데이터, VCP 분석 결과, 펀더멘탈 지표</strong>를 체계적으로 요약하여 외부 LLM이 가장 정확한 주도주 판별을 수행하도록 설계되었습니다. 복사 후 <strong>Gemini 1.5 Pro, Claude 3.5 Sonnet, GPT-4o</strong> 등에 붙여넣으세요.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
