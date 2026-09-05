import MonthlyStrategyPage from '@/components/strategy/MonthlyStrategyPage';

export default function KospiMonthlyPage() {
  return (
    <MonthlyStrategyPage
      endpoint="/api/strategies/kospi-monthly"
      title="KOSPI 월간 업종전략 V3"
      source="업종지수 활용한 추세 및 비추세 전략 V2.3 · 데이터.xlsx"
      fallbackModelVersion="kospi-monthly-v3-2026.09-v1"
      description="비중복 국내 섹터의 MA120 Breadth로 위험예산을 정하고, 3·6·12-1개월 복합 모멘텀과 Top3 진입·Top5 유지 완충으로 목표 업종을 선정합니다."
      marketLabel="KOSPI"
    />
  );
}
