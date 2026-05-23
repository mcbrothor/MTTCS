import React from 'react';

// lucide-react@1.8.0 bundler resolution 이슈 대응
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Zap, Crown } = require('lucide-react') as {
  Zap: React.FC<React.SVGProps<SVGSVGElement>>;
  Crown: React.FC<React.SVGProps<SVGSVGElement>>;
};

interface AnalyzingViewProps {
  llmSaveMessage: string | null;
}

const AnalyzingView: React.FC<AnalyzingViewProps> = ({ llmSaveMessage }) => {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center space-y-8 animate-in fade-in duration-1000">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-slate-900 border-2 border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
          <Zap className="h-16 w-16 text-emerald-400 animate-pulse" />
        </div>
      </div>
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-black text-white tracking-tight flex items-center justify-center gap-3">
          <Crown className="h-8 w-8 text-amber-400" />
          정량 평가 엔진 가동 중
        </h2>
        <div className="flex flex-col items-center gap-2">
          <p className="text-slate-400 font-medium">MTN Rule Engine이 기술적 우위와 VCP 패턴을 분석하고 있습니다...</p>
          {llmSaveMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 border border-emerald-500/20">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">{llmSaveMessage}</span>
            </div>
          )}
        </div>
      </div>
      <div className="w-full max-w-md h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
        <div className="h-full bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-600 animate-progress-indeterminate" />
      </div>
    </section>
  );
};

export default React.memo(AnalyzingView);
