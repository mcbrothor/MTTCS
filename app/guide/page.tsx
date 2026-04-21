import Card from '@/components/ui/Card';
import { Activity, BarChart2, Bot, CheckCircle2, Crosshair, ScanSearch, Trophy, Volume2 } from 'lucide-react';

const masterFilterRows = [
  ['P3 점수', 'FTD, Distribution Pressure, NH/NL Proxy, Above 200D, Sector Rotation을 100점 기준으로 합산한 시장 환경 점수입니다.'],
  ['시장 상태', '75점 이상 GREEN, 50점 이상 YELLOW, 그 미만은 RED입니다. RED라도 후보 비교는 가능하지만 포지션 크기와 손절 기준은 보수적으로 봅니다.'],
  ['Trend Alignment', '가격 차트가 아니라 50일/200일 이동평균선 두 개를 비교합니다. 현재가 > 200일선, 현재가 > 50일선, 50일선 > 200일선을 함께 봅니다.'],
  ['VIX', '20 미만 PASS, 20 이상 25 미만 WARNING, 25 이상 FAIL입니다.'],
  ['Follow-Through Day', '조정 저점 이후 4거래일차부터 상승률과 거래량 증가가 함께 나타나는지 확인하며, 미확인 시에는 사유를 표시합니다.'],
  ['Sector Rotation', '전체 섹터 ETF를 20일 수익률순으로 보여주고, 성장/경기민감 섹터가 상위권인지 확인합니다.'],
];

const scannerRows = [
  ['Recommended', 'SEPA 통과 + Standard VCP 형성/강세 + 거래량 Watch 이상, 또는 High Tight Flag 통과 + RS 85+ + RS Line 신고가/근접 + 거래량 Strong 후보입니다.'],
  ['Partial', 'SEPA 미충족 2개 이하이면서 HTF/건설적 VCP(55점+) 형성이 있거나, RS 85+ 주도주 및 테니스 공 액션 2회 이상 등 예외 검토 가치가 있는 후보입니다.'],
  ['Low Priority', '조건 미달 항목이 많아 시스템 우선순위는 낮지만, 사용자가 수동으로 콘테스트에 보낼 수 있습니다.'],
  ['Error', '외부 API 오류, 심볼 오류, 데이터 부족 등으로 분석이 완료되지 않은 상태입니다.'],
  ['거래량 Strong', '거래량 건조화 60점 이상, 포켓 피벗 60점 이상, 또는 돌파 거래량 confirmed입니다.'],
  ['거래량 Watch', '거래량 건조화 40점 이상, 포켓 피벗 40점 이상, 또는 돌파 거래량 pending입니다.'],
  ['Base Type', '일반 추세 후보는 Standard_VCP, 8주 100% 이상 급등 또는 50일선 이격 20% 이상 후보는 High_Tight_Flag를 별도 검사합니다.'],
  ['테니스 공 액션', '최근 60거래일 중 벤치마크가 1% 이상 하락한 날에 종목이 상승 마감했거나 덜 하락한 횟수입니다.'],
];

const rsRows = [
  ['표준 유니버스', '미국 시장 RS는 S&P 500 전체를 기준으로, 한국 시장 RS는 KOSPI200 + KOSDAQ150 합산 유니버스를 기준으로 계산합니다. 스캔된 일부 종목끼리만 다시 순위를 매기지 않습니다.'],
  ['IBD Proxy Score', '현재가, 3개월 전, 6개월 전, 9개월 전, 12개월 전 가격으로 분기별 독립 수익률을 계산합니다. 최근 분기(Q1)는 2배, Q2/Q3/Q4는 1배 가중합니다.'],
  ['RS Rating 1~99', '일일 배치가 표준 유니버스의 IBD Proxy Score를 내림차순 정렬한 뒤 1위는 99, 마지막에 가까울수록 1점에 가깝게 환산합니다.'],
  ['Data Quality', '12개월 데이터가 모두 있으면 FULL, 일부 분기만 있으면 PARTIAL, 최소 3개월 가격도 없으면 NA로 저장합니다. NA는 스캐너에서 대체 순위를 만들지 않습니다.'],
  ['Mansfield RS', '종목의 52주 수익률이 해당 벤치마크의 52주 수익률을 이기는지 보는 절대 상대강도입니다. 양수/true일수록 지수 대비 강합니다.'],
  ['Macro Action', '벤치마크가 50일선과 200일선 위면 FULL, 50일선 아래/200일선 위면 REDUCED, 200일선 아래면 HALT입니다. REDUCED에서는 RS 80+ 후보를 우선 노출합니다.'],
];

