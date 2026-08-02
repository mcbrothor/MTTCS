import type { NasdaqStrategyOverrides } from './service';

export function parseNasdaqStrategyOverrides(url: string): NasdaqStrategyOverrides {
  const { searchParams } = new URL(url);
  const tactical = searchParams.get('tacticalProduct');
  const currency = searchParams.get('baseCurrency');
  if (tactical && tactical !== 'QLD' && tactical !== 'TQQQ') {
    throw new Error('tacticalProduct는 QLD 또는 TQQQ여야 합니다.');
  }
  if (currency && currency !== 'KRW' && currency !== 'USD') {
    throw new Error('baseCurrency는 KRW 또는 USD여야 합니다.');
  }
  return {
    ...(tactical ? { tacticalProduct: tactical as 'QLD' | 'TQQQ' } : {}),
    ...(currency ? { baseCurrency: currency as 'KRW' | 'USD' } : {}),
  };
}
