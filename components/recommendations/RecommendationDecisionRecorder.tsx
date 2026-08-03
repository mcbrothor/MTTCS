'use client';

import { FormEvent, useState } from 'react';
import {
  assuranceFailureMessage,
  isRecommendationDecisionAppendResponse,
} from '@/lib/assurance/client-contracts';

const DECISIONS = [
  ['WATCH', '관찰'],
  ['ACCEPT', '채택'],
  ['REJECT', '거부'],
  ['NO_ACTION', '행동 없음'],
] as const;

const REASONS = [
  ['NEEDS_REVIEW', '추가 검토 필요'],
  ['RISK_POLICY', '위험 기준'],
  ['SETUP_QUALITY', '셋업 품질'],
  ['CAPITAL_LIMIT', '자본 한도'],
  ['RULE_COMPLIANT', '규칙 충족'],
] as const;

export default function RecommendationDecisionRecorder({ pickId }: { pickId: string }) {
  const [status, setStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const decisionCode = String(form.get('decisionCode') || '');
    setStatus('SAVING');
    setMessage('');
    try {
      const response = await fetch('/api/assurance/conditional-90', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'RECORD_DECISION',
          pickId,
          decisionCode,
          reasonCodes: [form.get('reasonCode')],
          rationale: form.get('rationale'),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(assuranceFailureMessage(payload, '결정 원장 기록에 실패했습니다.'));
      }
      if (!isRecommendationDecisionAppendResponse(payload, pickId, decisionCode)) {
        throw new Error('결정 원장 응답이 엄격한 기록 계약과 일치하지 않습니다. 저장 여부를 확인하기 전에는 성공으로 간주하지 않습니다.');
      }
      setStatus('SAVED');
      setMessage('결정을 불변 원장에 기록했습니다. 이 기록만으로 거래나 자본 승인이 생성되지는 않습니다.');
      formElement.reset();
    } catch (error) {
      setStatus('ERROR');
      setMessage(error instanceof Error ? error.message : '결정 원장 기록에 실패했습니다.');
    }
  }

  return (
    <details className="min-w-52 rounded-lg border border-slate-700 bg-slate-900/60 p-2">
      <summary className="cursor-pointer text-[11px] font-bold text-sky-200">결정 원장 기록</summary>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label className="block text-[10px] font-semibold text-slate-400">
          결정
          <select name="decisionCode" defaultValue="WATCH" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white">
            {DECISIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-[10px] font-semibold text-slate-400">
          주된 사유
          <select name="reasonCode" defaultValue="NEEDS_REVIEW" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white">
            {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-[10px] font-semibold text-slate-400">
          당시 판단 근거
          <textarea
            name="rationale"
            required
            minLength={10}
            maxLength={4000}
            rows={3}
            placeholder="결과를 보기 전 판단 근거를 10자 이상 기록"
            className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs leading-5 text-white placeholder:text-slate-600"
          />
        </label>
        <button
          type="submit"
          disabled={status === 'SAVING'}
          className="w-full rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 text-[11px] font-bold text-sky-200 disabled:cursor-wait disabled:opacity-60"
        >
          {status === 'SAVING' ? '기록 중…' : '불변 원장에 기록'}
        </button>
        {message && (
          <p role={status === 'ERROR' ? 'alert' : 'status'} className={`text-[10px] leading-4 ${status === 'ERROR' ? 'text-rose-300' : 'text-emerald-300'}`}>
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
