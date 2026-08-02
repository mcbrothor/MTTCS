import { DEFAULT_NASDAQ_SETTINGS } from './policy';
import type {
  NasdaqSettingsPatch,
  NasdaqSettingsRecord,
} from './repository';

export function mapStoredNasdaqSettings(record: NasdaqSettingsRecord | null) {
  if (!record) {
    return {
      ...DEFAULT_NASDAQ_SETTINGS,
      updatedAt: null as string | null,
    };
  }
  return {
    ...DEFAULT_NASDAQ_SETTINGS,
    tacticalProduct: record.tacticalProduct,
    baseCurrency: record.baseCurrency,
    manualAccountValue: record.manualAccountValue,
    externalNasdaqValue: record.externalNasdaqValue,
    tqqqOptIn: record.tqqqOptIn,
    riskPaused: record.riskPaused,
    updatedAt: record.updatedAt,
  };
}

export function validateNasdaqSettingsPatch(body: unknown): NasdaqSettingsPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('설정 요청 body는 객체여야 합니다.');
  }
  const input = body as Record<string, unknown>;
  if ('user_id' in input || 'owner_id' in input || 'ownerId' in input) {
    throw new Error('소유자 식별자는 요청 body로 지정할 수 없습니다.');
  }
  const patch: NasdaqSettingsPatch = {};
  if (input.tacticalProduct !== undefined) {
    if (input.tacticalProduct !== 'QLD' && input.tacticalProduct !== 'TQQQ') {
      throw new Error('tacticalProduct는 QLD 또는 TQQQ여야 합니다.');
    }
    patch.tacticalProduct = input.tacticalProduct;
  }
  if (input.baseCurrency !== undefined) {
    if (input.baseCurrency !== 'KRW' && input.baseCurrency !== 'USD') {
      throw new Error('baseCurrency는 KRW 또는 USD여야 합니다.');
    }
    patch.baseCurrency = input.baseCurrency;
  }
  if (input.manualAccountValue !== undefined) {
    if (input.manualAccountValue === null || input.manualAccountValue === '') {
      patch.manualAccountValue = null;
    } else {
      const value = Number(input.manualAccountValue);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('manualAccountValue는 양수 또는 null이어야 합니다.');
      }
      patch.manualAccountValue = value;
    }
  }
  if (input.externalNasdaqValue !== undefined) {
    const value = Number(input.externalNasdaqValue);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('externalNasdaqValue는 0 이상의 숫자여야 합니다.');
    }
    patch.externalNasdaqValue = value;
  }
  for (const field of ['tqqqOptIn', 'riskPaused'] as const) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== 'boolean') {
        throw new Error(`${field}는 boolean이어야 합니다.`);
      }
      patch[field] = input[field];
    }
  }
  return patch;
}
