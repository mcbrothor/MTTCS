'use client';

import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { MarketState } from '@/types';

interface StatusBadgeProps {
  state: MarketState;
  label?: string;
  size?: 'sm' | 'md';
}

const CONFIG = {
  GREEN: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    border: 'border-emerald-500/40',
    ariaLabel: '안전',
  },
  YELLOW: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    border: 'border-amber-500/40',
    ariaLabel: '경계',
  },
  RED: {
    icon: ShieldAlert,
    color: 'text-rose-400',
    border: 'border-rose-500/40',
    ariaLabel: '위험',
  },
} as const;

export default function StatusBadge({ state, label, size = 'md' }: StatusBadgeProps) {
  const { icon: Icon, color, border, ariaLabel } = CONFIG[state];
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <span
      role="status"
      aria-label={`상태: ${ariaLabel}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${color} ${border} ${textSize}`}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {label ?? state}
    </span>
  );
}
