import Card from '@/components/ui/Card';
import { Activity, BarChart2, Bot, CheckCircle2, Crosshair, ScanSearch, Trophy, Volume2 } from 'lucide-react';

const masterFilterRows = [
  ['P3 점수', 'FTD, Distribution Pressure, NH/NL Proxy, Above 200D, Sector Rotation을 100점으로 합산합니다.'],
  ['시장 상태', '75점 이상 GREEN, 50점 이상 YELLOW, 그 외 RED입니다. RED여도 후보 비교는 가능하지만 포지션 크기와 손절을 보수적으로 봅니다.'],
  ['Trend Alignment', '가격 차트가 아니라 50일/200일 이동평균선 두 개를 비교합니다. 현재가 > 200일선, 현재가 > 50일선, 50일선 > 200일선을 함께 봅니다.'],
  ['VIX', '20 미만 PASS, 20 이상 25 미만 WARNING, 25 이상 FAIL입니다.'],
  ['Follow-Through Day', '조정 저점 이후 4거래일차부터 상승률과 거래량 증가가 함께 나왔는지 확인하고, 미확인 시 원인을 표시합니다.'],
  ['Sector Rotation', '전체 섹터 ETF를 20일 수익률순으로 보여주고, 성장/경기민감 섹터가 상위권인지 확인합니다.'],
];

const scannerRows = [
  ['Recommended', 'SEPA 통과 + 강한 VCP 또는 VCP 형성 + 피벗/거래량 신호가 동반된 후보입니다.'],
  ['Partial', 'SEPA 미충족이 2개 이하이거나, 일부 미달에도 VCP 형성/거래량 신호/예외 모멘텀이 있어 비교 가치가 있는 후보입니다.'],
  ['Low Priority', '조건 미달이 많아 우선순위는 낮지만 사용자가 수동으로 콘테스트에 보낼 수 있습니다.'],
  ['Error', '외부 API 오류, 심볼 오류, 데이터 부족 등으로 분석이 완료되지 않은 상태입니다.'],
  ['거래량 Strong', '거래량 건조화 65점 이상, 포켓 피벗 60점 이상, 또는 돌파 거래량 confirmed입니다.'],
  ['거래량 Watch', '거래량 건조화 50점 이상, 포켓 피벗 40점 이상, 또는 돌파 거래량 pending입니다.'],
];

const contestRows = [
  ['후보 전달', '스캐너에서 사용자가 직접 체크한 selectedTickers만 콘테스트 전달 저장소에 기록합니다. 전달 후보가 없을 때만 Recommended fallback을 사용합니다.'],
  ['분석 세션', '최대 10개 후보, 스캐너 스냅샷, 마스터 필터 상태, 기준가, 기준일, 데이터 출처를 DB에 저장합니다.'],
  ['외부 LLM', 'Gemini/GPT/Claude 등에 한국어 프롬프트를 복사하고, 결과는 JSON만 또는 전체 리포트 전문을 붙여넣을 수 있습니다.'],
  ['JSON 매핑', 'session_id, candidate_id, ticker, rank, scores, thesis, 기술/펀더멘털/실적/해자/시장/리스크/촉매/comment를 저장합니다.'],
  ['최종 선택', 'actual_invested와 final_pick_rank로 표시합니다. 후보 10개 중 몇 개든 실제 투자 대상으로 선택할 수 있습니다.'],
  ['성과 복기', '1주/1개월 기준가와 리뷰가로 선택군 평균 수익률과 미선택군 평균 수익률을 비교합니다. 상대 수익률이 음수면 실패/반성 필요입니다.'],
];

const tradeRows = [
  ['평균 진입가', '체결 시간순 평균 원가 방식입니다. 매수는 보유 원가와 수량을 늘리고, 매도는 당시 평균 단가 기준으로 원가와 수량을 줄입니다.'],
  ['실현손익', '매도 시점의 평균 단가 기준으로 계산하고, 수수료는 손익 계산에 반영합니다.'],
  ['historicalAvgEntryPrice', '완전 청산 이후에도 참고할 수 있도록 전체 진입 체결 기준 평균가를 별도로 유지합니다.'],
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
          현재 MTN은 마스터 필터로 시장 환경을 읽고, 스캐너로 SEPA/VCP/거래량 후보를 정리한 뒤, 콘테스트에서 외부 LLM 비교와 성과 복기를 누적합니다.
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
            ['2', '스캐너', 'SEPA/VCP/거래량 후보 탐색'],
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
        <p className="mt-2 text-sm leading-6 text-slate-400">
          마스터 필터는 후보를 강제로 제외하는 게 아니라 시장 리스크 문맥을 제공합니다. RED일수록 진입 비중, 손절, 보유 기간 판단을 더 보수적으로 둡니다.
        </p>
        <InfoTable rows={masterFilterRows} />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Centaur LLM 로그</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Centaur 로그는 Gemini 3.1 Flash-Lite를 primary로 호출하고, 실패 원인을 fallback chain에 남깁니다. 이후 Gemini fallback model, Groq
          <span className="font-mono text-slate-200"> openai/gpt-oss-120b</span>, Cerebras
          <span className="font-mono text-slate-200"> qwen-3-235b-a22b-instruct-2507</span>, rule-based 순서로 대체합니다.
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <ScanSearch className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">스캐너 추천 등급</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          스캐너는 웹 표 모드를 기본으로 사용하며, 앱 카드 모드와 동일한 상세 팝업을 공유합니다. KOSPI100은 KOSPI 전체 시가총액 상위 100개 기준입니다.
        </p>
        <InfoTable rows={scannerRows} />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Volume2 className="h-6 w-6 text-amber-400" />
          <h2 className="text-xl font-bold text-white">거래량 신호</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          거래량은 VCP 품질 판단의 핵심입니다. 메인 테이블에서 Strong/Watch/Weak/Unknown을 표시하고, 거래량 건조화, 포켓 피벗, 돌파 거래량으로 필터링합니다.
        </p>
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
          SEPA는 강한 추세의 기본 체력, VCP는 피벗 전 수축과 공급 소진을 봅니다. Partial 후보는 완벽한 SEPA가 아니어도 최근 모멘텀, 뉴스 변화,
          거래량 신호가 있으면 비교 대상으로 남길 수 있습니다.
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-fuchsia-400" />
          <h2 className="text-xl font-bold text-white">매매 지표와 평균 진입가</h2>
        </div>
        <InfoTable rows={tradeRows} />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-rose-400" />
          <h2 className="text-xl font-bold text-white">복기 기준</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          콘테스트 후 선택한 종목 평균 수익률이 미선택 후보 평균 수익률보다 낮으면 해당 사이클은 실패/반성 필요로 표시합니다. 목적은 매번 후보 선정 기준을
          더 날카롭게 만드는 것입니다.
        </p>
      </Card>
    </div>
  );
}
