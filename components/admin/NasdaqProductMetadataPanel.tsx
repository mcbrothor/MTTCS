'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Save } from 'lucide-react';
import type { NasdaqProductMetadataRecord } from '@/lib/nasdaq/repository';

interface Envelope<T> {
  data?: T;
  message?: string;
}

export default function NasdaqProductMetadataPanel() {
  const [rows, setRows] = useState<NasdaqProductMetadataRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/nasdaq/products');
      const payload = await response.json() as Envelope<NasdaqProductMetadataRecord[]>;
      if (!response.ok || !payload.data) throw new Error(payload.message || '상품 비용 조회 실패');
      setRows(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '상품 비용 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (
    product: string,
    patch: Partial<NasdaqProductMetadataRecord>,
  ) => {
    setRows((current) => current.map((row) => (
      row.product === product ? { ...row, ...patch } : row
    )));
  };

  const save = async (row: NasdaqProductMetadataRecord) => {
    setSaving(row.product);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/nasdaq/products', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          product: row.product,
          leverageMultiple: row.leverageMultiple,
          grossExpenseRatioPct: row.grossExpenseRatioPct,
          netExpenseRatioPct: row.netExpenseRatioPct,
          effectiveDate: row.effectiveDate,
          reviewAfter: row.reviewAfter,
          sourceUrl: row.sourceUrl,
        }),
      });
      const payload = await response.json() as Envelope<NasdaqProductMetadataRecord>;
      if (!response.ok || !payload.data) throw new Error(payload.message || '상품 비용 저장 실패');
      update(row.product, payload.data);
      setMessage(`${row.product} 비용 메타데이터를 승인 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '상품 비용 저장 실패');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-violet-500/25 bg-violet-500/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">나스닥 ETF 비용 메타데이터</h2>
          <p className="mt-1 text-sm text-slate-400">
            운용사 원문을 확인해 비용·면제 만료일을 승인합니다. 재검토일이 지나면 레버리지 신규 비중은 0%로 차단됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.product} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <strong className="text-lg text-white">{row.product}</strong>
              <span className="text-xs text-violet-300">일일 {row.leverageMultiple}×</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="총비용(%)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.grossExpenseRatioPct}
                  onChange={(event) => update(row.product, {
                    grossExpenseRatioPct: Number(event.target.value),
                  })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                />
              </Field>
              <Field label="순비용(%)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.netExpenseRatioPct}
                  onChange={(event) => update(row.product, {
                    netExpenseRatioPct: Number(event.target.value),
                  })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                />
              </Field>
              <Field label="적용일">
                <input
                  type="date"
                  value={row.effectiveDate}
                  onChange={(event) => update(row.product, { effectiveDate: event.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                />
              </Field>
              <Field label="재검토일">
                <input
                  type="date"
                  value={row.reviewAfter}
                  onChange={(event) => update(row.product, { reviewAfter: event.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                />
              </Field>
            </div>
            <Field label="운용사 원문">
              <input
                type="url"
                value={row.sourceUrl}
                onChange={(event) => update(row.product, { sourceUrl: event.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
              />
            </Field>
            <div className="flex items-center justify-between">
              <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300">
                원문 확인 <ExternalLink className="h-3 w-3" />
              </a>
              <button
                type="button"
                onClick={() => void save(row)}
                disabled={saving !== null}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving === row.product ? '저장 중' : '승인 저장'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {message && <p className="text-sm text-amber-200">{message}</p>}
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
