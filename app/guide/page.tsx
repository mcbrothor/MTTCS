import Card from '@/components/ui/Card';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BookOpen,
  Crosshair,
  Database,
  Flame,
  ScanSearch,
  ShieldCheck,
  TrendingUp,
  Trophy,
} from 'lucide-react';

// ─── 데이터 테이블 ─────────────────────────────────────────────

const processRows = [
  ['01 대시보드', '커맨드 센터', '시장 상태·포트폴리오 노출도·최근 알림을 한눈에 확인합니다.'],
  ['02 시장 분석', '진입 조건 확인', '마스터 필터(P3 점수)와 매크로 탭으로 현재 시장이 공격적 진입을 허용하는지 판단합니다.'],
  ['03 종목 발굴', '미너비니 · 오닐', '미너비니 SEPA + VCP/HTF 스캐너와 오닐 CAN SLIM 스캐너로 주도주 후보를 걸러냅니다.'],
  ['04 관심 종목', '후보 추적', '스캐너 결과 중 실제로 모니터링할 종목을 워치리스트에 등록합니다.'],
  ['05 매매 계획', '리스크 계산', '피벗 진입가·손절가·포지션 크기를 계산하고 R:R 비율을 검토합니다.'],
  ['06 포트폴리오', '노출도 점검', '섹터별 비중과 총 리스크 노출을 관리합니다.'],
  ['07 콘테스트', 'LLM 비교 분석', '최대 10개 후보를 세션으로 묶어 AI(LLM)와 함께 최종 후보를 선정합니다.'],
  ['08 성과 복기', '히스토리', '선택 종목의 1주·1개월 수익률을 미선택 후보와 비교해 선정 기준을 개선합니다.'],
];

const masterFilterRows = [
  ['FTD (Follow-Through Day)', '조정 저점에서 반등 4거래일 이후, 상승률 ≥ 1.5% + 거래량 전일 상회 + 50일 평균 거래량 상회 조건이 동시에 충족되면 FTD로 확인합니다. IBD가 정의한 시장 반전 신호입니다.'],
  ['분산일 (Distribution Day)', '지수가 0.2% 이상 하락하면서 거래량이 전일보다 많은 날. 5주 이내 4일 이상이면 REDUCED, 6일 이상이면 HALT 경고가 붙습니다.'],
  ['Macro Action Level', '벤치마크(SPY/QQQ/KOSPI200/KOSDAQ150)가 50일선 + 200일선 위 → FULL, 50일선 하회·200일선 상회 → REDUCED, 200일선 하회 → HALT. HALT여도 스캔은 계속되며 신뢰도 LOW 표시 + 경고만 추가합니다.'],
  ['NH/NL Proxy', '신고가 종목 수가 신저가 종목 수보다 많은지를 시장 내부 건강도 보조 지표로 활용합니다.'],
  ['섹터 로테이션', '전체 섹터 ETF를 20일 수익률 순으로 나열해 성장·경기민감 섹터가 상위인지 확인합니다.'],
  ['VIX', '미국 공포지수. 20 미만 PASS, 20~25 WARNING, 25 초과 FAIL. 한국 시장은 VIX 대신 Macro Action Level로 대체합니다.'],
];

const rsSystemRows = [
  ['IBD Proxy Score', '현재가(P0)와 3개월 전(P3M)·6개월 전(P6M)·9개월 전(P9M)·12개월 전(P12M) 가격으로 4개 분기 수익률을 독립 계산합니다. 최근 분기(Q1)는 2배, 나머지 Q2~Q4는 1배 가중 합산한 모멘텀 점수입니다.'],
  ['RS Rating (1~99)', '표준 유니버스 전체의 IBD Proxy Score를 내림차순 정렬해 1위 → 99점, 최하위 → 1점으로 선형 환산합니다. 배치 작업으로 DB에 저장되며, 배치 전에는 벤치마크 대비 수익률 추정치(참고값)만 표시됩니다.'],
  ['표준 유니버스', 'RS Rating 계산 기준이 되는 종목 풀. 미국은 S&P 500 전체, 한국은 KOSPI 200 + KOSDAQ 150 합산. 스캔 대상 일부끼리만 비교하지 않습니다.'],
  ['Data Quality', '12개월 이력 완전 → FULL, 일부 분기 이력 → PARTIAL, 최소 3개월 미만 → NA. NA는 RS Rating 계산에서 제외됩니다.'],
  ['Mansfield RS', 'Stan Weinstein 방식. 종목 52주 수익률 − 벤치마크 52주 수익률. 양수이면 지수 대비 초과 성과, 음수이면 열위입니다.'],
  ['RS Line 신고가', 'RS Line이 최근 52주 고점을 돌파하거나 근접(10% 이내)하면 "선도주 신호"로 표시합니다. 가격이 신고가를 치기 전에 RS Line이 먼저 올라가면 특히 강한 신호입니다.'],
  ['테니스 볼 액션', '최근 60거래일 중 벤치마크가 1% 이상 하락한 날에 종목이 상승 마감하거나 벤치마크 대비 덜 하락한 횟수. 진정한 주도주는 약세장에서도 상대 강도를 유지합니다.'],
];

