import type { GoldBacktestVerificationView } from './api-contract';

/**
 * `npm run backtest:gold`로 Yahoo GLD 일봉을 재검증한 게시 가능 결과.
 * 제공 기준과의 최대 차이는 CAGR 0.035%p, 변동성 0.025%p,
 * MDD 0.027%p, Sharpe 0.004, 평균 노출 0.008%p였다.
 */
export const GOLD_BACKTEST_VERIFICATION: GoldBacktestVerificationView = {
  status: 'VERIFIED',
  product: 'GLD',
  startDate: '2016-07-25',
  endDate: '2026-07-24',
  observations: 2514,
  transactionCostPct: 0.1,
  verifiedAt: '2026-07-26T00:00:00Z',
  assumptions: [
    '포지션 변경 비용 0.10%',
    '세금·추가 슬리피지·현금 이자 제외',
    '월말 신호는 다음 거래일 종가 이후 적용',
    '미래 성과를 보장하지 않음',
  ],
  strategies: [
    {
      mode: 'BUY_AND_HOLD',
      label: '계속 보유',
      cagrPct: 11.47,
      annualVolatilityPct: 16.12,
      maxDrawdownPct: -26.4,
      sharpe: 0.757,
      averageExposurePct: 100,
    },
    {
      mode: 'SIX_MONTH_TREND',
      label: '6개월 추세',
      cagrPct: 10.67,
      annualVolatilityPct: 14.19,
      maxDrawdownPct: -25.92,
      sharpe: 0.787,
      averageExposurePct: 66.51,
    },
    {
      mode: 'CORE_TACTICAL',
      label: '코어 40% + 전술 60%',
      cagrPct: 11.07,
      annualVolatilityPct: 14.51,
      maxDrawdownPct: -22.37,
      sharpe: 0.798,
      averageExposurePct: 79.9,
    },
  ],
};
