import { getKisDomesticPrice } from '@/lib/finance/providers/kis-api';
import { getTossPrices, isTossInvestConfigured } from '@/lib/finance/providers/toss-api';
import { getYahooQuotes } from '@/lib/finance/providers/yahoo-api';

interface LiveQuote {
  symbol: string;
  regularMarketPrice: number | null;
}

export async function getMtnUsLiveQuotes(tickers: string[]): Promise<LiveQuote[]> {
  if (!isTossInvestConfigured()) return getYahooQuotes(tickers);

  try {
    const tossQuotes = await getTossPrices(tickers);
    const tossBySymbol = new Map(tossQuotes.map((quote) => [quote.symbol.toUpperCase(), quote.lastPrice]));
    const missing = tickers.filter((ticker) => !tossBySymbol.has(ticker.toUpperCase()));

    const yahooQuotes = missing.length > 0 ? await getYahooQuotes(missing).catch(() => []) : [];
    const yahooBySymbol = new Map(yahooQuotes.map((quote) => [quote.symbol.toUpperCase(), quote.regularMarketPrice]));

    return tickers.map((ticker) => {
      const symbol = ticker.toUpperCase();
      return {
        symbol: ticker,
        regularMarketPrice: tossBySymbol.get(symbol) ?? yahooBySymbol.get(symbol) ?? null,
      };
    });
  } catch {
    return getYahooQuotes(tickers);
  }
}

export async function getMtnKrLivePrice(ticker: string): Promise<number | null> {
  const kisPrice = await getKisDomesticPrice(ticker);
  if (kisPrice !== null) return kisPrice;
  if (!isTossInvestConfigured()) return null;

  try {
    const [quote] = await getTossPrices([ticker]);
    return quote?.lastPrice ?? null;
  } catch {
    return null;
  }
}