const sepaRows = [
  ['현재가 > 50일 이동평균', '단기 추세가 살아 있는지 확인. 가장 기본적인 상승 추세 필터입니다.'],
  ['현재가 > 150일 이동평균', '중기 추세 위에 있는 종목만 후보로 유지합니다.'],
  ['현재가 > 200일 이동평균', '장기 하락 추세 종목을 배제합니다.'],
  ['50일선 > 150일선 > 200일선', '이동평균 정배열. 단·중·장기 모두 상승 방향이어야 합니다.'],
  ['200일선 상승', '200일 이동평균이 1개월 전보다 높아야 합니다. 장기 추세가 우상향인지 확인합니다.'],
  ['52주 고점 25% 이내', '미너비니 Trend Template 원전 기준 25%. VCP 베이스 형성 중인 종목까지 포함. 10% 이내는 "피벗 근접" 별도 표시.'],
  ['52주 저점 대비 +30% 이상', '바닥에 갇힌 종목을 걸러냅니다. Stage 2 상승 단계 진입 여부를 보조 확인합니다.'],
  ['RS Rating ≥ 70 (DB 배치 시)', '유니버스 전체 백분위 기준 공식 RS. 배치 실행 전에는 pass/fail에 반영되지 않으며 참고값으로만 표시됩니다.'],
  ['20일 평균 거래대금', 'US: $10M 이상 / KOSPI: ₩30억 이상 / KOSDAQ: ₩10억 이상. 슬리피지 리스크가 낮은 유동성 확보 여부.'],
  ['유동 시총 (Dollar Float)', '$5B 이하 권장. 유동 물량이 너무 무거우면 큰 상승에 더 많은 에너지가 필요합니다.'],
  ['SEPA 최종 판정', '핵심 조건 7개(이동평균 5개 + 52주 위치 2개) 중 7개 모두 통과 → PASS, 6개 통과 → WARNING(1개 미충족 허용), 5개 이하 → FAIL.'],
];

const vcpRows = [
  ['VCP란?', 'Volatility Contraction Pattern. 미너비니가 정의한 수축 패턴. 가격 변동성과 거래량이 점진적으로 줄어들며 공급이 소진되고, 피벗 돌파 시 폭발적 상승을 준비하는 구조입니다.'],
  ['주봉 리샘플링', '일봉 노이즈를 제거하기 위해 분석 구간의 일봉을 주봉(월요일 기준 ISO 주차)으로 재집계합니다. 미너비니 VCP도 주봉 차트 기반이므로 이 방식이 원전에 충실합니다.'],
  ['수축 감지 (주봉 기준)', '주봉 고점(피크)과 저점(트로프)을 5주 윈도우로 탐색. 각 피크에서 다음 피크 사이의 가장 깊은 저점을 해당 수축의 저점으로 삼아 겹침을 방지합니다.'],
  ['수축 유효성 검증', '수축 깊이(depth%)가 이전 수축보다 작아야 합니다. 고점 절대가가 아니라 depth%가 감소하면 유효. 고점이 수평 유지되거나 올라가도 depth%가 줄면 유효한 수축입니다.'],
  ['거래량 건조화 (일봉)', '수축 구간 내 저거래량 일수 비율을 측정합니다. 거래량이 줄면서 가격이 수축하는 것이 공급 소진의 핵심 증거입니다. 주봉 합산 거래량은 비교 기준으로 부적합해 일봉을 유지합니다.'],
  ['포켓 피벗 (Pocket Pivot)', 'IBD/크리스 칸터 개념. 상승일 거래량이 최근 10거래일 중 가장 많은 하락일 거래량을 초과할 때. 기관 매집이 비공개로 진행되는 초기 신호입니다.'],
  ['볼린저 스퀴즈', '볼린저 밴드 폭이 최근 50일 중 하위 20%일 때 변동성 극도 수축으로 판정. 강한 가격 이동의 전조입니다.'],
  ['VCP 점수 구성', '수축 패턴 40% + 거래량 건조화 30% + 볼린저 스퀴즈 15% + 포켓 피벗 15%. 70점 이상 → strong, 50~69점 → forming, 25~49점 → weak.'],
  ['피벗 & 무효화 기준', '최종 수축의 고점 = VCP 피벗 진입가. 최종 수축의 저점 = 패턴 무효화 기준선. 피벗 돌파 후 저점 이탈 시 손절.'],
];

