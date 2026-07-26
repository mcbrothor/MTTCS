export interface SectorRow {
  symbol: string;
  name: string;
  tickerName: string;
  return1: number;
  return5: number;
  return20: number;
  price: number;
  ma5: number;
  ma20: number;
  aboveMa5: boolean;
  aboveMa20: boolean;
  riskOn: boolean;
  rank: number;
}

interface DailyClose {
  close: number;
}

export function normalizeSectorReturn(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percentReturn(data: readonly DailyClose[], lookback: number) {
  const start = data[data.length - lookback - 1]?.close;
  const end = data.at(-1)?.close;
  if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end) || start === 0) return 0;
  return ((end - start) / start) * 100;
}

function movingAverage(data: readonly DailyClose[], period: number) {
  return data.slice(-period).reduce((sum, row) => sum + row.close, 0) / period;
}

export function buildSectorRows(
  sectorSeries: ReadonlyArray<readonly [string, readonly DailyClose[]]>,
  sectorNames: Readonly<Record<string, string>>,
  riskOnSectors: ReadonlySet<string>,
  tickerNames: Readonly<Record<string, string>> = {},
): SectorRow[] {
  return sectorSeries
    .filter(([, data]) => (
      data.length >= 21
      && data.slice(-21).every((row) => Number.isFinite(row.close) && row.close > 0)
    ))
    .map(([symbol, data]) => {
      const price = data.at(-1)!.close;
      const ma5 = movingAverage(data, 5);
      const ma20 = movingAverage(data, 20);
      return {
        symbol,
        name: sectorNames[symbol] || symbol,
        tickerName: tickerNames[symbol] || sectorNames[symbol] || symbol,
        return1: percentReturn(data, 1),
        return5: percentReturn(data, 5),
        return20: percentReturn(data, 20),
        price,
        ma5,
        ma20,
        aboveMa5: price > ma5,
        aboveMa20: price > ma20,
        riskOn: riskOnSectors.has(symbol),
        rank: 0,
      };
    })
    .sort((a, b) => b.return1 - a.return1 || b.return20 - a.return20)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
