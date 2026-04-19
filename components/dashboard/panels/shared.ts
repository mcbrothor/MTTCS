import type {
  EntryTargets,
  Trade,
  TradeExecutionSide,
  TradeLegLabel,
  TradeStatus,
  TrailingStops,
} from '@/types';

export interface EditDraft {
  ticker: string;
  status: TradeStatus;
  total_equity: string;
  planned_risk: string;
  risk_percent: string;
  entry_price: string;
  stoploss_price: string;
  total_shares: string;
  result_amount: string;
  final_discipline: string;
  emotion_note: string;
  plan_note: string;
  invalidation_note: string;
}

export interface ExecutionDraft {
  side: TradeExecutionSide;
  leg_label: TradeLegLabel;
  executed_at: string;
  price: string;
  shares: string;
  fees: string;
  note: string;
}

export interface ReviewDraft {
  final_discipline: string;
  setup_tags: string[];
  mistake_tags: string[];
  review_note: string;
  review_action: string;
}

export const statusOptions: TradeStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
export const setupTagOptions = ['VCP', 'SEPA', '돌파', '실적', '추세', '관심종목'];
export const mistakeTagOptions = ['추격매수', '손절지연', '비중초과', '조기매도', '계획미준수', '진입지연'];

export const isKorean = (ticker?: string) => ticker && /^\d{6}$/.test(ticker);

export const currency = (value: number | null | undefined, ticker?: string) =>
  typeof value === 'number' && Number.isFinite(value)
    ? isKorean(ticker)
      ? new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(Math.round(value))
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
    : '-';

export const numberText = (value: number | null | undefined, suffix = '') =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString()}${suffix}` : '-';

export const signedCurrency = (value: number | null | undefined, ticker?: string) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${currency(value, ticker)}` : '-';

export const dateInputValue = (date?: string | null) => {
  const source = date ? new Date(date) : new Date();
  return Number.isNaN(source.getTime()) ? new Date().toISOString().slice(0, 10) : source.toISOString().slice(0, 10);
};

export const toInput = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

export const toNumberOrNull = (value: string) => {
  if (value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export function getRiskPercent(trade: Trade) {
  if (typeof trade.risk_percent === 'number' && Number.isFinite(trade.risk_percent)) return trade.risk_percent;
  if (trade.total_equity && trade.planned_risk) return trade.planned_risk / trade.total_equity;
  return 0.03;
}

export function getEntryTargets(value: EntryTargets | string | null): EntryTargets | null {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as EntryTargets;
  } catch {
    return null;
  }
}

export function getTrailingStops(value: TrailingStops | string | null): TrailingStops | null {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as TrailingStops;
  } catch {
    return null;
  }
}

export function getSepaEvidence(value: unknown | string | null): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

