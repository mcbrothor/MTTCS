/**
 * KOSPI 52주 신고가 전략 — 업종 ETF v1
 * 출처: 코스피 52주_신고가_전략_핵심과_깨달음.xlsx
 * 원칙: RS Top12 ∩ 52주 신고가 → 최대 4종목 × 25% → MA10 이탈 매도 (drift)
 */

export const KOSPI52W_MODEL_VERSION = 'kospi-52w-2026.08-v1';
export const KOSPI52W_MODEL_STATUS = 'RESEARCH_ONLY' as const;

// 업종 ETF 유니버스 — WICS 12섹터 기반, 사용자 제공 전 임시값 (069500 KODEX200 등)
// TODO: 사용자 확정 리스트로 교체 — 현재 MTN 50 ETF 중 KOSPI 섹터 12선
export const KOSPI52W_UNIVERSE = [
  { ticker: '069500', name: 'KODEX 200', sector: 'KOSPI' },
  { ticker: '229200', name: 'KODEX 코스닥150', sector: 'KOSDAQ' },
  { ticker: '091160', name: 'KODEX 반도체', sector: '반도체' },
  { ticker: '102110', name: 'TIGER 반도체', sector: '반도체' },
  { ticker: '266370', name: 'KODEX 보험', sector: '보험' },
  { ticker: '140700', name: 'KODEX 자동차', sector: '자동차' },
  { ticker: '139260', name: 'TIGER 200', sector: 'KOSPI' },
  { ticker: '148020', name: 'KODEX 코스닥150 레버리지', sector: '레버리지' },
  { ticker: '365040', name: 'TIGER 2차전지테마', sector: '2차전지' },
  { ticker: '261070', name: 'TIGER 코스닥150', sector: 'KOSDAQ' },
  { ticker: '102970', name: 'KODEX 코스닥150', sector: 'KOSDAQ' },
  { ticker: '451770', name: 'TIGER AI코리아', sector: 'AI' },
] as const;

export const KOSPI52W_POLICY = {
  rsLookbackDays: 126, // 6개월
  rsTopN: 12,
  highLookbackDays: 252,
  maxHoldings: 4,
  weightPerHolding: 0.25,
  maPeriod: 10,
  rebalance: 'drift' as const, // 매일 25% 재조정 금지
  koreanFearGreedEnabled: false, // V2.3에서 사용, 본 전략은 사용 안 함
  transactionCostPct: 0.001, // 편도 0.10% (슬리피지 제외, 지시대로 비용만)
} as const;
