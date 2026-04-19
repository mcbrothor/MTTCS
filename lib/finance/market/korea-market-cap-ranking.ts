export type KoreaRankingItem = {
  ticker: string;
  name: string;
  marketCap: number | null;
  currentPrice: number | null;
  source: string;
};

export function rankKoreaMarketCapItems(items: KoreaRankingItem[], limit = 100) {
  return Array.from(new Map(items.filter((item) => /^\d{6}$/.test(item.ticker)).map((item) => [item.ticker, item])).values())
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
