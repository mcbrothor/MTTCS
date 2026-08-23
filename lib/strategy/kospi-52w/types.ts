export interface Kospi52wBar { date: string; open: number; high: number; low: number; close: number; volume: number; }

export interface Kospi52wCandidate {
  ticker: string;
  name: string;
  rs: number; // 6M KOSPI 대비 초과수익
  isNewHigh: boolean;
  high252: number;
  ma10: number | null;
  close: number;
}

export interface Kospi52wSignal {
  date: string;
  buyTickers: string[];
  sellTickers: string[];
  holdTickers: string[];
  cashSlots: number;
  rsRank: { ticker: string; name: string; rs: number; rank: number }[];
}

export interface Kospi52wBacktestBar extends Kospi52wBar { ticker: string; }
export interface Kospi52wBacktestResult {
  asOf: string;
  buyTickers: string[];
  sellTickers: string[];
  holdings: { ticker: string; weight: number; entryPrice: number }[];
  cashWeight: number;
}