const htfRows = [
  ['HTF란?', 'High Tight Flag. 8주 이내 100% 이상 급등 또는 50일선 대비 20% 이상 이격된 종목에 한해 VCP 대신 적용하는 예외 베이스 분석. 강한 주도주의 짧고 얕은 조정입니다.'],
  ['HTF 진입 조건', 'Momentum Branch가 EXTENDED(급등 후)일 때만 적용. 베이스 기간이 짧고, 최대 낙폭이 제한적이며, 우측 거래량 건조화가 확인되어야 합니다.'],
  ['HTF 점수', '기본 45점 + 타이트니스 점수 × 0.25 + 거래량 건조화 점수 × 0.2 + 포켓 피벗 점수 × 0.1. 50~95점 클램핑. 70점 이상 → strong, 50~69 → forming.'],
  ['HTF 손절 기준', '베이스 저점 이탈 또는 7% cap. 피벗 +5%에서 breakeven 이동, +10% trailing stop 적용 권장.'],
];

const canslimRows = [
  ['C — 현재 분기 EPS', '직전 실제 분기(−1Q) 대비 YoY 성장률 ≥ 25% 권장. −10% 이하 → 즉시 FAIL. 데이터는 Yahoo Finance earningsTrend의 −1q(직전 분기 실적)에서 추출.'],
  ['C — EPS 가속화', '현재 분기 성장률이 직전 분기보다 높아야 가속 성장 확인. 꺾이면 경고(신뢰도 MEDIUM)로 처리하며 즉시 탈락하지 않습니다.'],
  ['C — 3분기 연속 성장', '최근 3개 분기 모두 25% 이상이면 PASS. 1~2개 분기만 충족하면 WARNING.'],
  ['C — 분기 매출 성장', '≥ 15% 최소 기준. 20% 이상이면 PASS. 15~20%는 WARNING.'],
  ['A — 연간 EPS 성장', '최근 2개년 이상 연평균 ≥ 25%. 1개 연도 역성장 → WARNING(턴어라운드 허용). 2개 연도 이상 역성장 → FAIL.'],
  ['A — ROE', '자기자본이익률 ≥ 17%. 높은 ROE는 경쟁 우위(해자)를 나타냅니다.'],
  ['N — 52주 신고가 근접', 'VCP/베이스 패턴 없으면 25% 이내, 베이스 패턴 있으면 35% 이내. Cup with Handle / Double Bottom / Flat Base / VCP 패턴을 자동 감지합니다.'],
  ['N — 피벗 매수 구간', '피벗 +5% 이내 → VALID(적정 매수), +5~10% → EXTENDED(경고), +10% 초과 → TOO_LATE(추격 금지).'],
  ['S — 유통 주식 수', '5천만 주 이하 선호. 2억 주 초과 → 수급 탄력 저하 경고. 자사주 매입 확인 시 공급 축소 PASS 신호.'],
  ['S — 돌파 거래량', '돌파일에 한해 50일 평균 거래량 대비 1.5배 이상 필요. 미충족 시 FAIL.'],
  ['L — RS Rating', 'DB 배치 RS ≥ 80 PASS, ≥ 90이면 초강세 리더. 데이터 없으면 INFO 처리.'],
  ['I — 기관 보유', '보유 기관 수 ≥ 3개 최소 기준. 보유 비중 20~80% 적정 구간. 기관 추세 감소는 경고만(Yahoo 데이터 신뢰도 한계 반영).'],
  ['M — 시장 방향성', 'FULL → 정상 진입. REDUCED → 신뢰도 MEDIUM, RS 90+ 우선. HALT → 신뢰도 LOW + 강한 경고, 스캔은 계속(워치리스트 활용).'],
];

