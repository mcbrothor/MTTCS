import Card from '@/components/ui/Card';
import { Activity, BarChart2, Crosshair, Shield, TrendingDown, TrendingUp, Volume2 } from 'lucide-react';

const sepaRules = [
  { rule: '현재가 > 50일/150일/200일 이동평균', desc: '주가가 단기·중기·장기 이동평균 위에 있어야 상승 추세가 살아 있는 종목입니다.' },
  { rule: '50일선 > 150일선 > 200일선', desc: '이동평균 정렬이 강세 순서로 정렬되어야 합니다 (Golden Cross 상태).' },
  { rule: '200일선 최소 1개월 상승', desc: '장기 이동평균이 최소 1개월 연속 우상향 중이어야 합니다.' },
  { rule: '52주 고점 대비 25% 이내', desc: '강한 종목은 고점 근처에서 쉬고 있습니다. 25% 이상 하락한 종목은 후보에서 제외됩니다.' },
  { rule: 'RS 프록시 ≥ 70점', desc: 'SPY 대비 6개월 초과수익률로 계산한 상대강도 대체 지표입니다.' },
  { rule: '20일 평균 거래대금 ≥ $10M', desc: '유동성이 낮은 종목은 슬리피지와 체결 리스크가 높아 제외합니다.' },
  { rule: 'EPS/매출/ROE/부채 (참고)', desc: '기본적 분석은 info(참고)로 표시되며, 저장을 차단하지 않습니다. 투자 판단의 보조 자료입니다.' },
];

