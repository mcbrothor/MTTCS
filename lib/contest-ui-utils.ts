import { ContestLlmOverall, ContestLlmRecommendation, RecommendationTier } from '@/types';

export function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function formatPrice(value: number | null | undefined, exchange?: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const currency = exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'KRW' : 'USD';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

export function tierClass(tier?: RecommendationTier | null) {
  if (tier === 'Recommended') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (tier === 'Partial') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (tier === 'Error') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-slate-700 text-slate-300';
}

export function verdictOverallClass(value: ContestLlmOverall | null) {
  if (value === 'POSITIVE') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (value === 'NEGATIVE') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (value === 'NEUTRAL') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-slate-700 text-slate-400';
}

export function verdictRecommendationClass(value: ContestLlmRecommendation | null) {
  if (value === 'PROCEED') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (value === 'SKIP') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (value === 'WATCH') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-slate-700 text-slate-400';
}
