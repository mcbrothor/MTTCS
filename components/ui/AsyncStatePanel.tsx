'use client';

import { type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Database, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type AsyncState = 'loading' | 'empty' | 'error';

interface AsyncAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
}

interface AsyncStatePanelProps {
  state: AsyncState;
  title: string;
  message: string;
  delayedTitle?: string;
  delayedMessage?: string;
  delayMs?: number;
  primaryAction?: AsyncAction;
  secondaryAction?: AsyncAction;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
}

export default function AsyncStatePanel({
  state,
  title,
  message,
  delayedTitle,
  delayedMessage,
  delayMs = 4000,
  primaryAction,
  secondaryAction,
  onRetry,
  className = '',
  children,
}: AsyncStatePanelProps) {
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    if (state !== 'loading' || (!delayedTitle && !delayedMessage)) {
      return;
    }
    const timer = setTimeout(() => {
      setIsDelayed(true);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      setIsDelayed(false);
    };
  }, [state, delayedTitle, delayedMessage, delayMs]);

  const hasDelayed = state === 'loading' && isDelayed && Boolean(delayedTitle || delayedMessage);
  const displayTitle = hasDelayed && delayedTitle ? delayedTitle : title;
  const displayMessage = hasDelayed && delayedMessage ? delayedMessage : message;
  const showRetry = onRetry && (state !== 'loading' || hasDelayed);

  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-950/55 p-6 text-slate-300 ${className}`}>
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
          {state === 'loading' && !hasDelayed ? (
            <LoadingSpinner />
          ) : state === 'error' || hasDelayed ? (
            <AlertTriangle className="h-5 w-5 text-rose-300" />
          ) : (
            <Database className="h-5 w-5 text-emerald-300" />
          )}
        </div>
        <div>
          <p className="text-base font-bold text-white">{displayTitle}</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{displayMessage}</p>
        </div>
        {children}
        {(primaryAction || secondaryAction || showRetry) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {showRetry && (
              <Button type="button" variant="outline" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>
                다시 불러오기
              </Button>
            )}
            {primaryAction && <AsyncActionButton action={primaryAction} />}
            {secondaryAction && <AsyncActionButton action={secondaryAction} />}
          </div>
        )}
      </div>
    </div>
  );
}

function AsyncActionButton({ action }: { action: AsyncAction }) {
  const button = (
    <Button type="button" variant={action.variant ?? 'primary'} onClick={action.onClick}>
      {action.label}
    </Button>
  );

  if (!action.href) return button;
  return <Link href={action.href}>{button}</Link>;
}
