export const US52W_MODEL_VERSION = 'us-52w-2026.08-v1';
export const US52W_MODEL_STATUS = 'RESEARCH_ONLY' as const;
export const US52W_POLICY = {
  rsLookbackDays: 126,
  rsTopN: 20,
  highLookbackDays: 252,
  maxHoldings: 4,
  weightPerHolding: 0.25,
  maPeriod: 10,
  watchDistancePct: [-1, -3, -5],
  transactionCostPct: 0.001,
} as const;
// 미국 업종·테마 ETF 50 Universe — KOSPI와 달리 ETF 기반, 중복 그룹 제한 (예: SOXX/SMH)
export const US52W_UNIVERSE = [
  { ticker: 'XLF', name: 'Financial' }, { ticker: 'XLE', name: 'Energy' }, { ticker: 'XLK', name: 'Technology' },
  { ticker: 'XLV', name: 'Health Care' }, { ticker: 'XLI', name: 'Industrial' }, { ticker: 'XLP', name: 'Consumer Staples' },
  { ticker: 'XLU', name: 'Utilities' }, { ticker: 'XLB', name: 'Materials' }, { ticker: 'XLY', name: 'Consumer Discretionary' },
  { ticker: 'SMH', name: 'Semiconductor' }, { ticker: 'SOXX', name: 'Semiconductor 30' }, { ticker: 'IGV', name: 'Software' },
  { ticker: 'IHI', name: 'Medical Devices' }, { ticker: 'IBB', name: 'Biotech' }, { ticker: 'XBI', name: 'Biotech Small' },
  { ticker: 'PPH', name: 'Pharma' }, { ticker: 'XHE', name: 'Health Equip' }, { ticker: 'KRE', name: 'Regional Banks' },
  { ticker: 'KBE', name: 'Banks' }, { ticker: 'XME', name: 'Metals & Mining' }, { ticker: 'XRT', name: 'Retail' },
  { ticker: 'ITB', name: 'Home Construction' }, { ticker: 'XHB', name: 'Homebuilders' }, { ticker: 'ITA', name: 'Aerospace & Defense' },
  { ticker: 'XOP', name: 'Oil & Gas Exploration' }, { ticker: 'OIH', name: 'Oil Services' }, { ticker: 'FCG', name: 'Natural Gas' },
  { ticker: 'PFF', name: 'Preferred' }, { ticker: 'HYG', name: 'High Yield' }, { ticker: 'LQD', name: 'Investment Grade' },
  { ticker: 'TLT', name: '20Y Treasury' }, { ticker: 'IEF', name: '7-10Y Treasury' }, { ticker: 'SHY', name: '1-3Y Treasury' },
  { ticker: 'GLD', name: 'Gold' }, { ticker: 'SLV', name: 'Silver' }, { ticker: 'GDX', name: 'Gold Miners' },
  { ticker: 'USO', name: 'Oil' }, { ticker: 'UNG', name: 'Natural Gas' }, { ticker: 'DBC', name: 'Commodities' },
  { ticker: 'VNQ', name: 'Real Estate' }, { ticker: 'IWM', name: 'Small Cap' }, { ticker: 'QQQ', name: 'Nasdaq 100' },
  { ticker: 'SPY', name: 'S&P 500' }, { ticker: 'DIA', name: 'Dow' }, { ticker: 'VOT', name: 'Mid Growth' },
  { ticker: 'VUG', name: 'Large Growth' }, { ticker: 'VTV', name: 'Large Value' }, { ticker: 'XLB', name: 'Materials Dup' },
  { ticker: 'XLI', name: 'Industrial Dup' }, { ticker: 'XLK', name: 'Tech Dup' },
] as const;
// 실제 유니크 50으로 축소 (중복 제거)
export const US52W_UNIVERSE_DEDUPED = Array.from(new Map(US52W_UNIVERSE.map(u => [u.ticker, u])).values()).slice(0, 50);
