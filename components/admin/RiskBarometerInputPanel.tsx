'use client';

import { Database, ExternalLink, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type ManualKey = 'margin_debt' | 'capital_market_frenzy' | 'equity_risk_premium';

interface FormState {
  key: ManualKey;
  label: string;
  valueLabel: string;
  value: string;
  unit: string;
  period: string;
  observedAt: string;
  sourceUrl: string;
  note: string;
  approvedAt?: string;
}

interface StoredObservation {
  key: ManualKey;
  period: string;
  value: number;
  unit: string;
  sourceUrl: string;
  observedAt: string;
  approvedAt: string;
  note: string;
}

const today = new Date().toISOString().slice(0, 10);

const INITIAL: FormState[] = [
  {
    key: 'margin_debt',
    label: 'FINRA 마진 부채',
    valueLabel: '잔액 (USD, 예: 1500000000000)',
    value: '',
    unit: 'USD',
    period: today,
    observedAt: today,
    sourceUrl: 'https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics',
    note: '',
  },
  {
    key: 'capital_market_frenzy',
    label: '미국 IPO 조달액 비율',
    valueLabel: '최근 12개월 IPO / 주식 시총 (%)',
    value: '',
    unit: '%',
    period: today,
    observedAt: today,
    sourceUrl: 'https://www.sifma.org/research/statistics/us-equity-and-related-securities-statistics',
    note: '',
  },
  {
    key: 'equity_risk_premium',
    label: '미국 Forward P/E',
    valueLabel: 'Forward P/E (배)',
    value: '',
    unit: 'multiple',
    period: today,
    observedAt: today,
    sourceUrl: '',
    note: '',
  },
];

interface Envelope<T> {
  data?: T;
  message?: string;
}

export default function RiskBarometerInputPanel() {
  const [forms, setForms] = useState<FormState[]>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ManualKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const update = (key: ManualKey, patch: Partial<FormState>) => {
    setForms((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/risk-barometer/observations', { cache: 'no-store' });
      const payload = await response.json() as Envelope<{ observations: StoredObservation[] }>;
      if (!response.ok || !payload.data) throw new Error(payload.message || '바로미터 승인값 조회 실패');
      setForms((current) => current.map((form) => {
        const stored = payload.data?.observations.find((row) => row.key === form.key);
        return stored
          ? {
              ...form,
              value: String(stored.value),
              unit: stored.unit,
              period: stored.period,
              observedAt: stored.observedAt.slice(0, 10),
              sourceUrl: stored.sourceUrl,
              note: stored.note || '',
              approvedAt: stored.approvedAt,
            }
          : form;
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '바로미터 승인값 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(form: FormState) {
    setSaving(form.key);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/risk-barometer/observations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          observation: {
            key: form.key,
            period: form.period,
            value: Number(form.value),
            unit: form.unit,
            sourceUrl: form.sourceUrl,
            observedAt: `${form.observedAt}T23:59:59.000Z`,
            note: form.note,
          },
        }),
      });
      const payload = await response.json() as Envelope<{ observations: StoredObservation[] }>;
      if (!response.ok || !payload.data) throw new Error(payload.message || '승인값 저장 실패');
      await load();
      setMessage(`${form.label} 값을 승인 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '승인값 저장 실패');
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Database className="h-4 w-4 text-amber-300" />
            AI/FOMO 바로미터 승인 입력
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            자동 피드가 없는 FINRA·SIFMA·Forward P/E 값만 공식 원문 확인 후 승인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/80">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        원문 파일은 저장하지 않습니다. 숫자·기간·공식 URL·600자 이하 근거만 저장되며 승인자와 승인시각은 세션에서 자동 기록됩니다.
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {forms.map((form) => (
          <form
            key={form.key}
            onSubmit={(event) => {
              event.preventDefault();
              void save(form);
            }}
            className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">{form.label}</h3>
                <p className="mt-1 text-[10px] text-slate-500">
                  {form.approvedAt ? `최근 승인 ${new Date(form.approvedAt).toLocaleString('ko-KR')}` : '승인값 없음'}
                </p>
              </div>
              {form.sourceUrl && (
                <a href={form.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${form.label} 원문 열기`} className="text-sky-300">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <Field label={form.valueLabel}>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={form.value}
                onChange={(event) => update(form.key, { value: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="기준일">
                <input
                  type="date"
                  required
                  value={form.period}
                  onChange={(event) => update(form.key, { period: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"
                />
              </Field>
              <Field label="관측일">
                <input
                  type="date"
                  required
                  value={form.observedAt}
                  onChange={(event) => update(form.key, { observedAt: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"
                />
              </Field>
            </div>
            <Field label="공식 출처 URL">
              <input
                type="url"
                required
                value={form.sourceUrl}
                onChange={(event) => update(form.key, { sourceUrl: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />
            </Field>
            <Field label={`승인 근거 (${form.note.length}/600)`}>
              <textarea
                required
                maxLength={600}
                rows={3}
                value={form.note}
                onChange={(event) => update(form.key, { note: event.target.value })}
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs leading-5 text-white"
              />
            </Field>
            <button
              type="submit"
              disabled={saving !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving === form.key ? '저장 중' : '승인 저장'}
            </button>
          </form>
        ))}
      </div>
      {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-400">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
