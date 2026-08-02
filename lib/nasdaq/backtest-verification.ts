export const NASDAQ_BACKTEST_VERIFICATION = {
  status: 'VERIFIED' as const,
  verifiedAt: '2026-07-27T00:00:00.000Z',
  modelVersion: 'nasdaq-core-leverage-2026.07-v1',
  dataPolicy: 'Yahoo actual split/dividend-adjusted ETF series; synthetic leverage excluded',
  transactionCostPct: 0.1,
  assumptions: [
    '포지션 변경 비용 0.10%, 세금·추가 슬리피지 제외',
    '신호는 계산일 다음 거래일 수익부터 적용하여 look-ahead를 차단',
    '규칙 전략은 전체 계좌 기준 QQQ 10%, QLD 5% 또는 TQQQ 3.33% 상한',
    '각 ETF의 252거래일 워밍업 이후 성과만 집계',
  ],
  strategies: [
    { mode: 'QQQ_BUY_HOLD', label: 'QQQ 계속 보유', startDate: '2007-09-07', endDate: '2026-07-24', cagrPct: 16.05, annualVolatilityPct: 22.43, maxDrawdownPct: -53.40, sharpe: 0.78, sortino: 0.73, calmar: 0.30, averageEffectiveExposurePct: 99.98 },
    { mode: 'QLD_BUY_HOLD', label: 'QLD 계속 보유', startDate: '2007-09-07', endDate: '2026-07-24', cagrPct: 24.25, annualVolatilityPct: 44.65, maxDrawdownPct: -83.13, sharpe: 0.71, sortino: 0.67, calmar: 0.29, averageEffectiveExposurePct: 199.96 },
    { mode: 'TQQQ_BUY_HOLD', label: 'TQQQ 계속 보유', startDate: '2011-02-09', endDate: '2026-07-24', cagrPct: 38.18, annualVolatilityPct: 61.60, maxDrawdownPct: -81.66, sharpe: 0.84, sortino: 0.79, calmar: 0.47, averageEffectiveExposurePct: 299.92 },
    { mode: 'QQQ_TEN_MONTH', label: 'QQQ 10개월 추세', startDate: '2007-09-07', endDate: '2026-07-24', cagrPct: 10.74, annualVolatilityPct: 14.97, maxDrawdownPct: -24.28, sharpe: 0.76, sortino: 0.60, calmar: 0.44, averageEffectiveExposurePct: 74.56 },
    { mode: 'QQQ_QLD_RULES', label: '계좌 QQQ+QLD 규칙', startDate: '2007-09-07', endDate: '2026-07-24', cagrPct: 2.00, annualVolatilityPct: 2.67, maxDrawdownPct: -5.17, sharpe: 0.76, sortino: 0.60, calmar: 0.39, averageEffectiveExposurePct: 13.93 },
    { mode: 'QQQ_TQQQ_RULES', label: '계좌 QQQ+TQQQ 규칙', startDate: '2011-02-09', endDate: '2026-07-24', cagrPct: 1.40, annualVolatilityPct: 1.64, maxDrawdownPct: -2.70, sharpe: 0.86, sortino: 0.70, calmar: 0.52, averageEffectiveExposurePct: 8.92 },
  ],
} as const;
