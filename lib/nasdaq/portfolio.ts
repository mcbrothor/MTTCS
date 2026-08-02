import type { SupabaseClient } from '@supabase/supabase-js';
import { NASDAQ_PRODUCT_CODES } from './policy';
import type { NasdaqCurrency, NasdaqProductCode } from './types';

export interface NasdaqPortfolioState {
  equityByMarket: { US: number; KR: number };
  holdings: { product: NasdaqProductCode; units: number }[];
}

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export async function loadNasdaqPortfolioState(input: {
  client: SupabaseClient;
  ownerId: string;
}): Promise<NasdaqPortfolioState> {
  const [{ data: settings, error: settingsError }, { data: trades, error: tradesError }] =
    await Promise.all([
      input.client.from('portfolio_settings').select('market,total_equity').in('market', ['US', 'KR']),
      input.client
        .from('trades')
        .select('ticker,total_shares,position_size')
        .eq('user_id', input.ownerId)
        .eq('status', 'ACTIVE'),
    ]);
  if (settingsError) throw settingsError;
  if (tradesError) throw tradesError;
  const equityByMarket = { US: 0, KR: 0 };
  for (const row of settings ?? []) {
    const market = String(row.market);
    if (market === 'US' || market === 'KR') {
      equityByMarket[market] = positive(row.total_equity);
    }
  }
  const units = new Map<NasdaqProductCode, number>();
  for (const row of trades ?? []) {
    const ticker = String(row.ticker ?? '').toUpperCase();
    if (!NASDAQ_PRODUCT_CODES.includes(ticker as NasdaqProductCode)) continue;
    const product = ticker as NasdaqProductCode;
    const count = positive(row.total_shares) || positive(row.position_size);
    if (count > 0) units.set(product, (units.get(product) ?? 0) + count);
  }
  return {
    equityByMarket,
    holdings: [...units].map(([product, count]) => ({ product, units: count })),
  };
}

export function convertNasdaqPortfolio(input: {
  state: NasdaqPortfolioState;
  baseCurrency: NasdaqCurrency;
  usdKrw: number | null;
  pricesUsd: Partial<Record<NasdaqProductCode, number>>;
}) {
  const warnings: string[] = [];
  const rate = Number(input.usdKrw);
  const hasFx = Number.isFinite(rate) && rate > 0;
  const fromUsd = (value: number) => input.baseCurrency === 'USD'
    ? value
    : hasFx ? value * rate : 0;
  const fromKrw = (value: number) => input.baseCurrency === 'KRW'
    ? value
    : hasFx ? value / rate : 0;
  if (!hasFx && input.state.equityByMarket.KR > 0) {
    warnings.push('USD/KRW 환율이 없어 KR 자산을 통합 계좌에 반영하지 못했습니다.');
  }
  const productValues: Partial<Record<NasdaqProductCode, number>> = {};
  for (const holding of input.state.holdings) {
    const price = Number(input.pricesUsd[holding.product]);
    if (!Number.isFinite(price) || price <= 0) {
      warnings.push(`${holding.product} 보유 평가 가격이 없습니다.`);
      continue;
    }
    productValues[holding.product] = fromUsd(price * holding.units);
  }
  return {
    accountEquity: fromUsd(input.state.equityByMarket.US) + fromKrw(input.state.equityByMarket.KR),
    productValues,
    warnings,
  };
}