const vcpLayers = [
  {
    icon: TrendingDown,
    title: '수축 패턴 감지',
    weight: '35%',
    color: 'text-emerald-400',
    details: [
      '상승 후 고점→저점 사이클(수축)을 2~6개 감지합니다.',
      '각 수축의 깊이(%)가 이전보다 얕아야 점진적 VCP입니다.',
      '최종 수축이 10% 미만이면 "타이트"한 이상적 패턴입니다.',
    ],
  },
  {
    icon: Volume2,
    title: '거래량 건조화',
    weight: '25%',
    color: 'text-amber-400',
    details: [
      '수축 구간별 평균 거래량이 좌→우로 줄어들어야 합니다.',
      '최종 구간 볼륨이 50일 평균의 50% 이하면 매우 건조한 상태입니다.',
      '거래량 건조화는 매도세가 소진되었음을 의미합니다.',
    ],
  },
  {
    icon: BarChart2,
    title: 'BB Squeeze',
    weight: '20%',
    color: 'text-blue-400',
    details: [
      '볼린저 밴드 너비(BB Width)가 120일 중 하위 20%이면 Squeeze 상태입니다.',
      'Squeeze는 변동성이 극도로 수축한 상태로, 곧 방향성 있는 큰 움직임이 예상됩니다.',
      '40% 이하면 수축 진행 중으로 판정합니다.',
    ],
  },
  {
    icon: Activity,
    title: 'Pocket Pivot',
    weight: '20%',
    color: 'text-purple-400',
    details: [
      '상승일 거래량이 최근 10일 하락일 최대 거래량을 넘기면 감지됩니다.',
      '10일 이동평균선 ±3% 이내에서 발생해야 유효합니다.',
      '최근 20일 내 2건 이상이면 강한 기관 매집 시그널입니다.',
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Algorithm Guide</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">알고리즘 가이드</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          MTTCS v4.0이 백엔드에서 어떤 기준으로 종목을 판정하고, VCP 매수 타점을 분석하며, 수량을 계산하는지 확인합니다.
        </p>
      </div>

      {/* 전략 흐름 */}
      <Card>
        <h2 className="text-xl font-bold text-white">📊 전략 실행 흐름</h2>
        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:gap-0">
          {[
            { step: '1', label: 'SEPA 필터', desc: '상승 추세 종목 선별', color: 'border-emerald-500 text-emerald-400' },
            { step: '2', label: 'VCP 분석', desc: '매수 타점 정밀 판정', color: 'border-blue-500 text-blue-400' },
            { step: '3', label: 'ATR 리스크', desc: '포지션 사이즈 산출', color: 'border-amber-500 text-amber-400' },
            { step: '4', label: '피라미딩', desc: '3분할 진입 계획', color: 'border-purple-500 text-purple-400' },
            { step: '5', label: '체크리스트', desc: 'Centaur 최종 확인', color: 'border-rose-500 text-rose-400' },
          ].map((item, i) => (
            <div key={item.step} className="flex items-center gap-3 md:flex-col md:gap-1 md:flex-1">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-sm font-bold ${item.color}`}>
                {item.step}
              </div>
              <div className="md:text-center">
                <p className={`text-sm font-semibold ${item.color}`}>{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              {i < 4 && <div className="hidden md:block md:flex-1 md:border-t md:border-dashed md:border-slate-700" />}
            </div>
          ))}
        </div>
      </Card>

      {/* SEPA */}
      <Card>
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">SEPA 스크리닝</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          SEPA(Specific Entry Point Analysis)는 Minervini의 Trend Template입니다. 가격과 거래량 기반 핵심 조건에서 실패가 있으면 신규 계획 저장을 차단합니다.
          기본적 분석(EPS/매출 등)은 참고 정보로만 표시됩니다.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {sepaRules.map((item, index) => (
            <div key={item.rule} className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold text-white">{item.rule}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* VCP */}
      <Card>
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-blue-400" />
          <h2 className="text-xl font-bold text-white">VCP 매수 타점 분석</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          VCP(Volatility Contraction Pattern)는 Mark Minervini가 체계화한 모델입니다. 상승 추세 중 변동성이 점차 줄어들면서
          피벗 포인트를 형성하고, 돌파 시 새로운 상승파가 시작됩니다. 4가지 레이어를 가중 합산하여 0~100점으로 산출합니다.
        </p>
        <div className="mt-5 space-y-4">
          {vcpLayers.map((layer) => {
            const Icon = layer.icon;
            return (
              <div key={layer.title} className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${layer.color}`} />
                  <h3 className={`text-sm font-bold ${layer.color}`}>{layer.title}</h3>
                  <span className="ml-auto rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-mono text-slate-400">
                    가중치 {layer.weight}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {layer.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-2 text-xs leading-5 text-slate-400">
                      <span className={`mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current ${layer.color}`} />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-lg border border-sky-500/30 bg-sky-500/10 p-4">
          <p className="text-sm leading-6 text-sky-200">
            <strong>VCP 스코어 등급:</strong>{' '}
            <span className="font-mono text-emerald-400">70~100 Strong</span> →{' '}
            <span className="font-mono text-amber-400">50~69 Forming</span> →{' '}
            <span className="font-mono text-orange-400">25~49 Weak</span> →{' '}
            <span className="font-mono text-slate-400">0~24 None</span>
          </p>
          <p className="mt-2 text-xs text-sky-300/70">
            VCP 스코어는 보조 지표이며, 저장을 차단하지 않습니다. 최종 매매 판단은 사용자가 내립니다.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/50 p-4">
          <h4 className="text-sm font-semibold text-white">진입가 결정 방식</h4>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            시스템은 <strong className="text-white">VCP 피벗(최종 수축 고점)</strong>과
            <strong className="text-white"> 20일 돌파가</strong> 두 가격을 모두 산출합니다.
            둘 중 <strong className="text-emerald-400">보수적인(낮은)</strong> 가격을 권장 진입가로 자동 채택하며,
            피라미딩 계획도 이 가격을 기준으로 생성됩니다.
          </p>
        </div>
      </Card>

      {/* ATR + 허용 손실 */}
      <Card>
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-amber-400" />
          <h2 className="text-xl font-bold text-white">ATR과 허용 손실</h2>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
          <p>ATR 20일 = 최근 20개 거래일의 True Range 평균입니다.</p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="font-medium text-amber-200">
              💡 터틀 트레이딩 원본은 총 자본의 <strong>1%</strong> 룰을 사용합니다.
              MTTCS에서는 사용자가 <strong>0.1%~10%</strong> 범위에서 자유롭게 설정할 수 있으며,
              기본값은 <strong>3%</strong>입니다.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs font-semibold text-slate-300">최대 허용 손실</p>
              <p className="mt-1 font-mono text-sm text-white">총 자본 × 허용 손실 %</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs font-semibold text-slate-300">초기 손절가</p>
              <p className="mt-1 font-mono text-sm text-white">진입가 − 2 × ATR</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs font-semibold text-slate-300">총 수량</p>
              <p className="mt-1 font-mono text-sm text-white">허용 손실 / 주당 위험금액</p>
            </div>
          </div>
        </div>
      </Card>

      {/* 3분할 피라미딩 */}
      <Card>
        <h2 className="text-xl font-bold text-white">3분할 피라미딩</h2>
        <p className="mt-2 text-sm text-slate-400">
          한 번에 전량 진입하지 않고, 추세 확인 후 3단계로 나누어 진입합니다. 손실은 제한하고 수익은 극대화하는 터틀 원칙입니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm text-slate-300">
            <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3">단계</th>
                <th className="py-3">가격 기준</th>
                <th className="py-3">수량</th>
                <th className="py-3">목적</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">1차 진입</td>
                <td className="py-3 font-mono">권장 진입가 (VCP 피벗 또는 20일 돌파가 중 낮은 쪽)</td>
                <td className="py-3 font-mono text-emerald-400">총 수량의 1/3</td>
                <td className="py-3 text-slate-400">추세 돌파 확인 후 최초 진입</td>
              </tr>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">2차 추가</td>
                <td className="py-3 font-mono">진입가 + 0.5 ATR</td>
                <td className="py-3 font-mono text-emerald-400">총 수량의 1/3</td>
                <td className="py-3 text-slate-400">수익 방향으로 움직일 때만 추가</td>
              </tr>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">3차 마감</td>
                <td className="py-3 font-mono">진입가 + 1.0 ATR</td>
                <td className="py-3 font-mono text-emerald-400">총 수량의 1/3</td>
                <td className="py-3 text-slate-400">추세 지속 확인 후 마지막 추가</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
