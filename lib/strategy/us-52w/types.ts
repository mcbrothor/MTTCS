export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number; }
export interface Candidate { ticker: string; name: string; rs: number; isNewHigh: boolean; ma10: number | null; close: number; distanceToHighPct: number; }
export interface Signal { date: string; buyTickers: string[]; sellTickers: string[]; holdTickers: string[]; watchTickers: string[]; cashSlots: number; rsRank: { ticker: string; name: string; rs: number }[] }
