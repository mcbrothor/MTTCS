import Link from 'next/link';
import Card from '@/components/ui/Card';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BookOpen,
  CheckCircle2,
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
  ['00 오늘', '커맨드 센터', '시장 상태·포트폴리오 노출도·최근 알림과 다음 행동을 한눈에 확인합니다.'],
  ['01 시장 분석', '진입 조건 확인', '오늘의 결론과 시장 밖 위험 탭으로 현재 시장이 새 매수를 허용하는지 판단합니다.'],
  ['02 종목 발굴', '5개 스캐너', '미너비니·CAN SLIM·주도주·모멘텀·쿨라매기 스캐너로 후보를 발굴하고 상세 패널에서 교차 검증합니다.'],
  ['03 콘테스트', '후보 비교 분석', '최대 10개 후보를 세션으로 묶어 규칙 엔진과 LLM 결과를 비교해 우선순위를 정합니다.'],
  ['04 관심 종목', '후보 추적', '즉시 매수하지 않을 후보를 워치리스트에 등록하고 이벤트·가격 변화를 추적합니다.'],
  ['05 매매 계획', '리스크 계산', '피벗 진입가·손절가·포지션 크기를 계산하고 R:R 비율을 검토합니다.'],
  ['06 포트폴리오', '노출도 점검', '섹터별 비중과 총 리스크 노출을 관리합니다.'],
  ['07 성과 복기', '히스토리·추천 성과', '실제 거래와 추천 후보의 결과를 비교해 선정·실행 기준을 개선합니다.'],
];

const scannerMenuRows = [
  ['미너비니 스크리닝', 'SEPA 추세 조건과 VCP/HTF 베이스, 피벗·손절 기준을 함께 평가합니다.'],
  ['윌리엄 오닐 스크리닝', 'CAN SLIM 7개 기둥과 VCP를 교차 검증해 T1/WL/ST 티어를 부여합니다.'],
  ['주도주 스캐너', '표준 유니버스 상대강도와 추세 품질을 결합해 시장 주도 후보를 순위화합니다.'],
  ['모멘텀 스캐너', 'RVOL과 당일 ROC로 거래량 폭발을 포착하며, 최신 일일 스냅샷을 먼저 표시합니다.'],
  ['쿨라매기 스캐너', 'EP·Breakout·Flag 유형의 단기 모멘텀 셋업을 별도 규칙으로 판정합니다.'],
];

const scannerOperationRows = [
  ['캐시 우선 표시', '화면 진입 시 daily_screener_candidates의 최신 유효 결과를 즉시 표시합니다. 후속 Top5 분석이 실패해도 종목 후보가 저장되어 있으면 사용할 수 있습니다.'],
  ['기준시각 확인', '결과 상단의 일일 스냅샷/실시간 재스캔 표시와 기준시각을 확인합니다. 오래된 결과를 실시간 값으로 오인하지 않습니다.'],
  ['전체 재스캔', '최신 가격이 반드시 필요할 때만 실행합니다. 20종목 배치와 제한된 동시성으로 처리되므로 완료까지 시간이 걸릴 수 있습니다.'],
  ['단일 종목 재계산', '상세 패널에서 관심 종목 하나만 다시 계산해 외부 API 호출과 대기 시간을 줄입니다.'],
  ['상세 드릴다운', '결과 행·카드를 누르면 차트, VCP, SEPA, 피벗, 손절, RVOL을 한 화면에서 확인합니다.'],
  ['매매 계획 연결', '상세 패널의 매매 계획 생성 버튼으로 티커·거래소를 유지한 채 계획 화면으로 이동합니다.'],
];

const momentumRows = [
  ['EXPLOSIVE', 'RVOL 3.0배 이상이면서 당일 ROC +5% 이상. 강한 수급 유입이지만 추격 매수 전 피벗 이격을 확인합니다.'],
  ['BREAKOUT', 'RVOL 2.0배 이상이면서 당일 ROC +3% 이상. 돌파 거래량과 VCP/SEPA 상태를 상세 패널에서 재확인합니다.'],
  ['WARM', 'RVOL 1.5배 이상. 즉시 진입보다 관심종목 등록과 다음 거래일 추적에 적합합니다.'],
  ['NONE', '현재 기준에 미달한 종목. 전체 결과에는 남을 수 있으나 매수 후보로 해석하지 않습니다.'],
];

