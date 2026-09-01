import MonthlyStrategyPage from '@/components/strategy/MonthlyStrategyPage';

export default function UsMonthlyV7Page() {
  return (
    <MonthlyStrategyPage
      endpoint="/api/strategies/us-monthly-v7"
      title="US 월간 업종전략 V8"
      source="미국시장 월간 업종 투자 추세·비추세 활용 V7 · 해외투자.xlsx"
      fallbackModelVersion="us-monthly-v8-2026.09-v1"
      description="미국 11개 비중복 섹터의 MA120 Breadth와 3·6·12-1개월 복합 모멘텀을 분리해 국면, 목표 위험예산, 편입 업종을 재현 가능한 월말 신호로 제공합니다."
      marketLabel="S&P500"
    />
  );
}
