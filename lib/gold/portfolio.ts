import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GOLD_PRODUCT_CODES,
  type GoldBaseCurrency,
  type GoldProductCode,
} from './api-contract';

export interface GoldPortfolioHolding {
  product: GoldProductCode;
  units: number;
}

export interface GoldPortfolioState {
  equityByMarket: {
    US: number;
    KR: number;
  };
  holdings: GoldPortfolioHolding[];
}

export interface ConvertedGoldPortfolio {
  accountValue: number;
  existingGoldValue: number;
  productValues: Partial<Record<GoldProductCode, number>>;
  warnings: string[];
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isGoldProductCode(value: string): value is GoldProductCode {
  return GOLD_PRODUCT_CODES.includes(value as GoldProductCode);
}

export async function loadGoldPortfolioState(args: {
  client: SupabaseClient;
  ownerId: string;
}): Promise<GoldPortfolioState> {
  const [{ data: portfolioRows, error: portfolioError }, { data: tradeRows, error: tradeError }] =
    await Promise.all([
      args.client
        .from('portfolio_settings')
        .select('market,total_equity')
        .in('market', ['US', 'KR']),
      args.client
        .from('trades')
        .select('ticker,total_shares,position_size')
        .eq('user_id', args.ownerId)
        .eq('status', 'ACTIVE'),
    ]);

  if (portfolioError) throw portfolioError;
  if (tradeError) throw tradeError;

  const equityByMarket = { US: 0, KR: 0 };
  for (const row of portfolioRows || []) {
    const market = String(row.market);
    if (market === 'US' || market === 'KR') {
      equityByMarket[market] = positiveNumber(row.total_equity);
    }
  }

  const unitsByProduct = new Map<GoldProductCode, number>();
  for (const row of tradeRows || []) {
    const rawTicker = String(row.ticker || '').toUpperCase().replace(/\.(KS|KQ)$/, '');
    if (!isGoldProductCode(rawTicker)) continue;
    const units = positiveNumber(row.total_shares) || positiveNumber(row.position_size);
    if (units <= 0) continue;
    unitsByProduct.set(rawTicker, (unitsByProduct.get(rawTicker) || 0) + units);
  }

  return {
    equityByMarket,
    holdings: Array.from(unitsByProduct, ([product, units]) => ({ product, units })),
  };
}

export function convertGoldPortfolio(args: {
  state: GoldPortfolioState;
  baseCurrency: GoldBaseCurrency;
  usdKrwRate: number | null;
  prices: Partial<Record<GoldProductCode, number>>;
}): ConvertedGoldPortfolio {
  const { state, baseCurrency, usdKrwRate, prices } = args;
  const warnings: string[] = [];
  const rate = typeof usdKrwRate === 'number' && usdKrwRate > 0 ? usdKrwRate : null;
  const hasFx = rate !== null;

  const convert = (value: number, currency: 'USD' | 'KRW') => {
    if (currency === baseCurrency) return value;
    if (!hasFx) return 0;
    return baseCurrency === 'KRW' ? value * rate! : value / rate!;
  };

  if (!hasFx && state.equityByMarket.US > 0 && state.equityByMarket.KR > 0) {
    warnings.push('USD/KRW 환율이 없어 통합 포트폴리오 자산을 완전히 환산할 수 없습니다.');
  }

  const accountValue =
    convert(state.equityByMarket.US, 'USD') +
    convert(state.equityByMarket.KR, 'KRW');

  let existingGoldValue = 0;
  const productValues: Partial<Record<GoldProductCode, number>> = {};
  for (const holding of state.holdings) {
    const price = positiveNumber(prices[holding.product]);
    if (!price) {
      warnings.push(`${holding.product} 보유분의 최신 가격이 없어 금 노출 평가에서 제외했습니다.`);
      continue;
    }
    const currency = holding.product === 'GLD' ? 'USD' : 'KRW';
    const value = convert(price * holding.units, currency);
    existingGoldValue += value;
    productValues[holding.product] = value;
  }

  return {
    accountValue,
    existingGoldValue,
    productValues,
    warnings,
  };
}
