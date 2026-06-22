export type KoreaRankingItem = {
  ticker: string;
  name: string;
  marketCap: number | null;
  currentPrice: number | null;
  source: string;
};

const KOREA_FUND_NAME = /(?:ETF|ETN|KODEX|TIGER|KOSEF|ACE|RISE|KBSTAR|HANARO|SOL|TIMEFOLIO|ARIRANG|PLUS|히어로즈|마이티|TREX|FOCUS)/i;
const KOREA_SPAC_NAME = /(?:스팩|SPAC)/i;
const KOREA_PREFERRED_NAME = /(?:\d*우(?:B|C)?|우선주)$/i;

export function isEligibleKoreaCommonStock(item: Pick<KoreaRankingItem, 'ticker' | 'name'>) {
  const name = item.name.trim();
  return /^\d{6}$/.test(item.ticker)
    && name.length > 0
    && !KOREA_FUND_NAME.test(name)
    && !KOREA_SPAC_NAME.test(name)
    && !KOREA_PREFERRED_NAME.test(name);
}

export function rankKoreaMarketCapItems(items: KoreaRankingItem[], limit = 100) {
  return Array.from(new Map(items.filter((item) => /^\d{6}$/.test(item.ticker)).map((item) => [item.ticker, item])).values())
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function rankEligibleKoreaCommonStocks(items: KoreaRankingItem[], limit = 100) {
  return rankKoreaMarketCapItems(items.filter(isEligibleKoreaCommonStock), limit);
}
