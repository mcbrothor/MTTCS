'use client';

import { Save } from 'lucide-react';

export type StrategyInputCurrency = 'KRW' | 'USD';

const CURRENCY_OPTIONS: Array<{
  value: StrategyInputCurrency;
  label: string;
  symbol: string;
}> = [
  { value: 'KRW', label: 'KRW · 원화', symbol: '₩' },
  { value: 'USD', label: 'USD · 달러', symbol: '$' },
];

export function StrategySettingsHeader({
  title = '상품과 보유 금액 설정',
  description,
  saving,
  disabled,
  saveLabel,
}: {
  title?: string;
  description: string;
  saving: boolean;
  disabled: boolean;
  saveLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          Strategy Settings
        </p>
        <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Save className="h-4 w-4" />
        {saving ? '저장 중...' : saveLabel}
      </button>
    </div>
  );
}

export function StrategyCapitalInput({
  idPrefix,
  currency,
  value,
  description,
  onCurrencyChange,
  onValueChange,
}: {
  idPrefix: string;
  currency: StrategyInputCurrency;
  value: number | null;
  description: string;
  onCurrencyChange: (currency: StrategyInputCurrency) => void;
  onValueChange: (value: number | null) => void;
}) {
  const symbol = currency === 'KRW' ? '₩' : '$';

  return (
    <section
      data-testid={`${idPrefix}-capital-input`}
      className="rounded-xl border border-sky-400/30 bg-sky-500/8 p-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-sky-100">전략 계산 원금</p>
          <p className="mt-1 text-xs leading-5 text-sky-100/65">
            원금과 보유 평가액을 입력할 통화를 먼저 선택하세요.
          </p>
        </div>

        <fieldset className="shrink-0">
          <legend className="mb-1.5 text-[11px] font-semibold text-slate-400">입력 금액 단위</legend>
          <div className="grid grid-cols-2 rounded-lg border border-slate-700 bg-slate-950 p-1">
            {CURRENCY_OPTIONS.map((option) => (
              <label key={option.value} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={`${idPrefix}-currency`}
                  value={option.value}
                  checked={currency === option.value}
                  onChange={() => onCurrencyChange(option.value)}
                  className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                <span className="pointer-events-none block rounded-md px-3 py-2 text-center text-xs font-bold text-slate-400 transition-colors peer-checked:bg-sky-500 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-300">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label htmlFor={`${idPrefix}-manual-account-value`} className="mt-4 block">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          전략 계산 원금 (현재 원금)
          <span aria-hidden="true" className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-200">
            {currency}
          </span>
        </span>
        <div className="relative mt-2">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-base font-bold text-sky-200">
            {symbol}
          </span>
          <input
            id={`${idPrefix}-manual-account-value`}
            type="number"
            min="0"
            step={currency === 'KRW' ? '1' : '0.01'}
            value={value ?? ''}
            placeholder={currency === 'KRW' ? '예: 100000000' : '예: 100000'}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onValueChange(
                event.target.value.trim() && Number.isFinite(nextValue) && nextValue > 0
                  ? nextValue
                  : null,
              );
            }}
            className="w-full rounded-lg border border-sky-400/30 bg-slate-950 py-3 pl-8 pr-3 text-base font-bold text-white outline-none placeholder:text-slate-600 focus:border-sky-300"
          />
        </div>
      </label>

      <p className="mt-2 text-xs leading-5 text-sky-100/70">{description}</p>
      <p className="mt-2 rounded-md border border-amber-400/15 bg-amber-500/8 px-3 py-2 text-[11px] leading-5 text-amber-100/75">
        통화를 바꾸면 입력된 숫자를 자동 환산하지 않습니다. 선택한 {currency} 단위에 맞춰 원금과 보유 평가액을 확인한 뒤 저장하세요.
      </p>
    </section>
  );
}

export function StrategyMoneyInput({
  id,
  label,
  currency,
  value,
  onChange,
}: {
  id: string;
  label: string;
  currency: StrategyInputCurrency;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-400">
        {label}
        <span aria-hidden="true" className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
          {currency}
        </span>
      </span>
      <input
        id={id}
        aria-label={label}
        type="number"
        min="0"
        step={currency === 'KRW' ? '1' : '0.01'}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-400/60"
      />
    </label>
  );
}

export function StrategyRiskPause({
  checked,
  description,
  onChange,
}: {
  checked: boolean;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-4 flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-rose-500"
      />
      {description}
    </label>
  );
}
