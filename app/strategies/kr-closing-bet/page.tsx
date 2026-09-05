import { Suspense } from 'react';
import ClosingBetDashboard from '@/components/closing-bet/ClosingBetDashboard';

export default function ClosingBetPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-slate-400" role="status">종가베팅 화면을 불러오고 있습니다.</p>}><ClosingBetDashboard /></Suspense>;
}