const theoryRows = [
  ['미너비니 SEPA', '가격이 장단기 이동평균 위에 있고 52주 고점 근처에 있으며 유동성이 충분한 주도주를 찾는 구조입니다.'],
  ['VCP와 HTF', 'VCP는 변동성 수축과 거래량 감소를 통한 공급 소진을 봅니다. HTF는 강한 급등 후 얕고 짧은 베이스를 만들 때만 예외적으로 허용합니다.'],
  ['모멘텀 효과', 'Jegadeesh & Titman의 모멘텀 연구처럼 최근 강한 종목이 일정 기간 상대 우위를 이어가는 경향을 참고합니다.'],
  ['Mansfield 상대강도', 'Stan Weinstein식 시장 대비 상대성과 해석을 참고해 종목이 자기 벤치마크를 실제로 이기는지 확인합니다.'],
  ['거래량/수급', 'Wyckoff식 공급 소진 관점과 포켓 피벗/돌파 거래량 개념을 참고해 가격 상승의 질을 보조 판단합니다.'],
  ['펀더멘털 통합', 'DART(KR) 및 EDGAR(US) 데이터를 배치 API를 통해 직접 연동하여 EPS 성장, 매출, ROE, 기관 보유 비중을 판별에 활용합니다.'],
  ['리스크 관리', 'Standard VCP는 패턴 무효화와 8% 손절 cap을, HTF는 베이스 저점/7% cap, +5% breakeven, +10% trailing stop을 더 엄격하게 봅니다.'],
];

const contestRows = [
  ['후보 전달', '스캐너에서 사용자가 체크한 종목만 콘테스트 전달 저장소에 기록하고, 콘테스트 화면은 전달 후보를 우선 표시합니다.'],
  ['분석 세션', '최대 10개 후보와 스캐너 snapshot, 마스터 필터 상태, 기준가, 데이터 출처를 DB에 저장합니다.'],
  ['외부 LLM', 'Gemini/GPT/Claude 등에 한국어 프롬프트를 복사하고, 결과 JSON 또는 전체 리포트 전문을 다시 붙여넣을 수 있습니다.'],
  ['JSON 매핑', 'session_id, candidate_id, ticker, rank, scores, 투자 가설, 기술/펀더멘털/실적/해자/시장/리스크/촉매/comment를 저장합니다.'],
  ['최종 선택', 'actual_invested와 final_pick_rank로 표시합니다. 후보 10개 중 몇 개든 최종 투자 대상으로 선택할 수 있습니다.'],
  ['성과 복기', '1주/1개월 뒤 선택군 평균 수익률과 미선택군 평균 수익률을 비교합니다. 선택군이 낮으면 실패/반성 필요로 표시합니다.'],
];

function InfoTable({ rows }: { rows: string[][] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm text-slate-300">
        <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
          <tr>
            <th className="py-3 pr-4">항목</th>
            <th className="py-3">판단 로직</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([item, description]) => (
            <tr key={item} className="border-b border-slate-800">
              <td className="py-3 pr-4 font-semibold text-white">{item}</td>
              <td className="py-3 leading-6 text-slate-400">{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Algorithm Guide</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">MTN 알고리즘 가이드</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          MTN은 마스터 필터로 시장 환경을 읽고, 스캐너로 SEPA/VCP/HTF/RS/거래량 후보를 찾은 뒤, 콘테스트와 성과 복기로 선택 기준을 계속 개선합니다.
        </p>
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">전체 프로세스</h2>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            ['1', '마스터 필터', '시장 국면과 리스크 확인'],
            ['2', '스캐너', 'SEPA/VCP/RS/HTF 후보 탐색'],
            ['3', '콘테스트', '최대 10개 후보 비교 세션 생성'],
            ['4', 'LLM 결과 저장', 'JSON 추출 후 DB화'],
            ['5', '성과 복기', '1주/1개월 상대 성과 평가'],
          ].map(([step, title, desc]) => (
            <div key={step} className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
              <p className="font-mono text-lg font-bold text-emerald-300">{step}</p>
              <p className="mt-2 text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-sky-400" />
          <h2 className="text-xl font-bold text-white">P3 마스터 필터</h2>
        </div>
        <InfoTable rows={masterFilterRows} />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">표준 유니버스 RS</h2>
        </div>
        <InfoTable rows={rsRows} />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <ScanSearch className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">스캐너 추천 등급</h2>
        </div>
        <InfoTable rows={scannerRows} />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Centaur LLM 로그</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Centaur는 Gemini를 primary로 호출하고, 실패 원인을 fallback chain에 남깁니다. 이후 Groq, Cerebras, rule-based 순서로 대체해 로그가 비지 않도록 합니다.
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Volume2 className="h-6 w-6 text-amber-400" />
          <h2 className="text-xl font-bold text-white">점수 산출 참고 이론</h2>
        </div>
        <InfoTable rows={theoryRows} />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">콘테스트와 외부 LLM JSON</h2>
        </div>
        <InfoTable rows={contestRows} />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">SEPA/VCP 진입 해석</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          SEPA는 강한 추세의 기본 체력, VCP는 피벗 전 수축과 공급 소진, HTF는 강한 주도주의 얕은 베이스 예외를 봅니다. Partial 후보는 실패가 아니라 비교 후보로 남겨둘 가치가 있는 예외 검토군입니다.
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-rose-400" />
          <h2 className="text-xl font-bold text-white">복기 기준</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          콘테스트 후 실제 선택 종목 평균 수익률이 미선택 후보 평균 수익률보다 낮으면 해당 사이클은 실패/반성 필요로 표시합니다. 목적은 매번 후보 선정 기준을 더 정교하게 만드는 것입니다.
        </p>
      </Card>
    </div>
  );
}
