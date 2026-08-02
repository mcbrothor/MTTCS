import type { Metadata } from 'next';
import GoldStrategyDashboard from '@/components/gold/GoldStrategyDashboard';

export const metadata: Metadata = {
  title: '금 투자 전략 | MTN',
  description: '코어와 전술 비중을 분리하는 규칙 기반 금 투자 연구 대시보드',
};

export default function GoldPage() {
  return <GoldStrategyDashboard />;
}
