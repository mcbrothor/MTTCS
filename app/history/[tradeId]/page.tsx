'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import axios from 'axios';
import FlowBanner from '@/components/layout/FlowBanner';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  formatHistoryConfidence,
  getHistoryChecklistSummary,
  getHistoryComparisonSummary,
} from '@/lib/history-presentation';
import type { Trade, TradeEntrySnapshot } from '@/types';

type Tone = 'positive' | 'mixed' | 'negative' | 'neutral';

const CHECKLIST_LABELS: Record<keyof TradeEntrySnapshot['checklist'], string> = {
  sepa: 'SEPA',
  market: 'Market',
  risk: 'Risk',
  entry: 'Entry',
  stoploss: 'Stop',
  exit: 'Exit',
  psychology: 'Psych',
};

function isKorean(ticker: string) {
  return /^\d{6}$/.test(ticker);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const absolute = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return `${value >= 0 ? '+' : '-'}${absolute}`;
}

function formatSignedCurrency(value: number | null | undefined, ticker: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const currency = isKorean(ticker) ? 'KRW' : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPrice(value: number | null | undefined, ticker: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const korean = isKorean(ticker);
  const currency = korean ? 'KRW' : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: korean ? 0 : 2,
    maximumFractionDigits: korean ? 0 : 2,
  }).format(value);
}

function toneClasses(tone: Tone) {
  if (tone === 'positive') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  if (tone === 'negative') return 'border-rose-400/30 bg-rose-500/10 text-rose-100';
  if (tone === 'mixed') return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
  return 'border-slate-700 bg-slate-900 text-slate-100';
}

function valueTone(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-slate-200';
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-rose-300';
  return 'text-slate-200';
}

function TagList({ tags, emptyLabel }: { tags: string[] | null | undefined; emptyLabel: string }) {
  if (!tags || tags.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200">
          {tag}
        </span>
      ))}
    </div>
  );
}

