import {
  GOLD_PRODUCT_CODES,
  type GoldExecutionLevels,
  type GoldProductCode,
  type GoldSettingsView,
} from './api-contract';
import type {
  GoldStrategySettingsRecord,
  GoldStrategySettingsUpsert,
} from './repository';

export const GOLD_REFERENCE_SCENARIO = {
  instrument: 'XAU/USD' as const,
  asOf: '2026-07-24' as const,
  expiresAt: '2026-07-30T23:59:59Z' as const,
  active: false as const,
  support: [3950, 4000] as [3950, 4000],
  resistance: [4165, 4185] as [4165, 4185],
  upsideScenario: 4500 as const,
  note: '만료된 운영자 참고 시나리오입니다. GLD나 국내 ETF 가격으로 환산하거나 활성 신호에 사용하지 않습니다.',
};

export const DEFAULT_GOLD_SETTINGS: GoldSettingsView = {
  coreProduct: '411060',
  tacticalProduct: '132030',
  baseCurrency: 'KRW',
  manualAccountValue: null,
  externalGoldValue: 0,
  physicalGoldValue: 0,
  executionLevels: {},
  riskPaused: false,
  updatedAt: null,
};

function finiteNonNegative(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${field}는 0 이상의 숫자여야 합니다.`);
  }
  return number;
}

function nullablePositive(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field}는 양수 또는 null이어야 합니다.`);
  }
  return number;
}

function productCode(value: unknown, field: string): GoldProductCode {
  if (typeof value !== 'string' || !GOLD_PRODUCT_CODES.includes(value as GoldProductCode)) {
    throw new Error(`${field}가 지원 상품 화이트리스트에 없습니다.`);
  }
  return value as GoldProductCode;
}

function normalizeExecutionLevels(value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('executionLevels는 상품별 객체여야 합니다.');
  }
  const result: Partial<Record<GoldProductCode, GoldExecutionLevels>> = {};
  for (const [key, raw] of Object.entries(value)) {
    const product = productCode(key, 'executionLevels 상품');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`${product} 실행 레벨은 객체여야 합니다.`);
    }
    const row = raw as Record<string, unknown>;
    result[product] = {
      support: nullablePositive(row.support, `${product} support`),
      resistance: nullablePositive(row.resistance, `${product} resistance`),
      target: nullablePositive(row.target, `${product} target`),
      updatedAt: new Date().toISOString(),
    };
  }
  return result;
}

export function mapStoredGoldSettings(
  record: GoldStrategySettingsRecord | null,
): GoldSettingsView {
  if (!record) return { ...DEFAULT_GOLD_SETTINGS };
  return {
    coreProduct: record.coreProduct,
    tacticalProduct: record.tacticalProduct,
    baseCurrency: record.baseCurrency,
    manualAccountValue: record.manualAccountValue,
    externalGoldValue: record.externalGoldValue,
    physicalGoldValue: record.physicalGoldValue,
    executionLevels:
      record.executionLevels as Partial<Record<GoldProductCode, GoldExecutionLevels>>,
    riskPaused: record.riskPaused,
    updatedAt: record.updatedAt,
  };
}

export function validateGoldSettingsPatch(body: unknown): GoldStrategySettingsUpsert {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('설정 요청 body는 객체여야 합니다.');
  }
  const input = body as Record<string, unknown>;
  if ('user_id' in input || 'owner_id' in input || 'ownerId' in input) {
    throw new Error('소유자 식별자는 요청 body로 지정할 수 없습니다.');
  }

  const patch: GoldStrategySettingsUpsert = {};
  if (input.coreProduct !== undefined) {
    patch.coreProduct = productCode(input.coreProduct, 'coreProduct');
  }
  if (input.tacticalProduct !== undefined) {
    patch.tacticalProduct = productCode(input.tacticalProduct, 'tacticalProduct');
  }
  if (input.baseCurrency !== undefined) {
    if (input.baseCurrency !== 'KRW' && input.baseCurrency !== 'USD') {
      throw new Error('baseCurrency는 KRW 또는 USD여야 합니다.');
    }
    patch.baseCurrency = input.baseCurrency;
  }
  if (input.manualAccountValue !== undefined) {
    patch.manualAccountValue = nullablePositive(
      input.manualAccountValue,
      'manualAccountValue',
    );
  }
  if (input.externalGoldValue !== undefined) {
    patch.externalGoldValue = finiteNonNegative(input.externalGoldValue, 'externalGoldValue');
  }
  if (input.physicalGoldValue !== undefined) {
    patch.physicalGoldValue = finiteNonNegative(input.physicalGoldValue, 'physicalGoldValue');
  }
  if (input.riskPaused !== undefined) {
    if (typeof input.riskPaused !== 'boolean') {
      throw new Error('riskPaused는 boolean이어야 합니다.');
    }
    patch.riskPaused = input.riskPaused;
  }
  const executionLevels = normalizeExecutionLevels(input.executionLevels);
  if (executionLevels !== undefined) {
    patch.executionLevels = executionLevels as Record<string, unknown>;
  }
  return patch;
}
