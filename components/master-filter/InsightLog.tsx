'use client';

import { useMarket } from '@/contexts/MarketContext';
import { Bot } from 'lucide-react';
import Card from '@/components/ui/Card';

export default function InsightLog() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <Card className="animate-pulse bg-slate-800/30">
        <div className="h-16" />
      </Card>
    );
  }

  const { insightLog, state } = data;

  const bgBorder = state === 'GREEN' 
    ? 'border-emerald-500/30 bg-emerald-500/5' 
    : state === 'RED'
      ? 'border-rose-500/30 bg-rose-500/5'
      : 'border-amber-500/30 bg-amber-500/5';

  return (
    <Card className={`mt-4 ${bgBorder}`}>
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-slate-800 p-2 border border-slate-700">
          <Bot className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Centaur Insight Log</h3>
          <p className="mt-2 text-slate-300 leading-relaxed">
            &quot;{insightLog}&quot;
          </p>
        </div>
      </div>
    </Card>
  );
}
