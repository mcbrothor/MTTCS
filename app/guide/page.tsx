import Card from '@/components/ui/Card';

const sepaRules = [
  '현재가가 50일, 150일, 200일 이동평균 위에 있어야 합니다.',
  '50일 이동평균은 150일 이동평균보다 높아야 합니다.',
  '150일 이동평균은 200일 이동평균보다 높아야 합니다.',
  '200일 이동평균은 최소 1개월 전보다 상승 중이어야 합니다.',
  '현재가는 52주 고점 대비 25% 이내에 있어야 합니다.',
  '상대강도 RS Rating은 70 이상을 목표로 합니다.',
  '20일 평균 거래대금은 최소 1천만 달러 이상이어야 합니다.',
  'EPS, 매출, ROE, 부채비율 같은 기본적 지표는 데이터가 확보되면 추가 검증합니다.',
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Algorithm Guide</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">알고리즘 가이드</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          MTTCS v3.0이 백엔드에서 어떤 기준으로 종목을 판정하고 수량을 계산하는지 설명합니다.
        </p>
      </div>

      <Card>
        <h2 className="text-xl font-bold text-white">SEPA 스크리닝</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          SEPA는 상승 추세가 정렬된 강한 종목만 후보로 남기는 필터입니다. 실패 조건이 하나라도 있으면 신규 계획 저장을 차단합니다.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {sepaRules.map((rule, index) => (
            <div key={rule} className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold text-emerald-400">Rule {index + 1}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{rule}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold text-white">ATR과 1% 리스크</h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
          <p>ATR 20일 = 최근 20개 거래일의 True Range 평균입니다.</p>
          <p>최대 허용 손실 = 총 자본 x 1%입니다.</p>
          <p>초기 손절가 = 20일 돌파 진입가 - 2 x ATR입니다.</p>
          <p>총 수량 = 최대 허용 손실 / 주당 위험금액입니다.</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold text-white">3분할 피라미딩</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm text-slate-300">
            <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3">단계</th>
                <th className="py-3">가격 기준</th>
                <th className="py-3">목적</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">1차</td>
                <td className="py-3 font-mono">20일 고점 돌파가</td>
                <td className="py-3 text-slate-400">추세 돌파 확인 후 최초 진입</td>
              </tr>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">2차</td>
                <td className="py-3 font-mono">진입가 + 0.5 ATR</td>
                <td className="py-3 text-slate-400">수익 방향으로 움직일 때만 추가</td>
              </tr>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">3차</td>
                <td className="py-3 font-mono">진입가 + 1.0 ATR</td>
                <td className="py-3 text-slate-400">추세 지속 확인 후 마지막 추가</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
