import { TradeStatus } from '@/types';
import { EditDraft, statusOptions } from './shared';
import { TextInput } from './FormControls';

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

export function EditPanel({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: EditDraft;
  busy: boolean;
  onChange: (field: keyof EditDraft, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <TextInput label="티커" value={draft.ticker} onChange={(value) => onChange('ticker', value.toUpperCase())} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">상태</span>
          <select
            value={draft.status}
            onChange={(event) => onChange('status', event.target.value as TradeStatus)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <TextInput label="허용 손실 %" type="number" min="0.1" max="10" step="0.1" value={draft.risk_percent} onChange={(value) => onChange('risk_percent', value)} />
        <TextInput label="총 자본" type="number" value={draft.total_equity} onChange={(value) => onChange('total_equity', value)} />
        <TextInput label="계획 리스크" type="number" value={draft.planned_risk} onChange={(value) => onChange('planned_risk', value)} />
        <TextInput label="총 수량" type="number" value={draft.total_shares} onChange={(value) => onChange('total_shares', value)} />
        <TextInput label="진입가" type="number" value={draft.entry_price} onChange={(value) => onChange('entry_price', value)} />
        <TextInput label="손절가" type="number" value={draft.stoploss_price} onChange={(value) => onChange('stoploss_price', value)} />
        <TextInput label="실현 손익" type="number" value={draft.result_amount} onChange={(value) => onChange('result_amount', value)} />
        <TextInput label="규율 점수" type="number" min="0" max="100" value={draft.final_discipline} onChange={(value) => onChange('final_discipline', value)} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">진입 전 시나리오</span>
        <textarea
          value={draft.plan_note}
          onChange={(event) => onChange('plan_note', event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">무효화 조건</span>
        <textarea
          value={draft.invalidation_note}
          onChange={(event) => onChange('invalidation_note', event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">메모</span>
        <textarea
          value={draft.emotion_note}
          onChange={(event) => onChange('emotion_note', event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
        />
      </label>

      <div className="flex justify-end gap-2">
        <ActionButton onClick={onCancel} disabled={busy}>취소</ActionButton>
        <ActionButton onClick={onSave} disabled={busy}>{busy ? '저장 중...' : '저장'}</ActionButton>
      </div>
    </div>
  );
}
