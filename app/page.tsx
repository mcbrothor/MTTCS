'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Activity, ArrowUpRight, BarChart3, CheckCircle2, Clipboard, ShieldAlert, Star } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useCommandCenterSummary } from '@/hooks/useCommandCenterSummary';
import type { MarketState, Trade } from '@/types';

const STATE_TONE: Record<MarketState | 'UNKNOWN', string> = {
  GREEN: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  YELLOW: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  RED: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
  GREY: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
  UNKNOWN: 'border-slate-700 bg-slate-900 text-slate-300',
};

function money(value: number, market: 'US' | 'KR') {
  return new Intl.NumberFormat(market === 'KR' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency: market === 'KR' ? 'KRW' : 'USD',
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return '--';
  return new Date(value).toLocaleString('ko-KR');
}

function statusLabel(trade: Trade) {
  if (trade.status === 'PLANNED') return '계획';
  if (trade.status === 'ACTIVE') return '진행';
  if (trade.status === 'COMPLETED') return '완료';
  return '취소';
}

export default function CommandCenterPage() {
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const summary = useCommandCenterSummary(market);
  const marketState = summary.marketState ?? 'UNKNOWN';

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Command Center</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">오늘의 의사결정</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            시장 상태를 확인하고, 후보 발굴부터 계획 저장까지 다음 행동만 빠르게 결정합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-1">
          {(['US', 'KR'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMarket(item)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                market === item ? 'bg-slate-700 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {item === 'US' ? '미국' : '한국'}
            </button>
          ))}
        </div>
      </header>

      {summary.error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {summary.error}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Next Action</p>
              <h2 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{summary.nextAction.label}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{summary.nextAction.reason}</p>
            </div>
            <Link
              href={summary.nextAction.href}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-500"
            >
              이동 <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatusCard icon={<Activity className="h-4 w-4" />} label="시장 상태" value={summary.marketState ?? '--'} tone={STATE_TONE[marketState]} loading={summary.loading} />
            <StatusCard icon={<BarChart3 className="h-4 w-4" />} label="매크로" value={summary.macroRegime ?? '--'} loading={summary.loading} />
            <StatusCard icon={<ShieldAlert className="h-4 w-4" />} label="오픈 리스크" value={money(summary.activeRisk, market)} loading={summary.loading} />
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Today Snapshot</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Updated {formatDate(summary.updatedAt)}</p>
            </div>
            {summary.loading && <LoadingSpinner />}
          </div>

          <div className="mt-5 grid gap-3">
            <MiniMetric icon={<Clipboard className="h-4 w-4" />} label="계획 대기" value={`${summary.plannedCount}건`} />
            <MiniMetric icon={<Star className="h-4 w-4" />} label="관심 후보" value={`${summary.recentCandidates.length}개`} />
            <MiniMetric icon={<CheckCircle2 className="h-4 w-4" />} label="최근 기록" value={`${summary.recentTrades.length}건`} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="관심 후보" actionHref="/watchlist" actionLabel="전체 보기">
          {summary.recentCandidates.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {summary.recentCandidates.map((item) => (
                <Link key={item.id} href={`/plan?ticker=${encodeURIComponent(item.ticker)}&exchange=${encodeURIComponent(item.exchange)}`} className="flex items-center justify-between gap-3 py-3 hover:text-emerald-200">
                  <div>
                    <p className="font-mono text-sm font-bold text-[var(--text-primary)]">{item.ticker}</p>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">{item.exchange} · priority {item.priority}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState href="/scanner" label="스캐너에서 후보 발굴" text="아직 표시할 관심 후보가 없습니다." />
          )}
        </Panel>

        <Panel title="최근 매매 흐름" actionHref="/history" actionLabel="복기 보기">
          {summary.recentTrades.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {summary.recentTrades.map((trade) => (
                <Link key={trade.id} href={`/history/${trade.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-emerald-200">
                  <div>
                    <p className="font-mono text-sm font-bold text-[var(--text-primary)]">{trade.ticker}</p>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">{statusLabel(trade)} · {formatDate(trade.updated_at)}</p>
                  </div>
                  <span className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                    {trade.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState href="/master-filter" label="시장부터 확인" text="아직 표시할 매매 기록이 없습니다." />
          )}
        </Panel>
      </section>

      <section className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-4 md:grid-cols-4">
        <FlowLink href="/master-filter" step="01" label="시장 확인" />
        <FlowLink href="/scanner" step="02" label="종목 발굴" />
        <FlowLink href="/contest" step="03" label="컨테스트" />
        <FlowLink href="/plan" step="05" label="매매 계획" />
      </section>
    </div>
  );
}

function StatusCard({ icon, label, value, tone = 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-primary)]', loading = false }: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: string;
  loading?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
        {icon}
        {label}
      </div>
      <p className="mt-3 font-mono text-xl font-bold">{loading ? '--' : value}</p>
    </div>
  );
}

function MiniMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
      <span className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">{icon}{label}</span>
      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function Panel({ title, actionHref, actionLabel, children }: { title: string; actionHref: string; actionLabel: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
        <Link href={actionHref} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
          {actionLabel}
        </Link>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({ href, label, text }: { href: string; label: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] p-5 text-center">
      <p className="text-sm text-[var(--text-secondary)]">{text}</p>
      <Link href={href} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">
        {label} <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function FlowLink({ href, step, label }: { href: string; step: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
      <span><span className="mr-2 font-mono text-[var(--text-tertiary)]">{step}</span>{label}</span>
      <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}
