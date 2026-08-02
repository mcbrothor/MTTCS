import type { Metadata } from 'next';
import NasdaqStrategyDashboard from '@/components/nasdaq/NasdaqStrategyDashboard';

export const metadata: Metadata = {
  title: '나스닥100 전략 | MTN',
  description: 'QQQ 코어와 QLD·TQQQ 전술 비중을 분리하는 규칙 기반 연구 대시보드',
};

export default function NasdaqPage() {
  return <NasdaqStrategyDashboard />;
}