function SectionGlyph({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${tone}`}>
      {label}
    </span>
  );
}

function MetricTile({
  label,
  value,
  hint,
  accentClass = 'text-white',
}: {
  label: string;
  value: string;
  hint?: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-3 text-xl font-semibold ${accentClass}`}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default function HistoryTradeDetailPage() {
  const params = useParams<{ tradeId: string }>();
  const searchParams = useSearchParams();
  const tradeId = typeof params.tradeId === 'string' ? params.tradeId : '';

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function fetchTrades() {
      setLoading(true);
      setError(null);

      try {
        const response = await axios.get('/api/trades', { signal: controller.signal });
        if (!mounted) return;
        setTrades(response.data.data || []);
      } catch (err: unknown) {
        if (!mounted) return;
        const message = axios.isAxiosError(err)
          ? err.code === 'ERR_CANCELED'
            ? 'Loading timed out.'
            : err.response?.data?.message || err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load trade review.';
        setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchTrades();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const trade = useMemo(() => trades.find((item) => item.id === tradeId) ?? null, [tradeId, trades]);
  const fallbackMarket = trade && isKorean(trade.ticker) ? 'KR' : 'US';
  const market = searchParams.get('market') === 'KR' ? 'KR' : searchParams.get('market') === 'US' ? 'US' : fallbackMarket;
  const backHref = `/history?market=${market}`;

  if (loading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-12">
        <FlowBanner currentKey="review" />
        <Card className="border border-rose-500/30 bg-rose-500/10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-200">Review Error</p>
          <h1 className="mt-3 text-2xl font-bold text-white">Trade review could not be loaded.</h1>
          <p className="mt-3 text-sm text-rose-100">{error}</p>
          <Link href={backHref} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/5">
            <span aria-hidden="true">←</span>
            Back to history
          </Link>
        </Card>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="space-y-6 pb-12">
        <FlowBanner currentKey="review" />
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Review</p>
          <h1 className="mt-3 text-2xl font-bold text-white">Trade record was not found.</h1>
          <p className="mt-3 text-sm text-slate-400">
            The history list no longer contains this trade, or it may have been removed.
          </p>
          <Link href={backHref} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/5">
            <span aria-hidden="true">←</span>
            Back to history
          </Link>
        </Card>
      </div>
    );
  }

  const entrySnapshot = trade.entry_snapshot;
  const contestSnapshot = trade.contest_snapshot;
  const verdict = trade.llm_verdict;
  const checklist = getHistoryChecklistSummary(entrySnapshot);
  const comparison = getHistoryComparisonSummary(trade);
  const realizedPnL = trade.metrics?.realizedPnL ?? trade.result_amount;
  const realizedR = trade.metrics?.rMultiple ?? null;
  const planRisk = entrySnapshot?.plan.planned_risk ?? trade.planned_risk;

  return (
    <div className="space-y-6 pb-12">
      <FlowBanner currentKey="review" />

      <div className="flex flex-col gap-4 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(17,94,89,0.32))] px-6 py-6 shadow-[var(--panel-shadow)] lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition-colors hover:text-white">
            <span aria-hidden="true">←</span>
            Back to history
          </Link>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">History Review</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{trade.ticker} 3-Layer Review</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            Layer 1 records the original entry plan, Layer 2 keeps the contest and LLM verdict, and Layer 3 compares both with the actual outcome.
          </p>
        </div>

        <div className={`rounded-2xl border px-4 py-4 ${toneClasses(comparison.tone)}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-75">Comparison</p>
          <p className="mt-2 text-lg font-semibold">{comparison.headline}</p>
          <p className="mt-2 max-w-md text-sm opacity-90">{comparison.detail}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricTile label="Status" value={trade.status} />
        <MetricTile
          label="Realized PnL"
          value={formatSignedCurrency(realizedPnL, trade.ticker)}
          accentClass={valueTone(realizedPnL)}
        />
        <MetricTile
          label="R Multiple"
          value={typeof realizedR === 'number' ? `${formatSignedNumber(realizedR)}R` : '-'}
          accentClass={valueTone(realizedR)}
        />
        <MetricTile
          label="Discipline"
          value={typeof trade.final_discipline === 'number' ? `${trade.final_discipline}pt` : '-'}
          accentClass={typeof trade.final_discipline === 'number' && trade.final_discipline >= 80 ? 'text-emerald-300' : 'text-slate-100'}
        />
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <SectionGlyph label="C" tone="bg-emerald-500/10 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Layer 1</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Entry Snapshot</h2>
            <p className="mt-2 text-sm text-slate-400">
              What was checked before entry, how risk was sized, and which structural signals supported the plan.
            </p>
          </div>
        </div>

        {entrySnapshot ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 lg:grid-cols-4">
              <MetricTile
                label="Checklist"
                value={`${checklist.passed}/${checklist.total}`}
                hint={`${Math.round(checklist.passRate * 100)}% passed`}
                accentClass={checklist.failed === 0 ? 'text-emerald-300' : 'text-amber-200'}
              />
              <MetricTile
                label="SEPA Core"
                value={entrySnapshot.sepa.core_total ? `${entrySnapshot.sepa.core_passed ?? 0}/${entrySnapshot.sepa.core_total}` : '-'}
                hint={entrySnapshot.sepa.status ? `Status: ${entrySnapshot.sepa.status}` : undefined}
                accentClass={entrySnapshot.sepa.status === 'pass' ? 'text-emerald-300' : entrySnapshot.sepa.status === 'warning' ? 'text-amber-200' : 'text-slate-100'}
              />
              <MetricTile
                label="Risk"
                value={planRisk !== null ? formatSignedCurrency(planRisk, trade.ticker).replace('+', '') : '-'}
                hint={formatPercent(entrySnapshot.plan.risk_percent)}
              />
              <MetricTile
                label="VCP"
                value={entrySnapshot.vcp.grade || '-'}
                hint={typeof entrySnapshot.vcp.score === 'number' ? `Score ${formatNumber(entrySnapshot.vcp.score, 0)}` : undefined}
                accentClass={
                  entrySnapshot.vcp.grade === 'strong'
                    ? 'text-emerald-300'
                    : entrySnapshot.vcp.grade === 'forming'
                      ? 'text-amber-200'
                      : 'text-slate-100'
                }
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Checklist Detail</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(entrySnapshot.checklist).map(([key, passed]) => (
                    <span
                      key={key}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        passed
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                          : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                      }`}
                    >
                      {CHECKLIST_LABELS[key as keyof TradeEntrySnapshot['checklist']]} {passed ? 'Pass' : 'Fail'}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Plan Detail</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Entry</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formatPrice(entrySnapshot.plan.entry_price, trade.ticker)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Stop</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formatPrice(entrySnapshot.plan.stoploss_price, trade.ticker)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Shares</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formatNumber(entrySnapshot.plan.total_shares, 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">RS Rating</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {typeof entrySnapshot.sepa.rs_rating === 'number' ? formatNumber(entrySnapshot.sepa.rs_rating, 0) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Pivot</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formatPrice(entrySnapshot.vcp.pivot_price, trade.ticker)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Recommended Entry</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formatPrice(entrySnapshot.vcp.recommended_entry, trade.ticker)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Plan Note</p>
                <p className="mt-3 text-sm leading-6 text-slate-200">{entrySnapshot.notes.plan_note || 'No plan note recorded.'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Invalidation Note</p>
                <p className="mt-3 text-sm leading-6 text-slate-200">{entrySnapshot.notes.invalidation_note || 'No invalidation note recorded.'}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-400">No entry snapshot was stored for this trade.</p>
        )}
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <SectionGlyph label="L" tone="bg-sky-500/10 text-sky-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">Layer 2</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Contest Snapshot & LLM Verdict</h2>
            <p className="mt-2 text-sm text-slate-400">
              How the candidate was ranked in the contest and what the structured LLM verdict said at selection time.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <MetricTile label="User Rank" value={contestSnapshot ? `#${contestSnapshot.candidate.user_rank}` : '-'} />
          <MetricTile label="LLM Rank" value={contestSnapshot?.candidate.llm_rank ? `#${contestSnapshot.candidate.llm_rank}` : '-'} />
          <MetricTile
            label="Recommendation"
            value={verdict?.recommendation || contestSnapshot?.candidate.recommendation_tier || '-'}
            accentClass={verdict?.recommendation === 'PROCEED' ? 'text-emerald-300' : verdict?.recommendation === 'SKIP' ? 'text-rose-300' : 'text-slate-100'}
          />
          <MetricTile
            label="Confidence"
            value={formatHistoryConfidence(verdict?.confidence)}
            hint={verdict?.overall ? `Overall ${verdict.overall}` : contestSnapshot?.session.response_schema_version || undefined}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Contest Session</p>
            {contestSnapshot ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500">Session ID</p>
                  <p className="mt-1 break-all text-sm font-semibold text-white">{contestSnapshot.session.id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Universe</p>
                  <p className="mt-1 text-sm font-semibold text-white">{contestSnapshot.session.universe}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Market</p>
                  <p className="mt-1 text-sm font-semibold text-white">{contestSnapshot.session.market}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Selected</p>
                  <p className="mt-1 text-sm font-semibold text-white">{new Date(contestSnapshot.session.selected_at).toLocaleString('ko-KR')}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">No contest snapshot was linked to this trade.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Structured Verdict</p>
            {verdict ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {verdict.overall ? (
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        verdict.overall === 'POSITIVE'
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                          : verdict.overall === 'NEGATIVE'
                            ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                            : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                      }`}
                    >
                      {verdict.overall}
                    </span>
                  ) : null}
                  {verdict.recommendation ? (
                    <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">
                      {verdict.recommendation}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200">
                    Confidence {formatHistoryConfidence(verdict.confidence)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Key Strength</p>
                  <p className="mt-1 text-sm leading-6 text-slate-200">{verdict.key_strength || verdict.comment || 'No key strength recorded.'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Key Risk</p>
                  <p className="mt-1 text-sm leading-6 text-slate-200">{verdict.key_risk || 'No key risk recorded.'}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">No structured LLM verdict was stored for this trade.</p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <SectionGlyph label="R" tone="bg-amber-500/10 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Layer 3</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Actual Outcome</h2>
            <p className="mt-2 text-sm text-slate-400">
              What actually happened after entry, including realized result, rule compliance, and review notes.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <MetricTile label="Avg Entry" value={formatPrice(trade.metrics?.avgEntryPrice ?? trade.entry_price, trade.ticker)} />
          <MetricTile label="Avg Exit" value={formatPrice(trade.metrics?.avgExitPrice ?? trade.exit_price, trade.ticker)} />
          <MetricTile label="Net Shares" value={formatNumber(trade.metrics?.netShares ?? trade.total_shares, 0)} />
          <MetricTile label="Exit Reason" value={trade.exit_reason || '-'} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-2">
              <SectionGlyph label="!" tone="bg-amber-500/10 text-amber-300" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Rule Compliance</p>
            </div>
            <p className="mt-4 text-sm font-semibold text-white">
              {(trade.mistake_tags || []).includes('plan_violation')
                ? 'Plan drift was explicitly recorded.'
                : 'No plan-violation tag is recorded.'}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {typeof trade.final_discipline === 'number'
                ? `Final discipline score: ${trade.final_discipline}pt`
                : 'Final discipline score is not available.'}
            </p>
            <div className="mt-4">
              <p className="text-xs text-slate-500">Mistake Tags</p>
              <div className="mt-2">
                <TagList tags={trade.mistake_tags} emptyLabel="No mistake tags recorded." />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs text-slate-500">Setup Tags</p>
              <div className="mt-2">
                <TagList tags={trade.setup_tags} emptyLabel="No setup tags recorded." />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Review Notes</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs text-slate-500">Review Note</p>
                <p className="mt-1 text-sm leading-6 text-slate-200">{trade.review_note || 'No review note recorded.'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Next Action</p>
                <p className="mt-1 text-sm leading-6 text-slate-200">{trade.review_action || 'No follow-up action recorded.'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Emotion Note</p>
                <p className="mt-1 text-sm leading-6 text-slate-200">{trade.emotion_note || 'No emotion note recorded.'}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
