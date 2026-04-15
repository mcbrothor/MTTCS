import Card from '@/components/ui/Card';
import { Activity, BarChart2, CheckCircle2, Crosshair, ScanSearch, Shield, TrendingDown, TrendingUp, Volume2 } from 'lucide-react';

const sepaRules = [
  { rule: '현재가 > 50일/150일/200일 이동평균', desc: '주가가 주요 이동평균 위에서 움직이는 강한 상승 추세 종목만 후보로 둡니다.' },
  { rule: '50일선 > 150일선 > 200일선', desc: '단기 추세가 중장기 추세보다 강한 정배열 상태를 확인합니다.' },
  { rule: '200일선 최소 1개월 상승', desc: '장기 하락 추세에서 반등하는 종목이 아니라, 이미 방향이 위로 바뀐 종목을 우선합니다.' },
  { rule: '52주 고점 대비 25% 이내', desc: '강한 주도주는 대개 고점 근처에서 쉬며 다음 상승을 준비합니다.' },
  { rule: 'RS 프록시 >= 70점', desc: 'SPY 대비 6개월 초과수익률로 계산한 상대강도 대체 지표입니다.' },
  { rule: '20일 평균 거래대금 >= $10M', desc: '체결과 슬리피지 리스크가 큰 저유동성 종목을 걸러냅니다.' },
  { rule: 'EPS/매출/ROE/부채', desc: '기본적 분석은 참고 정보로 표시합니다. 강한 실적과 가격 행동이 함께 있는 후보를 더 우선합니다.' },
];

const vcpLayers = [
  {
    icon: TrendingDown,
    title: '수축 패턴',
    weight: '35%',
    color: 'text-emerald-400',
    details: [
      '상승 후 고점과 저점이 여러 번 만들어지는 베이스를 찾습니다.',
      '각 수축의 깊이가 이전보다 얕아질수록 매도 압력이 줄어든 것으로 봅니다.',
      '마지막 수축이 10% 안팎으로 타이트하면 피벗 품질을 높게 평가합니다.',
    ],
  },
  {
    icon: Volume2,
    title: '거래량 건조화',
    weight: '25%',
    color: 'text-amber-400',
    details: [
      '수축이 진행될수록 평균 거래량이 줄어드는지 확인합니다.',
      '최종 수축 구간 거래량이 50일 평균보다 크게 낮으면 공급 소진 가능성을 높게 봅니다.',
      '돌파 당일에는 피벗 위 가격과 거래량 증가가 함께 나타나는지 확인합니다.',
    ],
  },
  {
    icon: BarChart2,
    title: '변동성 수축',
    weight: '20%',
    color: 'text-sky-400',
    details: [
      '볼린저 밴드 너비가 최근 범위의 하위권으로 좁아졌는지 봅니다.',
      '가격 변동폭이 줄수록 다음 방향성 움직임의 에너지가 축적된 것으로 해석합니다.',
      '이 지표는 보조 확인용이며, 피벗과 거래량 판단을 대체하지 않습니다.',
    ],
  },
  {
    icon: Activity,
    title: 'Pocket Pivot',
    weight: '20%',
    color: 'text-fuchsia-400',
    details: [
      '상승일 거래량이 최근 하락일 거래량을 압도하는지 감지합니다.',
      '10일 이동평균 근처에서 나타나면 기관 매집 단서로 해석합니다.',
      '피벗 전후에 여러 번 나타나면 수요 우위 근거가 강해집니다.',
    ],
  },
];

const flow = [
  { step: '1', label: '스캐너', desc: '종목군 후보 압축', color: 'border-emerald-500 text-emerald-400' },
  { step: '2', label: 'SEPA 필터', desc: '강한 상승 추세 선별', color: 'border-sky-500 text-sky-400' },
  { step: '3', label: 'VCP 피벗', desc: '최종 수축 고점 확인', color: 'border-cyan-500 text-cyan-400' },
  { step: '4', label: '무효화선', desc: '최종 수축 저점 확인', color: 'border-orange-500 text-orange-400' },
  { step: '5', label: '수량 계산', desc: '1% 리스크와 8% 캡 적용', color: 'border-amber-500 text-amber-400' },
  { step: '6', label: '체결/복기', desc: '계획 준수와 R 추적', color: 'border-rose-500 text-rose-400' },
];

