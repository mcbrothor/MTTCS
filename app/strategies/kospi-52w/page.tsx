import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'KOSPI 52주 신고가 전략 | MTN', description: 'RS Top12 ∩ 52주 신고가 → 4×25% MA10' };

export default function Kospi52wPage() {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold">KOSPI 52주 신고가 전략 (업종 ETF)</h1>
      <p className="text-sm text-slate-400">RS Top12 ∩ 52주 신고가 → 최대 4종목 × 25% → MA10 이탈 매도 · drift · 빈 슬롯 현금 (독립 전략탭 A안)</p>
      <div className="rounded-xl border border-slate-800 p-4 text-sm">
        <p>엔진: <code>lib/strategy/kospi-52w/engine.ts</code> — 백테스트 검증 후 라이브 예정</p>
        <p className="mt-2 text-xs text-slate-500">유니버스 12 ETF (069500 등) · 비용 편도 0.10% · 슬리피지 제외 · 신호일≠수익일 분리</p>
      </div>
    </div>
  );
}
