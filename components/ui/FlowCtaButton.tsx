'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import Button from '@/components/ui/Button';

interface FlowCtaButtonProps {
  nextPath: string;
  label: string;
  subLabel?: string;
  variant?: 'rose' | 'emerald' | 'indigo';
  show?: boolean;
  mobileBehavior?: 'hidden' | 'inline';
  disabledReason?: string;
}

type MotionDivProps = React.HTMLAttributes<HTMLDivElement> & {
  initial?: unknown;
  animate?: unknown;
  whileHover?: unknown;
  whileTap?: unknown;
};

const MotionDiv = motion.div as React.ComponentType<MotionDivProps>;

export default function FlowCtaButton({ 
  nextPath, 
  label, 
  subLabel,
  variant = 'rose',
  show = true,
  mobileBehavior = 'hidden',
  disabledReason,
}: FlowCtaButtonProps) {
  const colorMap = {
    rose: 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20',
    emerald: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20',
    indigo: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20',
  };

  if (!show) return null;

  const wrapperClass =
    mobileBehavior === 'inline'
      ? 'mt-6 md:fixed md:bottom-8 md:right-8 md:z-[50]'
      : 'fixed bottom-8 right-8 z-[50] hidden md:block';

  const content = (
    <Button
      disabled={Boolean(disabledReason)}
      title={disabledReason}
      className={`
        h-auto py-4 px-8 rounded-2xl flex items-center gap-4 border-none text-white shadow-2xl transition-all
        ${colorMap[variant]}
      `}
    >
      <div className="text-left">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">
          {subLabel || 'Next Step'}
        </p>
        <p className="text-lg font-black tracking-tight">
          {label}
        </p>
      </div>
      <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
        <ArrowUpRight className="h-6 w-6" />
      </div>
    </Button>
  );

  return (
    <div className={wrapperClass}>
      <MotionDiv
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {disabledReason ? content : <Link href={nextPath}>{content}</Link>}
      </MotionDiv>
    </div>
  );
}
