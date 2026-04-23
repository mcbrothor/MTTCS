import type { Trade } from '../../../types/index.ts';

interface UsQuote {
  symbol: string;
  regularMarketPrice: number | null;
}

interface LivePriceProviders {
  getUsQuotes: (tickers: string[]) => Promise<UsQuote[]>;
  getKrPrice: (ticker: string) => Promise<number | null>;
}

function isKoreanTicker(ticker: string) {
  return /^\d{6}$/.test(ticker);
}

export async function buildLivePriceMap(
  trades: Pick<Trade, 'ticker' | 'status'>[],
  providers: LivePriceProviders
) {
  const activeTrades = trades.filter((trade) => trade.status === 'ACTIVE');
  const priceMap = new Map<string, number | null>();

  const usTickers = [...new Set(activeTrades.filter((trade) => !isKoreanTicker(trade.ticker)).map((trade) => trade.ticker))];
  const krTickers = [...new Set(activeTrades.filter((trade) => isKoreanTicker(trade.ticker)).map((trade) => trade.ticker))];

  const usQuotesPromise = usTickers.length > 0 ? providers.getUsQuotes(usTickers) : Promise.resolve([]);
  const krQuotesPromise = Promise.all(krTickers.map(async (ticker) => ({
    symbol: ticker,
    price: await providers.getKrPrice(ticker),
  })));

  const [usQuotes, krQuotes] = await Promise.all([usQuotesPromise, krQuotesPromise]);

  usQuotes.forEach((quote) => priceMap.set(quote.symbol, quote.regularMarketPrice));
  krQuotes.forEach((quote) => priceMap.set(quote.symbol, quote.price));

  return priceMap;
}
