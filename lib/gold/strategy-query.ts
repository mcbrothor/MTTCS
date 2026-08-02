import {
  GOLD_PRODUCT_CODES,
  type GoldBaseCurrency,
  type GoldProductCode,
} from '@/lib/gold/api-contract';
import type { GoldStrategyOverrides } from '@/lib/gold/service';

function productOverride(
  value: string | null,
  field: string,
): GoldProductCode | undefined {
  if (value === null || value === '') return undefined;
  if (!GOLD_PRODUCT_CODES.includes(value as GoldProductCode)) {
    throw new Error(`${field}가 지원 상품 화이트리스트에 없습니다.`);
  }
  return value as GoldProductCode;
}

function currencyOverride(value: string | null): GoldBaseCurrency | undefined {
  if (value === null || value === '') return undefined;
  if (value !== 'KRW' && value !== 'USD') {
    throw new Error('baseCurrency는 KRW 또는 USD여야 합니다.');
  }
  return value;
}

export function parseGoldStrategyOverrides(url: string): GoldStrategyOverrides {
  const { searchParams } = new URL(url);
  const coreProduct = productOverride(
    searchParams.get('coreProduct'),
    'coreProduct',
  );
  const tacticalProduct = productOverride(
    searchParams.get('tacticalProduct'),
    'tacticalProduct',
  );
  const baseCurrency = currencyOverride(searchParams.get('baseCurrency'));

  return {
    ...(coreProduct ? { coreProduct } : {}),
    ...(tacticalProduct ? { tacticalProduct } : {}),
    ...(baseCurrency ? { baseCurrency } : {}),
  };
}