const universeRows = [
  ['NASDAQ 100', '나스닥 100 대형 성장주. 미국 기술·성장 주도주 후보를 집중 스캔합니다.'],
  ['S&P 500', '미국 대형주 500개. RS Rating 계산의 표준 기준 유니버스이기도 합니다.'],
  ['Russell 2000', '미국 소형주 2000개. 대형지수 편입 전 초기 주도주를 발굴합니다. 차세대 리더는 여기서 시작합니다.'],
  ['KOSPI 시총 상위 200', 'KOSPI 시총 상위 200개. 국내 대형 주도주 후보. RS Rating 기준 유니버스(KOSPI200+KOSDAQ150 합산)의 절반.'],
  ['KOSDAQ 시총 상위 150', 'KOSDAQ 시총 상위 150개. 국내 성장주 후보. RS 기준 유니버스의 나머지 절반.'],
  ['KOSDAQ 전체 (최대 1,000개)', 'KOSDAQ 시총 상위 전체 스캔. 차세대 리더는 KOSDAQ150 밖에서 시작합니다. 처리 시간이 오래 걸릴 수 있습니다.'],
];

const riskRows = [
  ['기본 손절 기준', '진입가 대비 −8% (CAN SLIM 기준). VCP 패턴이 있으면 최종 수축 저점 이탈도 손절 기준으로 병행 사용합니다.'],
  ['HTF 손절', '−7% cap. 베이스 저점 이탈 시 즉시 손절.'],
  ['포지션 크기 공식', '(총 자본 × 리스크 비율%) ÷ (진입가 − 손절가). 기본 총 자본 5만 달러, 리스크 1% 설정.'],
  ['피벗 매수 구간 엄수', '피벗 +5% 이내에서만 진입. +10% 초과 시 추격 금지. 초기 진입 기회를 놓치면 다음 베이스를 기다립니다.'],
  ['포지션 분할 진입', 'REDUCED 또는 HALT 시장에서는 절반 포지션으로 시작. FTD 확인 후 추가 매수.'],
  ['8주 보유 원칙', '강한 주도주는 진입 후 8주간 손절가 외 매도 자제. 충분한 수익이 붙어야 trailing stop으로 전환.'],
];

const contestRows = [
  ['콘테스트 세션 생성', '스캐너에서 체크한 종목(최대 10개)을 콘테스트로 전달. 스캐너 snapshot, 마스터 필터 상태, 각 종목의 VCP/SEPA/CAN SLIM 점수를 DB에 저장합니다.'],
  ['LLM 분석 연동', 'Gemini / GPT / Claude 등 외부 LLM에 한국어 프롬프트를 복사해 종목 분석을 요청합니다. 결과 JSON 또는 전체 리포트를 다시 붙여넣어 DB에 저장합니다.'],
  ['저장 필드', 'ticker, rank, 투자 가설, 기술적 분석, 펀더멘털, 실적, 해자, 시장 리더십, 리스크, 촉매, 코멘트.'],
  ['최종 선택', 'actual_invested와 final_pick_rank로 콘테스트 후보 중 실제 투자 종목을 표시합니다.'],
];

const reviewRows = [
  ['1주 후 복기', '선택군 평균 수익률과 미선택군 평균 수익률을 비교합니다.'],
  ['1개월 후 복기', '더 긴 시간 지평에서 선정 기준의 유효성을 검증합니다.'],
  ['실패 판정', '선택군 평균 < 미선택군 평균이면 해당 사이클은 "반성 필요"로 표시. 어떤 필터 기준이 부실했는지 역추적합니다.'],
];

// ─── 공통 컴포넌트 ───────────────────────────────────────────────