const masterFilterRows = [
  ['강한 반등 확인 여부', '조정 저점에서 반등 4거래일 이후, 상승률 ≥ 1.5% + 거래량 전일 상회 + 50일 평균 거래량 상회 조건이 동시에 충족되면 시장 반전 신호로 봅니다.'],
  ['분산일 (Distribution Day)', '지수가 0.2% 이상 하락하면서 거래량이 전일보다 많은 날. 5주 이내 4일 이상이면 REDUCED, 6일 이상이면 HALT 경고가 붙습니다.'],
  ['시장 평균선 행동 단계', '벤치마크(SPY/QQQ/KOSPI200/KOSDAQ150)가 50일선 + 200일선 위 → 정상, 50일선 하회·200일선 상회 → 축소, 200일선 하회 → 중단. 중단 구간이어도 스캔은 계속되며 신뢰도 낮음 표시 + 경고만 추가합니다.'],
  ['새 고점/새 저점 힘겨루기', '신고가 종목 수가 신저가 종목 수보다 많은지를 시장 내부 건강도 보조 지표로 활용합니다.'],
  ['섹터 로테이션', '화면은 전체 섹터 ETF를 당일 수익률 순으로 보여 단기 흐름을 확인합니다. 종합 점수는 기존 20일 수익률 리더십 기준을 유지합니다.'],
  ['VIX', '미국 공포지수. 20 미만 PASS, 20~25 WARNING, 25 초과 FAIL. 한국 시장은 VIX 대신 Macro Action Level로 대체합니다.'],
];

