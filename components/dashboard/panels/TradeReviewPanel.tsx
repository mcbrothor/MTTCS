import { useState } from 'react';
import type { Trade } from '@/types';
import { ReviewDraft, signedCurrency, toInput, setupTagOptions, mistakeTagOptions } from './shared';
import { TextInput } from './FormControls';
import { DetailMetric } from './TradeExecutionsPanel';

function TagChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function ReviewPanel({ trade, busy, onSave }: { trade: Trade; busy: boolean; onSave: (draft: ReviewDraft) => void }) {
  const [draft, setDraft] = useState<ReviewDraft>({
    final_discipline: toInput(trade.final_discipline),
    setup_tags: trade.setup_tags || [],
    mistake_tags: trade.mistake_tags || [],
    review_note: trade.review_note || '',
    review_action: trade.review_action || '',
  });

  const toggleTag = (field: 'setup_tags' | 'mistake_tags', tag: string) => {
    setDraft((prev) => {
      const current = prev[field];
      return {
        ...prev,
        [field]: current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
      };
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DetailMetric label="실현손익" value={signedCurrency(trade.metrics?.realizedPnL ?? trade.result_amount, trade.ticker)} />
        <DetailMetric label="최종 R" value={typeof trade.metrics?.rMultiple === 'number' ? `${trade.metrics.rMultiple.toFixed(2)}R` : '-'} />
        <DetailMetric label="슬리피지" value={typeof trade.metrics?.entrySlippagePct === 'number' ? `${trade.metrics.entrySlippagePct.toFixed(2)}%` : '-'} />
        <DetailMetric label="계획 실행률" value={`${(trade.metrics?.executionProgressPct || 0).toFixed(1)}%`} />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-400">셋업 태그</p>
        <div className="flex flex-wrap gap-2">
          {setupTagOptions.map((tag) => (
            <TagChip key={tag} active={draft.setup_tags.includes(tag)} onClick={() => toggleTag('setup_tags', tag)}>
              {tag}
            </TagChip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-400">실수 태그</p>
        <div className="flex flex-wrap gap-2">
          {mistakeTagOptions.map((tag) => (
            <TagChip key={tag} active={draft.mistake_tags.includes(tag)} onClick={() => toggleTag('mistake_tags', tag)}>
              {tag}
            </TagChip>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <TextInput
          label="규율 점수"
          type="number"
          min="0"
          max="100"
          value={draft.final_discipline}
          onChange={(value) => setDraft((prev) => ({ ...prev, final_discipline: value }))}
        />
        <div className="md:col-span-2">
          <TextInput
            label="다음 개선 액션"
            value={draft.review_action}
            onChange={(value) => setDraft((prev) => ({ ...prev, review_action: value }))}
          />
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">사후 복기 메모</span>
        <textarea
          value={draft.review_note}
          onChange={(event) => setDraft((prev) => ({ ...prev, review_note: event.target.value }))}
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          placeholder="좋았던 점, 놓친 점, 다음에 반복하거나 줄일 행동을 적어두세요."
        />
      </label>

      <div className="flex justify-end">
        <ActionButton onClick={() => onSave(draft)} disabled={busy}>
          {busy ? '저장 중...' : '복기 저장'}
        </ActionButton>
      </div>
    </div>
  );
}
