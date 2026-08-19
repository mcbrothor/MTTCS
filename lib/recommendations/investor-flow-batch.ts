export function selectInvestorFlowBatch(input: {
  tickers: string[];
  batchSize?: number;
  cursor?: number;
}) {
  const allTickers = [...new Set(input.tickers.filter((ticker) => /^\d{6}$/.test(ticker)))];
  const cursor = Math.max(0, Math.floor(input.cursor ?? 0));
  const batchSize = Math.min(100, Math.max(1, Math.floor(input.batchSize ?? 40)));
  const tickers = allTickers.slice(cursor, cursor + batchSize);
  return {
    allTickers,
    tickers,
    cursor,
    nextCursor: cursor + tickers.length < allTickers.length ? cursor + tickers.length : null,
  };
}