const scannerRows = [
  { item: 'NASDAQ 100', source: 'Nasdaq 공식 목록 API', use: '미국 대형 성장주 후보를 시가총액순으로 보고 SEPA/VCP를 빠르게 점검합니다.' },
  { item: 'S&P 500', source: 'StockAnalysis S&P 500 표', use: '미국 대형주 전체를 시가총액순으로 넓게 훑고 후보를 압축합니다.' },
  { item: 'KOSPI 100', source: 'KRX 구성종목 우선, KIS/Naver 시가총액 fallback', use: '공식 구성종목 확인을 우선하되, 가격과 일봉 분석은 KIS 데이터를 사용합니다.' },
  { item: 'KOSDAQ 100', source: 'Naver Finance KOSDAQ 시가총액 fallback', use: '국내 성장주 후보군을 같은 SEPA/VCP 기준으로 빠르게 점검합니다.' },
  { item: '현재가 기준', source: '종목군 원천 또는 최근 일봉', use: '테이블의 현재가에는 기준 시각을 함께 표시해 지연 데이터인지 확인합니다.' },
  { item: '스캔 기록', source: '브라우저 저장', use: '새 스캔 버튼을 누르기 전까지 마지막 스캔 날짜와 결과를 유지합니다.' },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Algorithm Guide</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Minervini 전략 가이드</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Mantori&apos;s Trading Navigator(MTN)은 종목군 스캐너로 후보를 압축한 뒤 Mark Minervini의 SEPA와 VCP 관점을 기준으로 피벗 진입가, 패턴 무효화선, 수량, 체결 복기를 연결합니다.
        </p>
      </div>

      <Card>
        <h2 className="text-xl font-bold text-white">전략 실행 흐름</h2>
        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:gap-0">
          {flow.map((item, index) => (
            <div key={item.step} className="flex items-center gap-3 md:flex-1 md:flex-col md:gap-1">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-sm font-bold ${item.color}`}>
                {item.step}
              </div>
              <div className="md:text-center">
                <p className={`text-sm font-semibold ${item.color}`}>{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              {index < flow.length - 1 && <div className="hidden md:block md:flex-1 md:border-t md:border-dashed md:border-slate-700" />}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <ScanSearch className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">종목군 스캐너</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          대시보드 다음 단계에서 NASDAQ 100, S&P 500, KOSPI 100, KOSDAQ 100을 별도 서브 메뉴로 확인합니다. 전체 종목을 먼저 훑고, 조건이 좋은 종목만 신규 계획으로 넘깁니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm text-slate-300">
            <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3">항목</th>
                <th className="py-3">데이터 기준</th>
                <th className="py-3">사용 방식</th>
              </tr>
            </thead>
            <tbody>
              {scannerRows.map((row) => (
                <tr key={row.item} className="border-b border-slate-800">
                  <td className="py-3 font-medium text-white">{row.item}</td>
                  <td className="py-3 text-slate-300">{row.source}</td>
                  <td className="py-3 text-slate-400">{row.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">SEPA 스크리닝</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          먼저 강한 추세와 상대강도를 확인합니다. 약한 종목에서 싼 가격을 찾기보다, 이미 시장을 이기는 종목이 건설적인 베이스를 만드는지 봅니다.
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

      <Card>
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-sky-400" />
          <h2 className="text-xl font-bold text-white">VCP 피벗 진입</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          기본 진입가는 임의의 기간 돌파가가 아니라 최종 수축 고점인 VCP 피벗입니다. 피벗을 넘어서며 거래량이 붙을 때 수요 우위를 확인합니다.
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
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-amber-400" />
          <h2 className="text-xl font-bold text-white">리스크 계산</h2>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
          <p>기본 허용 손실은 총 자본의 1%입니다. 사용자가 입력한 손실 한도 안에서 수량을 계산합니다.</p>
          <p>초기 손절가는 최종 수축 저점과 진입가 대비 8% 손실 캡 중 더 가까운 가격을 사용합니다.</p>
          <p>ATR은 변동성 참고값으로만 표시하며, 기본 손절가나 추가진입가를 고정 ATR 간격으로 만들지 않습니다.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs font-semibold text-slate-300">최대 허용 손실</p>
              <p className="mt-1 font-mono text-sm text-white">총 자본 x 허용 손실 %</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs font-semibold text-slate-300">초기 손절가</p>
              <p className="mt-1 font-mono text-sm text-white">max(무효화선, 진입가 x 0.92)</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs font-semibold text-slate-300">총 수량</p>
              <p className="mt-1 font-mono text-sm text-white">허용 손실 / 주당 위험</p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-rose-400" />
          <h2 className="text-xl font-bold text-white">체결과 복기</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          계획 저장 후 실제 진입과 청산을 체결 이벤트로 기록합니다. 평균 진입가, 실현손익, R-Multiple, 계획 실행률은 자동 계산됩니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm text-slate-300">
            <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3">항목</th>
                <th className="py-3">입력 방식</th>
                <th className="py-3">확인할 점</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">진입 체결</td>
                <td className="py-3">가격, 수량, 날짜</td>
                <td className="py-3 text-slate-400">피벗 돌파와 거래량 확인 후 기록합니다.</td>
              </tr>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">청산 체결</td>
                <td className="py-3">부분청산 또는 전량청산</td>
                <td className="py-3 text-slate-400">순보유 수량과 실현손익이 자동 갱신됩니다.</td>
              </tr>
              <tr className="border-b border-slate-800">
                <td className="py-3 font-medium text-white">복기</td>
                <td className="py-3">실수 태그, 규율 점수, 개선 액션</td>
                <td className="py-3 text-slate-400">다음 매매에서 고칠 행동 1가지를 남깁니다.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