function InfoTable({ rows, cols = ['항목', '설명'] }: { rows: string[][]; cols?: string[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm text-slate-300">
        <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
          <tr>
            {cols.map((col) => (
              <th key={col} className="py-3 pr-4 first:w-[240px]">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([item, ...rest]) => (
            <tr key={item} className="border-b border-slate-800 last:border-0">
              <td className="py-3 pr-4 font-semibold text-white align-top">{item}</td>
              {rest.map((cell, i) => (
                <td key={i} className="py-3 pr-4 leading-6 text-slate-400 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: 'emerald' | 'sky' | 'amber' | 'rose' | 'indigo' | 'slate' }) {
  const colorMap = {
    emerald: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
    sky: 'bg-sky-900/50 text-sky-300 border-sky-700/50',
    amber: 'bg-amber-900/50 text-amber-300 border-amber-700/50',
    rose: 'bg-rose-900/50 text-rose-300 border-rose-700/50',
    indigo: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/50',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
  };
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${colorMap[color]}`}>{text}</span>
  );
}

// ─── 메인 페이지 ────────────────────────────────────────────────

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">

      {/* 헤더 */}
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Algorithm Guide</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">MTN 알고리즘 가이드</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          MTN은 미너비니 SEPA·VCP/HTF와 오닐 CAN SLIM 두 가지 스크리닝 방법론을 결합한 주도주 추세 추종 매매 시스템입니다.
          시장 환경 분석 → 종목 발굴 → 리스크 관리 → 콘테스트 → 성과 복기의 8단계 프로세스로 운영됩니다.
        </p>
      </div>

      {/* 1. 전체 프로세스 */}
      <Card>
        <SectionHeader
          icon={<Activity className="h-6 w-6 text-emerald-400" />}
          title="전체 8단계 프로세스"
          subtitle="단계별로 의사결정 깔때기를 좁혀가며 최종 매매 후보를 선정합니다."
        />
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3 pr-4">단계</th>
                <th className="py-3 pr-4">메뉴</th>
                <th className="py-3">역할</th>
              </tr>
            </thead>
            <tbody>
              {processRows.map(([step, menu, role]) => (
                <tr key={step} className="border-b border-slate-800 last:border-0">
                  <td className="py-3 pr-4 font-mono font-bold text-emerald-300 align-top whitespace-nowrap">{step}</td>
                  <td className="py-3 pr-4 font-semibold text-white align-top whitespace-nowrap">{menu}</td>
                  <td className="py-3 leading-6 text-slate-400 align-top">{role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 2. 시장 분석 */}
      <Card>
        <SectionHeader
          icon={<BarChart2 className="h-6 w-6 text-sky-400" />}
          title="02 · 시장 분석 — 마스터 필터"
          subtitle="시장 환경이 신규 진입에 우호적인지 먼저 판단합니다. 좋은 종목도 나쁜 시장에서는 이기지 못합니다."
        />
        <div className="mt-4 flex gap-2 flex-wrap">
          <Badge text="FULL — 정상 진입" color="emerald" />
          <Badge text="REDUCED — 포지션 축소" color="amber" />
          <Badge text="HALT — 워치리스트만" color="rose" />
        </div>
        <InfoTable rows={masterFilterRows} />
        <div className="mt-4 rounded-lg border border-sky-800/40 bg-sky-900/20 p-4 text-sm text-sky-300">
          <strong>핵심 원칙:</strong> HALT 구간에서도 스캐너는 계속 동작합니다. 차세대 리더는 시장 바닥에서 발굴됩니다.
          단, 신뢰도(Confidence)가 LOW로 고정되며 포지션 진입은 FTD 확인 후 점진적으로만 허용합니다.
        </div>
      </Card>

      {/* 3. RS Rating 시스템 */}
      <Card>
        <SectionHeader
          icon={<TrendingUp className="h-6 w-6 text-emerald-400" />}
          title="RS Rating 시스템 — 상대강도 지수"
          subtitle="IBD가 사용하는 1~99 백분위 상대강도 지수. 종목이 전체 시장 대비 얼마나 강한지를 수치화합니다."
        />
        <InfoTable rows={rsSystemRows} />
        <div className="mt-4 rounded-lg border border-amber-800/40 bg-amber-900/20 p-4 text-sm text-amber-300">
          <strong>중요:</strong> RS Rating은 배치 작업(RS 메트릭 계산)이 실행된 후에만 공식 pass/fail 판정에 반영됩니다.
          배치 전에는 벤치마크 대비 수익률 추정치를 참고값으로 표시하며, 이는 전체 유니버스 대비 순위가 아니므로
          pass/fail 기준으로 사용하면 상승장에서 전 종목 통과·하락장에서 전 종목 탈락 오류가 발생합니다.
        </div>
      </Card>

      {/* 4. 미너비니 SEPA */}
      <Card>
        <SectionHeader
          icon={<Crosshair className="h-6 w-6 text-emerald-400" />}
          title="03-A · 미너비니 SEPA 스캐너"
          subtitle="Specific Entry Point Analysis. 가격·이동평균·거래대금·52주 위치로 상승 추세의 '건강한 체력'을 가진 종목을 선별합니다."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['핵심 조건 7개', '이동평균 정배열(3개) + 200일선 상승 + 200일선 위 + 52주 위치 2개'],
            ['PASS 조건', '핵심 7개 모두 통과'],
            ['WARNING 조건', '핵심 6개 통과 (1개 미충족 허용)'],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs font-semibold text-emerald-300">{title}</p>
              <p className="mt-1 text-xs text-slate-400 leading-5">{desc}</p>
            </div>
          ))}
        </div>
        <InfoTable rows={sepaRows} />
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
          <strong className="text-white">펀더멘털 지표(EPS·매출·ROE·부채)</strong>는 SEPA 판정(pass/fail)에 영향을 주지 않습니다.
          가격·거래량 기반 SEPA 판정과 분리하여 참고 정보(info)로만 표시합니다.
          펀더멘털 검증은 CAN SLIM 스캐너에서 수행합니다.
        </div>
      </Card>

      {/* 5. VCP */}
      <Card>
        <SectionHeader
          icon={<Flame className="h-6 w-6 text-amber-400" />}
          title="03-A · VCP (변동성 수축 패턴)"
          subtitle="Volatility Contraction Pattern. SEPA 통과 이후 실제 매매 타이밍을 잡는 패턴 분석입니다."
        />
        <div className="mt-4 flex gap-2 flex-wrap">
          <Badge text="strong ≥ 70점" color="emerald" />
          <Badge text="forming 50~69점" color="sky" />
          <Badge text="weak 25~49점" color="amber" />
          <Badge text="none &lt; 25점" color="slate" />
        </div>
        <InfoTable rows={vcpRows} />

        <div className="mt-6">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            HTF (High Tight Flag) — 급등 후 예외 패턴
          </h3>
          <InfoTable rows={htfRows} />
        </div>
      </Card>

      {/* 6. CAN SLIM */}
      <Card>
        <SectionHeader
          icon={<ScanSearch className="h-6 w-6 text-indigo-400" />}
          title="03-B · 오닐 CAN SLIM 스캐너"
          subtitle="William O'Neil이 정의한 7대 주도주 특성. 펀더멘털 실적과 수급·시장 방향성을 종합 평가합니다."
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-7 text-center">
          {[
            ['C', '현재 분기 EPS', 'sky'],
            ['A', '연간 EPS', 'sky'],
            ['N', '신고가/패턴', 'emerald'],
            ['S', '수급', 'amber'],
            ['L', '리더십', 'rose'],
            ['I', '기관', 'indigo'],
            ['M', '시장', 'slate'],
          ].map(([letter, label, color]) => (
            <div key={letter} className="rounded-lg border border-slate-700 bg-slate-950/50 p-2">
              <p className={`font-mono text-lg font-bold text-${color}-400`}>{letter}</p>
              <p className="mt-1 text-[10px] text-slate-400 leading-4">{label}</p>
            </div>
          ))}
        </div>
        <InfoTable rows={canslimRows} />
        <div className="mt-4 rounded-lg border border-indigo-800/40 bg-indigo-900/20 p-4 text-sm text-indigo-300">
          <strong>Dual Screener Tier:</strong> CAN SLIM PASS + VCP strong/forming → T1 최우선 관심 /
          CAN SLIM PASS + VCP 없음 → WL 워치리스트 /
          CAN SLIM FAIL + VCP strong/forming → ST 단기 후보 /
          둘 다 FAIL → 제외.
        </div>
      </Card>

      {/* 7. 종목군 */}
      <Card>
        <SectionHeader
          icon={<Database className="h-6 w-6 text-sky-400" />}
          title="유니버스 (스캔 종목군)"
          subtitle="스캔 대상 종목 풀. RS Rating 계산은 표준 유니버스(S&P 500 / KOSPI200+KOSDAQ150)를 기준으로 하며, 스캔 유니버스와 분리됩니다."
        />
        <InfoTable rows={universeRows} />
      </Card>

      {/* 8. 리스크 관리 */}
      <Card>
        <SectionHeader
          icon={<ShieldCheck className="h-6 w-6 text-rose-400" />}
          title="05 · 매매 계획 & 리스크 관리"
          subtitle="수익 극대화보다 손실 제한이 먼저입니다. 포지션 크기는 언제나 리스크 기준으로 역산합니다."
        />
        <InfoTable rows={riskRows} />
        <div className="mt-4 rounded-lg border border-rose-800/40 bg-rose-900/20 p-4 text-sm text-rose-300">
          <strong>포지션 크기 공식:</strong> (총 자본 × 리스크 %) ÷ (진입가 − 손절가) = 매수 가능 주수.
          예) 총 자본 $50,000, 리스크 1% = $500, 진입가 $100, 손절가 $92(−8%) → 최대 62주 매수 가능.
        </div>
      </Card>

      {/* 9. 콘테스트 */}
      <Card>
        <SectionHeader
          icon={<Trophy className="h-6 w-6 text-emerald-400" />}
          title="07 · 콘테스트 & LLM 비교 분석"
          subtitle="최대 10개 후보를 세션으로 묶어 AI의 도움을 받아 최종 순위를 결정합니다."
        />
        <InfoTable rows={contestRows} />
      </Card>

      {/* 10. 성과 복기 */}
      <Card>
        <SectionHeader
          icon={<BookOpen className="h-6 w-6 text-cyan-400" />}
          title="08 · 성과 복기"
          subtitle="선정 기준의 장기 유효성을 검증합니다. 선택이 옳았는지 데이터로 증명하세요."
        />
        <InfoTable rows={reviewRows} />
        <div className="mt-4 rounded-lg border border-cyan-800/40 bg-cyan-900/20 p-4 text-sm text-cyan-300">
          <strong>복기의 목적은 자책이 아니라 개선입니다.</strong> 어떤 필터가 실제로 수익률 예측력이 있는지,
          어떤 기준이 노이즈인지를 데이터로 확인해 다음 사이클의 스크리닝 기준을 정교하게 만들어 갑니다.
        </div>
      </Card>

      {/* 이론적 배경 */}
      <Card>
        <SectionHeader
          icon={<BookOpen className="h-6 w-6 text-slate-400" />}
          title="이론적 배경 & 참고 자료"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ['Mark Minervini', '"Trade Like a Stock Market Wizard" · "Think & Trade Like a Champion" — SEPA·VCP·HTF·Pocket Pivot 이론의 원전.'],
            ['William O\'Neil', '"How to Make Money in Stocks" — CAN SLIM 7대 원칙, IBD RS Rating, FTD, Base Pattern 이론.'],
            ['Stan Weinstein', '"Secrets for Profiting in Bull and Bear Markets" — Mansfield RS, Stage 2 상승 단계, 50일선 돌파 원칙.'],
            ['Jegadeesh & Titman (1993)', '"Returns to Buying Winners and Selling Losers" — 모멘텀 팩터의 학술적 근거. 과거 3~12개월 강세 종목이 단기 우위를 이어가는 경향.'],
            ['Bollinger (2001)', '"Bollinger on Bollinger Bands" — 밴드 스퀴즈와 변동성 수축 이론.'],
            ['Chris Kacher & Gil Morales', '"Trade Like an O\'Neil Disciple" — Pocket Pivot, 기관 매집 시그널 해석.'],
          ].map(([author, desc]) => (
            <div key={author} className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
              <p className="text-sm font-semibold text-white">{author}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}
