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
  buyTickers: string[]; // 신규 매수 (당일 종가 진입, 다음날 수익반영)
  sellTickers: string[]; // MA10 이탈
  holdTickers: string[];
  cashSlots: number;
  rsRank: { ticker: string; rs: number; rank: number }[];
}

export interface Kospi52wBacktestBar extends Kospi52wBar { ticker: string; }
export interface Kospi52wBacktestResult {
  asOf: string;
  buyTickers: string[];
  sellTickers: string[];
  holdings: { ticker: string; weight: number; entryPrice: number }[];
  cashWeight: number;
}