const rsSystemRows = [
  ['IBD Proxy Score', '현재가와 3개월 전·6개월 전·9개월 전·12개월 전 가격으로 4개 분기 수익률을 독립 계산합니다. 최근 분기는 2배, 나머지 분기는 1배 가중 합산한 모멘텀 점수입니다.'],
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
  ['포지션 크기 공식', '(계산 기준 자본 × 리스크 비율%) ÷ (진입가 − 손절가). 기본 기준 자본 5만 달러, 리스크 1% 설정.'],
  ['피벗 매수 구간 엄수', '피벗 +5% 이내에서만 진입. +10% 초과 시 추격 금지. 초기 진입 기회를 놓치면 다음 베이스를 기다립니다.'],
  ['포지션 분할 진입', '축소 또는 중단 시장에서는 절반 포지션으로 시작. 강한 반등 확인 후 추가 매수.'],
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

const threeLayerReviewRows = [
  ['Layer 1 — Entry Snapshot', '진입 당시 체크리스트, SEPA/VCP 상태, 진입가·손절가·포지션 크기를 고정합니다. 결과가 나온 뒤 기준을 바꾸지 않기 위한 원본 기록입니다.'],
  ['Layer 2 — Contest & LLM Verdict', '콘테스트 순위와 LLM 판단을 저장합니다. PROCEED/WATCH/SKIP 판단이 실제 결과와 맞았는지 비교해 후보 선정 품질을 검증합니다.'],
  ['Layer 3 — Actual Outcome', '실현손익, R multiple, discipline, mistake tag를 결합해 진입 판단 문제인지 실행 문제인지 분리합니다.'],
  ['교정 액션', 'late_entry, early_exit, plan_violation 같은 mistake tag를 다음 거래에서 차단할 구체적 행동으로 바꿉니다.'],
];

const lifecycleRows = [
  ['초기 진입', '계획 수량과 실제 진입 수량이 맞는지 확인합니다. 최초 stop 기준으로 open risk가 계산됩니다.'],
  ['피라미딩', '추가 매수는 평균단가, 잔량, open risk를 다시 계산합니다. 수익 중 추가인지, 리스크 초과 추가인지 분리해 봅니다.'],
  ['부분 매도', '실현손익은 확정하고 남은 수량의 평균단가와 open risk를 재계산합니다. 좋은 부분매도는 리스크를 낮추며 추세 참여를 유지합니다.'],
  ['전량 청산', '최종 R multiple과 exit reason이 기록됩니다. 수익 거래라도 계획 위반이면 discipline에서 불이익을 줍니다.'],
];

const strategyMenuRows = [
  ['입력 금액 단위', 'KRW(원화) 또는 USD(달러)를 먼저 선택합니다. 원금·외부 보유 평가액과 실행표가 모두 선택 통화로 표시됩니다. 통화를 바꿔도 입력 숫자는 자동 환산되지 않으므로 새 단위에 맞게 금액을 확인합니다.'],
  ['전략 계산 원금', '내가 실제로 운용할 원금을 직접 입력합니다. 비우거나 0을 입력하면 통합 포트폴리오 자산을 사용합니다. 이 값이 목표 금액과 분할 금액의 계산 기준입니다.'],
  ['기존 보유 평가액', '이미 보유한 금·QQQ·QLD·TQQQ와 외부·실물 보유액을 목표에서 차감합니다. 목표까지 부족하면 매수 계획, 초과하면 축소 계획이 만들어집니다.'],
  ['오늘의 의사결정', '가장 위의 브리핑에서 지금 할 일, 하지 말 일, 다음 전환 조건을 먼저 확인합니다. 아래 지표를 보기 전에 결론부터 읽습니다.'],
  ['언제 진입하나요?', 'READY는 현재 데이터와 종가 조건이 충족된 단계, WAIT는 아직 기다려야 하는 단계입니다. 장중 예상으로 먼저 매수하지 않습니다.'],
  ['분할 실행표', '금액·예상 수량·조건을 단계별로 표시합니다. READY인 단계만 다음 거래 가능 시점에 검토하며, 자동 주문은 실행하지 않습니다.'],
  ['데이터 품질', 'VALID만 정상 신호로 사용합니다. DEGRADED·BLOCKED 또는 데이터 기준시각이 오래되면 신규 전술 진입을 중단합니다.'],
];

const entryStateRows = [
  ['READY', '종가·추세·위험 조건이 충족되었습니다. 해당 단계의 금액과 예상 수량만 검토합니다. READY가 매수 강제 지시는 아닙니다.'],
  ['WAIT', '조건이 아직 충족되지 않았습니다. 가격이 가까워 보여도 선진입하거나 예상 돌파를 매수하지 않습니다.'],
  ['PAUSED / RISK_PAUSED', '사용자가 신규 위험 투입을 일시중지했습니다. 기존 보유를 점검하되 신규 매수는 하지 않습니다.'],
  ['DEGRADED / BLOCKED', '데이터가 누락·지연되었거나 계산에 필요한 관측치가 부족합니다. 마지막 값만 보고 진입하지 않습니다.'],
  ['축소·매도 READY', '목표 비중 초과, 추세 이탈, 유효 노출 초과 등 방어 조건이 발생했습니다. 축소 실행표의 50% → 30% → 20% 순서를 확인합니다.'],
];

const goldStrategyRows = [
  ['코어 진입', '장기 보유용 4%입니다. 가격 데이터가 유효하고 위험 일시중지가 아니면 목표 부족액을 3회로 나눕니다. 전술 신호가 없어도 코어는 별도로 관리합니다.'],
  ['빠른 재진입', '선택한 금 상품의 일봉 종가가 직전 20거래일 최고가를 돌파하고 완전한 매크로 점수가 +1 이상일 때 전술 한도의 절반만 먼저 검토합니다.'],
  ['월말 추세 진입', '선택 상품의 최신 월말 종가가 최근 6개 월말 평균보다 높아 ON이 되고 다음 거래일에 유효해진 뒤, 매크로 한도 안에서 잔여 전술 비중을 검토합니다.'],
  ['전술 비중', '완전한 매크로 점수 +2~+3은 최대 6%, 0~+1은 최대 3%, −1 이하는 0%입니다. 매크로 입력이 불완전하면 0%로 차단합니다.'],
  ['손절·추적', '선택 상품 자체 OHLC의 진입가 − 2ATR을 초기 손절로 사용합니다. 최고 종가가 올라가면 최고 종가 − 2ATR로 추적합니다.'],
  ['주의', 'XAU/USD 참고 레벨을 GLD나 국내 ETF로 환산하지 않습니다. 실물 금은 총 노출에 포함하지만 트레이딩 신호 대상이 아닙니다.'],
];

const nasdaqStrategyRows = [
  ['QQQ 코어 진입', '월말 10개월 추세가 ON으로 유효하고 QQQ가 200일선 위에서 2거래일 확인되면 부족액을 40% → 30% → 30%로 나눕니다.'],
  ['QLD 전술 진입', 'QQQ 월말 추세 ON, 200일선 2일 확인, RV20 30% 미만, 데이터 VALID가 동시에 필요합니다. 계획 금액은 50%씩 두 번 나눕니다.'],
  ['TQQQ 전술 진입', 'QLD 조건에 더해 50일선 > 200일선, QQQ 20일 돌파, RV20 18% 이하, 사용자의 TQQQ 위험 확인이 모두 필요합니다.'],
  ['축소 조건', '월말 추세 OFF, QQQ 200일선 재이탈, 선택 ETF의 2ATR 추적 손절 또는 전체 유효 노출 30% 초과 시 디레버리징을 우선합니다.'],
  ['상품 운용', 'QQQ는 1배 코어, QLD는 일일 2배, TQQQ는 일일 3배 목표입니다. QLD와 TQQQ를 동시에 선택·운용하지 않습니다.'],
  ['주의', '레버리지 ETF는 매일 재설정되므로 장기 누적 수익이 QQQ의 단순 2배·3배와 다릅니다. 실행 가격과 손절은 선택 ETF 자체 OHLC를 사용합니다.'],
];

const currentUpdateRows = [
  ['상단 의사결정 브리핑', '금·나스닥100 메뉴는 상세 지표보다 먼저 오늘 할 일, 금지 행동, 다음 전환 조건을 보여줍니다.'],
  ['직접 입력 원금', '통합 포트폴리오 값이 0이거나 별도 자금을 운용할 때 사용자가 원금을 저장해 전략을 재계산할 수 있습니다.'],
  ['KRW·USD 입력 단위', '금·나스닥100 화면에서 동일한 통화 선택기를 사용하며 원금, 보유 평가액, 목표·분할 금액을 선택 통화로 통일했습니다.'],
  ['원금 기반 실행표', '목표 비중을 실제 금액과 예상 수량으로 바꾸고 매수·매도 단계를 분리했습니다.'],
  ['진입 시점 안내', 'READY/WAIT를 사용해 현재 충족된 조건과 부족한 조건을 한글로 설명합니다.'],
  ['금·나스닥 독립 메뉴', '기존 주식 발굴 8단계와 분리된 투자 전략 메뉴이며 데스크톱 상단·모바일 전체 메뉴에서 접근합니다.'],
  ['연구 전용 정책', '두 전략 모두 결정론적 규칙 엔진을 사용하며 주문 버튼과 자동매매는 연결하지 않습니다.'],
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
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Product & Strategy Guide</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">MTN 사용 가이드</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          MTN은 미너비니 SEPA·VCP/HTF, 오닐 CAN SLIM, 주도주·모멘텀·쿨라매기 규칙을 결합한 추세 추종 의사결정 시스템입니다.
          기본 주식 투자는 8단계로 운영되며, 금과 나스닥100은 원금·목표 비중·분할 실행을 관리하는 독립 투자 전략 메뉴로 제공합니다.
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

      <div id="investment-strategies" className="scroll-mt-24">
        <Card>
          <SectionHeader
            icon={<Activity className="h-6 w-6 text-amber-300" />}
            title="금·나스닥100 투자 전략 메뉴"
            subtitle="처음 사용할 때는 원금 입력 → 오늘의 판단 → READY 단계 확인 → 분할 실행표 순서로 읽습니다."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              ['1', '통화·원금', 'KRW/USD와 실제 운용 자금'],
              ['2', '상단 결론', '지금 할 일·금지 행동'],
              ['3', '진입 상태', 'READY 또는 WAIT'],
              ['4', '실행표', '금액·수량·조건'],
            ].map(([step, title, description]) => (
              <div key={step} className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-black text-emerald-300">{step}</span>
                <p className="mt-3 text-sm font-bold text-white">{title}</p>
                <p className="mt-1 text-xs text-slate-400">{description}</p>
              </div>
            ))}
          </div>

          <InfoTable rows={strategyMenuRows} />

          <div className="mt-6">
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              상태 표시를 이렇게 읽으세요
            </h3>
            <InfoTable rows={entryStateRows} cols={['화면 상태', '의미와 행동']} />
          </div>

          <div className="mt-6 rounded-lg border border-rose-500/25 bg-rose-500/8 p-4 text-sm leading-6 text-rose-100">
            <strong>공통 원칙:</strong> 화면이 <span className="font-bold text-white">RESEARCH_ONLY</span>이면 투자 판단을 돕는 연구 신호입니다.
            MTN은 주문을 실행하지 않으며, READY도 수익을 보장하거나 매수를 강제하는 뜻이 아닙니다.
          </div>
        </Card>
      </div>

      <div id="gold-strategy" className="scroll-mt-24">
        <Card>
          <SectionHeader
            icon={<Database className="h-6 w-6 text-amber-300" />}
            title="금 투자 메뉴 사용법"
            subtitle="코어 4%와 전술 최대 6%를 분리하고, 선택한 금 상품 자체 가격으로만 진입·손절을 계산합니다."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge text="코어 4%" color="amber" />
            <Badge text="전술 최대 6%" color="sky" />
            <Badge text="전체 최대 10%" color="rose" />
            <Badge text="RESEARCH_ONLY" color="slate" />
          </div>
          <InfoTable rows={goldStrategyRows} cols={['판단 단계', '언제 무엇을 하는가']} />
          <Link
            href="/gold"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300"
          >
            금 투자 메뉴 열기
            <span aria-hidden="true">→</span>
          </Link>
        </Card>
      </div>

      <div id="nasdaq-strategy" className="scroll-mt-24">
        <Card>
          <SectionHeader
            icon={<TrendingUp className="h-6 w-6 text-violet-300" />}
            title="나스닥100 메뉴 사용법"
            subtitle="QQQ 코어와 QLD·TQQQ 전술을 분리하고 월말 추세·200일선·변동성으로 진입 시점을 확인합니다."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge text="QQQ 코어 10%" color="sky" />
            <Badge text="QLD 최대 5%" color="indigo" />
            <Badge text="TQQQ 최대 3.33%" color="rose" />
            <Badge text="RESEARCH_ONLY" color="slate" />
          </div>
          <InfoTable rows={nasdaqStrategyRows} cols={['판단 단계', '언제 무엇을 하는가']} />
          <Link
            href="/nasdaq"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-400"
          >
            나스닥100 메뉴 열기
            <span aria-hidden="true">→</span>
          </Link>
        </Card>
      </div>

      <Card>
        <SectionHeader
          icon={<BookOpen className="h-6 w-6 text-cyan-300" />}
          title="현재 버전에 반영된 주요 업데이트"
          subtitle="기존 8단계 가이드와 신규 투자 전략 기능을 함께 반영했습니다."
        />
        <InfoTable rows={currentUpdateRows} cols={['업데이트', '사용자 관점의 변화']} />
      </Card>

      {/* 2. 시장 분석 */}
      <Card>
        <SectionHeader
          icon={<BarChart2 className="h-6 w-6 text-sky-400" />}
          title="01 · 시장 분석 — 마스터 필터"
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
          단, 신뢰도(Confidence)가 LOW로 고정되며 포지션 진입은 강한 반등 확인 후 점진적으로만 허용합니다.
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
          title="02-A · 미너비니 SEPA 스캐너"
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
          title="02-A · VCP (변동성 수축 패턴)"
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
          title="02-B · 오닐 CAN SLIM 스캐너"
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

      <Card>
        <SectionHeader
          icon={<Activity className="h-6 w-6 text-rose-400" />}
          title="02-C · 스캐너 메뉴와 결과 운용"
          subtitle="스캐너마다 역할은 다르지만 결과 확인·재계산·계획 연결 방식은 동일하게 사용합니다."
        />
        <InfoTable rows={scannerMenuRows} cols={['스캐너', '역할']} />
        <div className="mt-6">
          <h3 className="font-semibold text-white">캐시·실시간 결과 사용 기준</h3>
          <InfoTable rows={scannerOperationRows} />
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-white">Momentum 등급 기준</h3>
          <InfoTable rows={momentumRows} cols={['등급', '판정과 행동']} />
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
          <strong>포지션 크기 공식:</strong> (계산 기준 자본 × 리스크 %) ÷ (진입가 − 손절가) = 매수 가능 주수.
          예) 계산 기준 자본 $50,000, 리스크 1% = $500, 진입가 $100, 손절가 $92(−8%) → 최대 62주 매수 가능.
        </div>
      </Card>

      {/* 9. 콘테스트 */}
      <Card>
        <SectionHeader
          icon={<Trophy className="h-6 w-6 text-emerald-400" />}
          title="03 · 콘테스트 & LLM 비교 분석"
          subtitle="최대 10개 후보를 세션으로 묶어 AI의 도움을 받아 최종 순위를 결정합니다."
        />
        <InfoTable rows={contestRows} />
      </Card>

      {/* 10. 성과 복기 */}
      <Card>
        <SectionHeader
          icon={<BookOpen className="h-6 w-6 text-cyan-400" />}
          title="07 · 성과 복기"
          subtitle="선정 기준의 장기 유효성을 검증합니다. 선택이 옳았는지 데이터로 증명하세요."
        />
        <InfoTable rows={reviewRows} />
        <div className="mt-6">
          <h3 className="font-semibold text-white">3-Layer Review 해석</h3>
          <InfoTable rows={threeLayerReviewRows} />
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-white">Position Lifecycle 해석</h3>
          <InfoTable rows={lifecycleRows} />
        </div>
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
