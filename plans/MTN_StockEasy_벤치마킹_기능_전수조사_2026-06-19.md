# MTN StockEasy 벤치마킹 기능 전수조사

> 기준일: 2026-06-19
> 조사 대상: [StockEasy](https://stockeasy.intellio.kr) 공개 화면, 공개 라우트와 클라이언트 UI 계약, MTN 현재 워크스페이스
> 목적: StockEasy를 복제하는 것이 아니라 MTN의 투자 의사결정 품질과 사용 빈도를 높일 수 있는 기능을 빠짐없이 식별하고 실행 순서를 정한다.

## 1. 결론

StockEasy의 강점은 **매일 열어보게 만드는 시장·종목 정보 표면의 폭**이다. 시장 타임라인, 섹터·테마, RS, 신고가, 리포트, ETF, AI 리서치, 관심종목, 알림, 차트 훈련이 하나의 정보 탐색 경험으로 연결된다.

MTN의 강점은 **투자 판단 이후의 규율과 추적 깊이**다. `시장 판단 → 다중 스캐너 → LLM 검증 → 관심종목 → 매매 계획 → 포트폴리오 리스크 → 체결 → 3-Layer 복기`가 이미 연결되어 있다. 포지션 사이징, 손절 유효성, portfolio heat, 피라미딩, 부분매도, R-multiple, 의사결정 복기는 StockEasy 공개 화면보다 MTN이 더 깊다.

따라서 정답은 StockEasy의 모든 메뉴를 MTN에 그대로 추가하는 것이 아니다.

1. StockEasy의 **탐색·발견·일일 브리핑·종목 정보 허브**를 흡수한다.
2. 이를 MTN의 **리스크 게이트·매매 계획·성과 복기**에 직접 연결한다.
3. 데이터 신선도와 모델 검증이 확보되지 않은 상태에서 화면 수만 늘리지 않는다.

가장 높은 효과를 내는 1차 묶음은 다음 7개다.

| 순위 | 기능 | MTN 적용 형태 | 우선순위 |
|---|---|---|---|
| 1 | 전역 종목 검색 | KR/US 종목·ETF 검색, 최근 검색, 즉시 `종목 360` 이동 | P0 |
| 2 | Market Now | 지수·브레드스·세션 타임라인·오늘 변화 원인을 홈에 통합 | P0 |
| 3 | Sector Leadership | 섹터 RS, 유지일, 대표주, 자금 이동, 포트폴리오 노출 연결 | P0 |
| 4 | 종목 360 허브 | 가격·RS·재무·공시·리포트·뉴스·스캐너 근거·계획 CTA 통합 | P0 |
| 5 | 저장형 스크리너 | 프리셋, 자유 조합, 저장 필터, 오늘 새 진입·이탈 | P0 |
| 6 | 관심종목 Cockpit | 그룹, 사용자 정렬, 변화 배지, 인앱/푸시/텔레그램 알림 | P0 |
| 7 | US → KR 아침 브리핑 | 미국장 주도 테마·위험과 한국 수혜/경계 종목 연결 | P1 |

## 2. 조사 범위와 신뢰도

### 직접 확인

- 홈: 지수, 인기 종목, 장중 타임라인, 테마·업종·특징주, 전략 성과, 신고가
- 한국 시장분석: 시장신호, 테마보드, 원자재, 메모리, 브리핑
- 한국 종목분석: 종합 RS, 52주 신고가, 스크리너, 밸류에이션, 리포트, 종목정보
- ETF: 오늘의 ETF, 검색, 길잡이, 액티브/패시브, 섹터, 레버리지/인버스
- 전략실: 모멘텀, 신고가, 가치 전략의 보유·이탈·성과
- 차트게임: 연습, 일일 챌린지, 커리어, 복기, 통계, 리더보드
- 미국장: 마켓보드, 시장신호, 섹터, 브리핑, 종합 RS, 신고가, 종목정보
- 공통: KR/US 전환, 전역 검색, 관심종목, AI 리서치, 알림, PDF·링크·텔레그램 공유

### 제한

- AI 리서치, 관심종목 변경, 알림 설정 등 계정 기능은 로그인 이후 실제 요청을 실행하지 않았다.
- 로그인 제한 기능은 공개 UI 계약에서 기능명과 상태를 확인했지만, 데이터 정확도와 운영 품질은 검증하지 않았다.
- 수익률 숫자는 제품 기능을 파악하기 위한 관찰값일 뿐 성과 검증 근거로 사용하지 않았다.
- 이 문서는 공개적으로 노출된 제품 패턴을 벤치마킹한다. StockEasy의 코드나 비공개 API 구현을 복제하지 않는다.

## 3. 제품 포지셔닝 비교

| 축 | StockEasy | MTN | 판단 |
|---|---|---|---|
| 첫 화면 | 시장 정보·인기 종목·테마·전략을 폭넓게 요약 | 다음 의사결정과 리스크를 요약 | MTN은 의사결정성이 강하고 정보 폭이 좁다. |
| 시장 분석 | 실시간 타임라인, 브레드스, 섹터·테마·원자재·메모리 | Master Filter, Macro Regime, DD, ETF proxy | StockEasy의 일일 운용 표면을 흡수할 가치가 크다. |
| 종목 발굴 | RS·신고가·범용 스크리너·ETF | 전략별 전문 스캐너 5종과 교차검증 | 엔진 깊이는 MTN 우세, 범용 탐색 UX는 StockEasy 우세다. |
| 종목 리서치 | 재무·공시·리포트·뉴스·사업 정보 허브 | 모달형 차트·펀더멘털과 LLM 투자위원회 | MTN의 가장 큰 제품 공백이다. |
| 투자 실행 | 관심종목과 전략 공개가 중심 | 계획, 손절, 수량, 체결, 포트폴리오 리스크 | MTN의 핵심 우위다. |
| 학습 | 차트 리플레이와 게임화 | 실제 매매 3-Layer 복기 | 양쪽을 결합하면 강한 훈련 루프가 된다. |
| 알림·재방문 | 인앱·푸시·공지·사용량·공유 | Telegram 중심 | MTN은 채널과 개인화가 부족하다. |
| 시장 범위 | KR/US 전용 IA와 미국장 세션 UX | KR/US 공통 흐름과 시장 토글 | MTN은 공통 계약, StockEasy는 시장별 맥락이 강하다. |

## 4. 기능 전수 목록

범례: `보유`는 MTN에 실질 기능이 있음, `부분`은 데이터·컴포넌트 일부가 있음, `신규`는 사용자 기능으로 없음.

### 4.1 플랫폼·탐색·정보구조

| 후보 | StockEasy에서 확인한 동작 | MTN 상태 | MTN 벤치마킹안 | 우선순위 |
|---|---|---|---|---|
| KR/US 즉시 전환 | 헤더에서 시장 전환, 시장별 기본 홈과 메뉴 변경 | 보유 | 기존 `MarketContext`를 유지하되 시장별 홈 콘텐츠를 다르게 구성 | P1 |
| 시장별 IA | 한국은 AI·ETF·전략·게임, 미국은 마켓보드·시장·종목 중심 | 부분 | 같은 엔진을 억지로 대칭화하지 말고 시장별 데이터 가용성에 맞춘 탭 제공 | P1 |
| 전역 종목 검색 | 이름·코드·티커·ETF 검색, `Ctrl/Cmd+K` | 신규 | Navbar command palette, KR/US/ETF 통합 결과 | P0 |
| 최근 검색 | 최근 8개, 전체 삭제, 시장 플래그 | 신규 | 로컬 즉시 저장 후 계정 동기화는 후순위 | P0 |
| 검색 결과 프리패치 | 선택 전 목적지 데이터를 미리 준비 | 신규 | 종목 360 허브의 초기 체감 속도 개선 | P1 |
| 인기 종목 | AI에서 많이 검색·분석한 종목 순위 | 신규 | 내부 조회수 대신 관심등록·스캔·계획 전환을 혼합한 `MTN Attention` 사용 | P2 |
| 통합 사이드 패널 | 관심종목과 최근 AI 채팅을 어디서나 접근 | 신규 | 데스크톱 우측 Cockpit, 모바일 bottom sheet | P1 |
| 설명 툴팁 | 지표의 정의와 해석을 가까이 표시 | 보유 | glossary를 시장·재무·ETF·알림까지 확장 | P1 |
| 공지·업데이트 | 공지 팝업, 오늘/1주일 숨기기 | 신규 | 데이터 장애·모델 버전 변경 공지에 사용 | P2 |
| 사용자 설정 | 테마, 기본 시장, 사용량, 프로필 | 부분 | 기본 시장·알림·표시 항목만 우선 도입 | P2 |
| 피드백 채널 | 버그/제안 버튼 상시 노출 | 신규 | 운영 로그와 현재 URL을 포함한 내부 피드백 폼 | P2 |

### 4.2 홈·Market Now

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 글로벌 마켓 스트립 | KOSPI, KOSDAQ, S&P 500, Nasdaq, Dow, 선물, VIX, 금리, 달러, WTI, 금, BTC, 환율 | 부분 | 현재 MTN 매크로 입력을 읽기 전용 스트립으로 재사용, 원천 시각 표시 | P1 |
| 한국 지수 요약 | KOSPI/KOSDAQ 현재 상태와 장 상태 | 부분 | 시장 신호판 상단에 세션·마지막 체결·전일 대비 표시 | P0 |
| 미국 마켓보드 | 4대 지수, 프리·정규·애프터 상태 | 부분 | 시장별 세션 컴포넌트와 다음 갱신 시각 추가 | P1 |
| 시장 타임라인 | 개장 전·장중·마감·야간 뉴스와 시황 카드 | 신규 | MTN 신호 변화, 주요 지수, DD, 이벤트, 뉴스 요약을 시간순으로 저장 | P0 |
| 타임라인 필터 | 전체·시황·리포트·뉴스·신규상장 | 신규 | `signal`, `data`, `event`, `news`, `portfolio` 필터 | P1 |
| 오늘 시장 결론 | 현재 상태와 한 문장 요약 | 보유 | 기존 의사결정 카드를 변화 원인 3개와 연결 | P0 |
| 권장 노출도 | 시장 상태에 따른 현금·노출 가이드 | 보유 | `portfolio risk gate`의 허용 heat·포지션 수와 동기화 | P0 |
| 인기/주목 종목 | 검색 관심도와 주요 특징주 | 부분 | 스캐너 교차 포착, 관심 변화, 거래대금으로 대체 | P2 |
| 신규상장 피드 | 미국 IPO/신규 상장 종목 | 신규 | 유동성·상장 후 기간 게이트와 함께 제공 | P2 |
| 주요 일정 | 경제지표, 실적, 배당, 중요도, 검색 | 신규 | 매매 계획의 gap-risk gate와 연결 | P1 |
| 장 상태 설명 | 정규장·프리마켓·애프터마켓 안내 | 신규 | 가격 신선도와 주문 가능성 문맥을 명확히 표시 | P1 |

### 4.3 시장신호·브레드스·자금

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 시장 신호등 | 단기·장기 상태를 색상과 문장으로 표시 | 보유 | 상태 변화 이유와 confidence를 함께 표시 | P0 |
| Distribution Day | 활성 DD 개수와 해석 | 보유 | 현재 계산을 거래소 전체 시장 데이터로 고도화 | P0 |
| Rally Day / FTD | 반등 시도 일차, Follow-Through Day | 부분 | Master Filter의 명시적 상태 머신으로 추가 | P1 |
| 이평선 브레드스 | MA20/50/200 아래 종목 비율 | 부분 | ETF proxy를 표준 유니버스 실제 종목 비율로 교체 | P0 |
| 신고가/신저가 | 비율·개수·순증 전환 | 부분 | KR/US 표준 유니버스 히스토리와 함께 제공 | P0 |
| ADR | 상승/하락 종목 수 비율, 20일 지수별 ADR | 부분 | 거래소별 breadth 저장과 regime 입력으로 사용 | P1 |
| 펀드 자금 | 주식형·혼합형·채권형 추이 | 신규 | 데이터 안정성 확보 시 한국 시장 보조 지표로 도입 | P2 |
| 신용잔고 | KOSPI/KOSDAQ 신용과 예탁금 | 신규 | 과열·반대매매 위험 경고로 사용 | P1 |
| 신용/예탁금 비율 | 시장 레버리지 과열 확인 | 신규 | 한국 risk gate의 보조 입력 | P1 |
| 위탁 미수·반대매매 | 변동성 위험 추적 | 신규 | 급락 시 포트폴리오 경보에 연결 | P2 |
| 차트 상호작용 | 확대, 복원, 범례 토글 | 부분 | 공통 시계열 컴포넌트 계약으로 표준화 | P1 |
| 신호 변화 설명 | 오늘 상태와 전일의 차이 | 부분 | `왜 GREEN→YELLOW인가`를 자동 생성 | P0 |

### 4.4 섹터·테마·원자재·메모리

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 섹터 히트맵 | 거래대금·시총 기준 전환 | 부분 | 스캐너 유니버스와 포트폴리오 섹터를 같은 분류로 정규화 | P0 |
| 섹터 RS | 1일·5일·1개월·1/3/6/12개월 강도 | 부분 | `stock_metrics`를 섹터 집계하고 기준 지수 명시 | P0 |
| 추세 유지일 | 20일선 위 유지 기간 | 신규 | 주도 섹터의 지속성과 과열도를 분리 | P1 |
| 섹터 신호 | 매수·관망·매도와 이격률 | 부분 | MTN risk gate는 매수 추천 대신 `우호/중립/역풍` 사용 | P1 |
| 대표 종목 | 섹터 내 대표주와 RS | 부분 | Leader·CANSLIM 상위 종목을 대표주로 연결 | P0 |
| 섹터 자금흐름 | 신고가 비중 변화로 유입·유출 추정 | 신규 | 실제 수급과 가격 breadth를 분리 표시 | P0 |
| 섹터 집중도 | 소수 종목 반복 신고가 vs 폭넓은 참여 | 신규 | leadership quality와 포트폴리오 concentration에 사용 | P1 |
| 테마보드 | 이슈 기반 테마, 대표주, 신고가, 거래대금 | 신규 | 한국만 제공하되 출처·분류 버전·중복 소속 표시 | P1 |
| 1분 자동 갱신 | 장중 테마 특징주 자동 업데이트 | 신규 | 비용을 고려해 3~5분부터 시작, 변화가 있을 때만 갱신 | P2 |
| 원자재 보드 | 제품별 가격, 7/30/90일 변화, 범위 | 신규 | MTN 매크로의 WTI·금·구리·농산물 맥락 패널 | P2 |
| 메모리 현물가격 | DRAM·Flash·Module·GDDR 가격과 월간 지수 | 신규 | 반도체 후보와 한국 시장 overlay에 직접 연결 | P1 |
| 테마→계획 연결 | 테마 대표주를 리서치·관심종목으로 이동 | 부분 | `테마 → 종목 360 → 계획` CTA를 표준화 | P1 |

### 4.5 일일 브리핑과 교차시장 해석

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 미국장 마감 브리핑 | 지수, 신고가/신저가, 주도 섹터, 요약 | 부분 | daily screener와 macro snapshot을 하나의 저장 리포트로 통합 | P1 |
| 강세·경계 테마 | 상승 동력과 과열·역풍을 병렬 제시 | 부분 | LLM이 찬성 논리와 반대 논리를 같은 스키마로 반환 | P1 |
| Watch Board | 강세 관점과 경계 관점 종목 | 부분 | Top 5뿐 아니라 제외 후보와 하향 이유도 저장 | P1 |
| Korea Desk | 미국장 변화가 한국 종목에 미칠 영향 | 신규 | 미국 업종·환율·반도체·금리와 KR 후보의 연결 그래프 | P1 |
| 발행 시각·기준 | 장마감 후 생성, 기준 시각 표시 | 부분 | `observedAt/fetchedAt/calculatedAt/publishedAt` 분리 | P0 |
| 과거 브리핑 | 날짜별 조회와 공유 | 부분 | 판단 당시 리포트와 실제 결과를 복기에서 대조 | P1 |
| 프리·정규·애프터 브리핑 | 세션별 시장 요약 | 신규 | 미국 사용자 수요가 확인된 뒤 단계 도입 | P2 |

### 4.6 종합 RS와 범용 스크리너

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 다기간 RS | 1/3/6/12개월, 시장·섹터 비교 | 보유 | 현재 RS를 한 테이블에서 기간별로 비교 | P0 |
| Sector RS map | 섹터를 약함→강함 축에 배치 | 부분 | 섹터 선택이 종목 목록 필터가 되도록 연결 | P1 |
| MMT | 모멘텀 전환 체크 | 부분 | 기존 surge/momentum 변화율과 계약 통합 | P1 |
| 시총·시장·분류 필터 | 대/중분류, 시총 프리셋 | 부분 | 모든 스캐너 공통 filter bar로 추출 | P0 |
| 즐겨찾기 필터 | 관심종목만 보기 | 보유 | scanner 결과에서 관심종목 상태를 즉시 토글 | P1 |
| 프리셋 스크리너 | 모멘텀 리더, 추세 템플릿, Stage 2, 딥 밸류, GARP, 신고가 근접 등 | 부분 | MTN 5개 엔진을 `프리셋`으로 노출하고 정의·버전을 고정 | P0 |
| 자유 조합 필터 | RS, MMT, 시총, PER/PBR/PSR, ROE, 마진, 부채, 성장, 가격 위치, 거래, 수급 | 부분 | 기존 데이터가 실제 제공되는 필드부터 활성화하고 결측 필드를 숨김 | P0 |
| 저장 필터 | 이름을 붙여 최대 N개 저장 | 신규 | Supabase 계정 저장, URL 공유 가능한 query schema | P0 |
| 오늘의 변화 | 새 추세 진입·이탈, RS 강약, 거래량, 외인·기관 누적매수, 전략 편입·이탈 | 부분 | 전일 snapshot diff를 공통 이벤트로 저장 | P0 |
| 필터 결과 바로 연결 | 관심등록, 종목정보, AI 리서치 | 부분 | `종목 360`, `콘테스트 추가`, `계획` 3개 CTA | P0 |
| 저장 필터 알림 | 조건 진입·이탈 알림 | 신규 | 장마감 배치부터 시작, 장중 알림은 후순위 | P1 |

### 4.7 52주 신고가와 자금 이동

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 신고가 요약 | 종목 수, 평균 상승강도, 주도섹터, ATH 포함 | 부분 | Leader/Surge 결과와 별개로 시장 폭 지표 제공 | P1 |
| 주요 종목 표 | 가격, 등락, 고저, 시총, 거래대금, RS | 부분 | liquidity gate와 함께 제공 | P1 |
| ATH 구분 | 52주 신고가와 상장 이래 최고가 분리 | 신규 | 확장/추격 위험 계산에 사용 | P1 |
| 신고가 추이 | 5/10/20일 평균과 연속 증가 | 부분 | 시장 regime과 leadership breadth에 입력 | P1 |
| 신고가 차트 | 주봉 52주와 시장 지수 비교 | 부분 | 기존 `price-history`와 Lightweight Charts 재사용 | P1 |
| 섹터 유입·유출 | 신고가 비중 전·후반 비교 | 신규 | `Sector Leadership`의 핵심 차트로 통합 | P0 |
| 섹터별 집중도 | 종목 수, 반복성, 중분류 비중 | 신규 | 소수 대형주 착시를 경고 | P1 |
| 과열·추격주의 | 고점 이격과 거래량으로 위험 표시 | 보유 | VCP/pivot distance와 같은 실행 게이트 사용 | P0 |

### 4.8 밸류에이션·리포트·종목 360

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| Forward PER 시계열 | 직전 4분기와 향후 연도 추정 PER 비교 | 부분 | 데이터 출처와 추정치 기준일을 필수 표시 | P1 |
| 산업 내 비교 | 대/중분류 필터와 종목 비교 | 부분 | 동일 섹터 percentile로 정규화 | P1 |
| 기업 리포트 | 증권사, 의견, 목표가, 괴리율, 변동, 제목, 원문 | 신규 | 합법적 데이터 소스가 확보된 시장부터 도입 | P1 |
| 산업 리포트 | 섹터 검색, 핵심 포인트, 성장, 위험, 관련 종목, 시장 전망 | 신규 | LLM 요약은 원문 링크와 발행 시각을 항상 보존 | P1 |
| 목표가 히스토리 | 평균·최소·최대, 증권사별 추이, 상향·하향 | 신규 | 컨센서스 변화 이벤트로 저장 | P1 |
| EPS 전망 추이 | 전망 변경 횟수와 연도별 변화 | 부분 | CANSLIM `C/A` 근거와 연결 | P1 |
| 가격 차트 | 수정주가, 확대·전체화면 | 보유 | 종목 360 공통 차트로 승격 | P0 |
| RS Line | 종가÷시장지수의 일별 추이 | 부분 | RS percentile과 별도 표시해 개념 혼동 방지 | P0 |
| 구성 가능한 요약 | 표시할 재무·RS·섹터 지표 선택·순서 변경 | 신규 | 초기에는 역할별 프리셋, 사용자 커스텀은 P2 | P2 |
| 재무 추이 | 연간·분기, 실적·전망, 매출·영업·순익 | 부분 | fundamental cache와 DART/SEC 데이터를 한 계약으로 통합 | P0 |
| 성장·수익·안정성 | 성장률, 마진, 부채, 유동성, CF 품질, 배당 | 부분 | 점수보다 원자료·추이·결측을 우선 표시 | P0 |
| 공시 타임라인 | DART 정기·주요 공시 | 부분 | 보유 중인 DART provider를 사용자 화면에 연결 | P0 |
| 뉴스 타임라인 | 최신 뉴스 기사 | 신규 | 신뢰 출처, 중복 제거, 종목·테마 태깅 필요 | P1 |
| 사업 정보 | 기업 개요, 제품/서비스, R&D, 위험요인 | 부분 | DART/SEC 문서에서 구조화하고 출처 문단 링크 제공 | P1 |
| 부문별 매출 | 사업부문 매출과 비중 | 신규 | 후보의 성장 동력과 테마 노출을 검증 | P1 |
| 재무 건전성 등급 | 부채·ROE·마진·유동성에 설명형 등급 | 부분 | 블랙박스 종합점수 대신 항목별 근거와 정책 버전 표시 | P1 |
| 리서치 CTA | 관심종목, AI, 계획으로 이동 | 부분 | `종목 360 → 콘테스트/관심/계획`을 모든 표의 공통 계약으로 사용 | P0 |

### 4.9 AI 리서치 워크스페이스

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 종목형 AI 채팅 | 종목을 선택하고 연속 질문 | 부분 | 현재 Contest IB 분석을 종목별 저장 세션으로 일반화 | P1 |
| 일반 질문 모드 | 종목 없이 시장·산업 질문 | 신규 | 근거 없는 범용 챗봇이 되지 않도록 데이터 도구 범위 제한 | P2 |
| 전문가 모드 | 더 깊은 리서치 모드 | 부분 | MTN은 `Quick Review / IB Committee` 2단계로 명명 | P1 |
| 스트리밍 진행 | 기술·재무·문서 분석 상태 표시 | 부분 | 분석 단계와 실패한 데이터 소스를 사용자에게 공개 | P1 |
| 기술적 분석 차트 | 주가·지표·거래량 차트 생성 | 보유 | 기존 scanner drilldown과 AI 설명을 결합 | P1 |
| 추천 질문 | 종목별 후속 질문 제안 | 신규 | `반대 논리`, `실적 리스크`, `무효화 조건`을 기본 질문으로 제공 | P1 |
| 최신 업데이트 | 종목 관련 최근 변화 질문 | 신규 | 뉴스·공시·실적 event store가 먼저 필요 | P1 |
| 세션 히스토리 | 최근 채팅, 새 리서치, 이어서 질문 | 부분 | contest session을 ticker 중심으로 조회 | P1 |
| 보고서 완결성 | 분석 완료 후 최종 문서 이동 | 보유 | 필수 데이터 결측 시 `완료` 대신 `부분 완료` 표시 | P0 |
| PDF | 리서치 세션을 PDF로 출력 | 신규 | 투자위원회 근거 패키지와 통합 | P2 |
| 링크 공유 | 읽기 전용 공유 링크와 만료 | 신규 | 민감한 계좌·포지션 정보는 기본 제외 | P2 |
| Telegram 공유 | 요약과 링크를 전달 | 부분 | 기존 Telegram formatter에 report id와 기준 시각 추가 | P1 |
| 사용량·할당량 | 일일 질문 수와 월간 추이 | 신규 | 비용 통제가 필요할 때만 도입, 제품 가치보다 선행하지 않음 | P3 |

### 4.10 관심종목·알림

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 상시 사이드 패널 | 어느 화면에서나 관심종목 확인 | 신규 | AppShell 우측 panel, 모바일 drawer | P1 |
| 관심 그룹 | 그룹 생성·편집·삭제·종목 다중 소속 | 신규 | 현재 tags와 별도 `watchlist_groups` 관계 테이블 | P0 |
| 사용자 정렬 | drag-and-drop, 이름·등락·RS 정렬 | 부분 | 수동 우선순위와 자동 정렬을 분리 저장 | P1 |
| 변화 컬럼 설정 | 표시 열 선택과 초기화 | 신규 | 데스크톱 테이블에 적용 | P2 |
| AI/종목 바로가기 | 행에서 리서치와 종목 허브 이동 | 부분 | 공통 row action 사용 | P0 |
| 새로고침·기준시각 | 수동 갱신과 로딩 상태 | 부분 | 마지막 성공 시각과 fallback을 종목별 표시 | P0 |
| 신고가 근접 알림 | 52주 고점 3% 이내 | 부분 | 피벗·52주고·손절·목표를 같은 threshold engine으로 통합 | P0 |
| 신고가 돌파 알림 | 기준가 돌파 | 부분 | 중복 방지와 재진입 cooldown 필수 | P0 |
| 가격 급변 알림 | 방향과 등락률 임계값 | 신규 | 사용자 threshold, 장 세션, 거래량 조건 지원 | P1 |
| 주요 공시 알림 | 실적·수주·배당 등 | 신규 | DART/SEC 이벤트 우선순위 분류 필요 | P1 |
| 인앱 알림함 | 읽음·모두 읽음 | 신규 | Telegram 실패와 무관한 내부 event inbox | P1 |
| 브라우저 푸시 | 기기 등록, 테스트, 해제 | 신규 | PWA 수요 확인 후 도입 | P2 |
| 방해금지 | 시간대와 timezone | 신규 | 글로벌 사용자에게 유용 | P2 |
| 채널별 토글 | 알림함과 푸시를 종류별 설정 | 신규 | 인앱·Telegram·push의 공통 preference schema | P1 |

### 4.11 ETF 워크스페이스

ETF는 MTN 핵심 추세주 워크플로우와 인접하지만 전체 복제는 범위가 크다. 먼저 `섹터·자금흐름·보유종목 변화`처럼 기존 후보 발굴을 강화하는 기능을 선택한다.

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| ETF 트렌드보드 | RS Top, 거래 급증, 자금 유입, 신규 상장, 배당, 원자재 | 신규 | 섹터 ETF와 대표 ETF로 범위를 제한해 시작 | P2 |
| 당일·기간 순위 | 등락·거래·자산, 1주~1년·YTD | 신규 | 기존 가격 provider 재사용 가능 | P2 |
| 설정·환매 | 상장좌수 변화와 유입·이탈 | 신규 | 신뢰 가능한 KIND 데이터 파이프라인이 선행 | P2 |
| 신규 편입 종목 | 여러 액티브 ETF의 동시 신규 편입 | 신규 | 기관 관심 프록시로 scanner evidence에 추가 | P1 |
| ETF 검색 | 이름·운용사·자산군·종목코드 | 신규 | 전역 검색에 ETF entity를 먼저 포함 | P2 |
| 편입 종목 역검색 | 특정 주식을 담은 ETF 검색 | 신규 | 종목 360의 `ETF 보유` 섹션으로 시작 | P1 |
| 필터·정렬 | 자산군, 운용방식, 운용사, AUM, 거래, 보수 | 신규 | ETF 전용 페이지 도입 시 구현 | P2 |
| ETF 비교 | 최대 N개 가격·보수·AUM 비교 | 신규 | 같은 지수 ETF 선택 문제에 집중 | P2 |
| 목적형 길잡이 | 분산, 성장, 배당, 신흥국, 원자재, 연금 | 신규 | MTN 정체성과 거리가 있어 P3 | P3 |
| 투자금 What-if | 1년 전 투자 결과, 월 분배 추정 | 신규 | 수익률 가정과 세금 한계를 명시할 때만 도입 | P3 |
| 액티브 구성 변화 | 편입·편출·주식수 증감 임계값 | 신규 | 한국 수급형 후보 발굴에 높은 가치 | P1 |
| 동시 보유 종목 | 여러 액티브 ETF 공통 보유 | 신규 | 기관 컨센서스 프록시로 사용 | P1 |
| 패시브 비교 | 같은 지수의 보수·괴리·추적오차 | 신규 | 별도 ETF 제품 확장 시 도입 | P2 |
| ETF 섹터 RS | 섹터 강도, 포지션 유지, 이격, 대표주 | 부분 | 독립 ETF 페이지보다 Sector Leadership에 흡수 | P0 |
| 레버리지/인버스 | MVP, 기간 수익률, 순위, 위험 경고 | 신규 | MTN 핵심 원칙과 충돌하므로 데이터 참고만, 매수 유도 금지 | P3 |

### 4.12 전략실·모델 포트폴리오

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 전략 카드 | 모멘텀·신고가·가치 전략 설명 | 부분 | 현재 5개 스캐너를 검증된 전략만 모델 포트폴리오로 승격 | P1 |
| 보유·이탈 목록 | 편입일, 보유일, 매수가, 현재/매도가, 수익률 | 부분 | daily screener 결과를 paper portfolio lifecycle로 저장 | P1 |
| 오늘 편입·이탈 | 장마감 업데이트 | 부분 | snapshot diff와 알림을 재사용 | P1 |
| 누적 성과 차트 | 전략별 누적 수익률 | 부분 | 단순 합산 금지, TWR·벤치마크·비용·MDD를 함께 표시 | P0 전제 |
| 전체 매매 내역 | 전략별 거래 기록 | 보유 | 실제 사용자 거래와 모델 거래를 명확히 분리 | P1 |
| 전략 가이드 | 규칙, 업데이트 주기, 한계 | 부분 | 엔진 버전·편입/이탈 규칙·capacity까지 문서화 | P1 |
| 전략 비교 | 수익, MDD, hit rate, turnover, regime 성과 | 신규 | Model Validation Lab의 사용자 표면 | P1 |

### 4.13 차트 리플레이·훈련

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 블라인드 차트 리플레이 | 과거 종목을 숨기고 하루씩 공개 | 신규 | `Replay Lab`으로 도입 | P2 |
| 연습 모드 | 랜덤 일봉, 기록 초기화 | 신규 | 실제 자금과 분리된 훈련 계정 | P2 |
| 일일 챌린지 | 매일 새 종목, 제한된 도전 | 신규 | 과매매 유발 순위보다 1일 1복기 과제로 변형 | P3 |
| 커리어 모드 | 가상 자산과 티어 | 신규 | MTN에는 불필요, 교육용 별도 모듈일 때만 고려 | P3 |
| 분할 매수·매도 | 10~100%와 직접 입력 | 보유 | 실제 `position lifecycle`을 리플레이 엔진에 재사용 | P2 |
| R:R 자동 주문 | 손절%, 보상비, 자동 손절·익절선 | 보유 | 계획 페이지의 risk policy를 훈련에 사용 | P2 |
| 턴 기반 진행 | 매수·홀드·매도, 단축키 | 신규 | 빠른 반복 학습에 유용 | P2 |
| 게임 결과 | 수익, 점수, 승률, 평균, 최대 손실 | 부분 | 수익보다 R, 규율, 계획 위반을 더 크게 채점 | P2 |
| 매매 내역 | 체결, 수량, 수수료, 실현손익 | 보유 | 기존 trade execution 계약 재사용 | P2 |
| 차트 복기 | 게임 구간과 이후 실제 차트 비교 | 신규 | hindsight gap과 대안 행동을 표시 | P1 |
| 종목 리서치 연결 | 결과에서 실제 종목 정보·AI 이동 | 부분 | Replay → 3-Layer review 연결 | P2 |
| 통계·전적 | 승률, 손익비, 연승·연패, TPI | 부분 | 실제 복기 통계와 훈련 통계를 분리 | P2 |
| 리더보드·공유 | 일·주·월 순위와 결과 링크 | 신규 | 금융 행동을 왜곡할 위험이 커 P3 | P3 |

### 4.14 공유·운영·재방문

| 후보 | 확인한 동작 | MTN 상태 | MTN 적용안 | 우선순위 |
|---|---|---|---|---|
| 리서치 PDF | AI 결과 문서화 | 신규 | 후보 데이터·모델 버전·기준시각·리스크를 포함한 IC 패키지 | P1 |
| 읽기 전용 링크 | 세션 공유와 만료 | 신규 | 계좌 정보 제거, expiry와 revoke 지원 | P2 |
| Telegram 공유 | 요약+링크 | 보유 | 사용자별 채널·전송 결과·재시도 추가 | P1 |
| 차트·히트맵 이미지 | JPG 저장과 링크 복사 | 신규 | 투자위원회·메신저 공유에 유용 | P2 |
| 데이터 갱신 상태 | 로딩, 예정, 마지막·다음 갱신 | 부분 | 모든 투자 지표의 공통 FreshnessBadge 계약 | P0 |
| 오류 복구 | 빈 상태, 재시도, 부분 데이터 | 부분 | provider별 실패를 숨기지 않고 부분 성공 표시 | P0 |
| 데이터 운영 콘솔 | 캐시·동기화·테스트 | 보유 | 투자 화면의 데이터와 admin 상태를 직접 대사 | P0 |

## 5. MTN이 이미 더 잘하는 영역

StockEasy를 벤치마킹하면서 다음 MTN 기능을 약화시키면 안 된다.

1. **시장 상태를 실제 허용 위험으로 변환**: 단순 신호등이 아니라 risk policy와 신규 진입 차단으로 연결된다.
2. **전략별 전문 엔진**: SEPA/VCP, CAN SLIM, Leader, Momentum, Qullamaggie가 독립 계산과 drilldown을 가진다.
3. **다단계 후보 검증**: 정량 결과, 교차 스캐너, LLM·IB 검토, 사용자 판단을 분리한다.
4. **포지션 사이징**: 총자산, 손절폭, 거래당 위험으로 수량을 계산한다.
5. **포트폴리오 리스크**: 현금, 오픈 리스크, heat, 섹터 노출, 포지션 수, what-if를 제공한다.
6. **실행 라이프사이클**: 계획, 체결, 피라미딩, 부분매도, 손절 변경, exit rule을 기록한다.
7. **3-Layer 복기**: 진입 근거, LLM 판단, 실제 결과와 규율을 한 거래 단위로 대조한다.
8. **자동화 후보 선별**: 일일 멀티 스크리너와 LLM 재평가, Telegram 발송이 존재한다.
9. **데이터 소스 다중화**: KIS, Yahoo, DART, SEC, FRED, Toss와 캐시·fallback 기반이 있다.

벤치마킹 기능은 이 흐름에 붙어야 한다. 독립된 정보 페이지를 늘리고 끝내면 MTN의 장점이 사라진다.

## 6. 우선순위 산정

### 기준

- 전략 적합성: MTN의 `판단 → 실행 → 복기`를 강화하는가
- 사용 빈도: 매일 또는 거래 전후 반복 사용하는가
- 기존 자산 재사용: 현재 데이터·엔진·DB를 얼마나 활용할 수 있는가
- 의사결정 개선: 오판·누락·탐색 시간을 실제로 줄이는가
- 데이터 위험: 신뢰 가능한 원천과 point-in-time 저장이 가능한가
- 구현 비용: 신규 provider, 대형 UI, 운영 부담이 얼마나 큰가

### P0: 지금 MTN에 바로 필요한 것

| Epic | 핵심 기능 | 기존 재사용 | 완료 기준 |
|---|---|---|---|
| E0 Trust Layer | 원천 시각, stale, fallback, partial 상태 | `lib/data/freshness`, admin health | 모든 핵심 숫자에 source/observed/calculated/stale 표시 |
| E1 Global Search | KR/US/ETF 검색, 최근 검색, command palette | `security-lookup`, scanner universe | 2키 이내 검색, 종목 360 이동, 키보드 지원 |
| E2 Market Now | 지수, 세션, 신호 변화, 타임라인 | macro/master-filter/snapshot | 오늘 변화 원인 3개, 상태·허용위험 일치 |
| E3 Sector Leadership | RS, breadth, 유지, 유입·유출, 대표주 | stock_metrics, leader, market snapshots | KR/US 섹터 공통 계약, 종목과 포트폴리오 연결 |
| E4 Stock 360 | 차트, RS line, 재무, 공시, scanner evidence | price-history, DART/SEC, cache | 한 화면에서 관심·콘테스트·계획까지 이동 |
| E5 Screener Workspace | 공통 필터, 프리셋, 저장, 오늘 변화 | 5 scanner engines | URL 재현 가능, 필터 버전 저장, diff 알림 준비 |
| E6 Watchlist Cockpit | 그룹, 정렬, 변화, 기준시각, 임계값 | watchlist API, check-alerts | 그룹·threshold CRUD와 중복 없는 이벤트 생성 |

### P1: 리서치 깊이와 반복 사용을 만드는 것

| Epic | 핵심 기능 | 선행 조건 |
|---|---|---|
| E7 Daily Brief | US 마감, KR 대응, 강세·경계, 과거 결과 | E0, E2, E3 |
| E8 Events & Reports | 실적·경제·배당, DART/SEC, 리포트·목표가 | 합법적 데이터 공급자, event schema |
| E9 AI Research Workspace | ticker session, 추천 질문, 반대 논리, 부분 완료 | E4, E8 |
| E10 Notification Center | 인앱 inbox, Telegram preference, DND | E6 event engine |
| E11 Model Portfolio | 전략 보유·이탈, 비용 후 성과, benchmark | Model Validation Lab |
| E12 ETF Signal Slice | ETF 편입 변화, 섹터 RS, 종목 역검색 | ETF 구성 데이터 |
| E13 Replay Review | 블라인드 리플레이, R:R, 이후 차트, 3-Layer 복기 | price history, position lifecycle |

### P2/P3: 수요 검증 후 도입

- ETF 목적형 길잡이와 전체 ETF 제품군
- 브라우저 푸시, 공개 공유 링크, 이미지 공유
- 일반 시장 챗봇, 사용량·구독 UI
- 차트게임 커리어, 재화, 티어, 리더보드
- 인기 검색 순위와 소셜 경쟁 기능

## 7. 권고 정보구조

현재 8단계 라이프사이클은 유지한다. 새 최상위 메뉴를 계속 늘리지 말고 기존 단계 안에 기능을 배치한다.

| 현재 단계 | 보강할 기능 |
|---|---|
| 오늘 | Market Now, 글로벌 스트립, 타임라인, Daily Brief, 알림 큐 |
| 시장 분석 | Breadth, Sector Leadership, 테마, 원자재·메모리 |
| 종목 발굴 | 공통 스크리너, 저장 필터, 오늘 변화, 52주 신고가 |
| 콘테스트 | AI Research session, 반대 논리, 보고서 패키지 |
| 관심종목 | 그룹·정렬·이벤트·공시·실적 캘린더 |
| 매매 계획 | 종목 360 근거, 이벤트 위험, 알림 threshold |
| 포트폴리오 | 섹터 flow와 내 노출 비교, 이벤트·상관 경보 |
| 성과 복기 | 모델 신호 당시 snapshot, Replay Lab, attribution |

전역 검색은 단계 밖 공통 진입점으로 둔다. `종목 360`은 별도 최상위 메뉴가 아니라 검색·표·알림 어디서든 열리는 공통 상세 화면으로 둔다.

## 8. 기존 MTN 자산 재사용 맵

| MTN 자산 | 재사용 대상 |
|---|---|
| `contexts/MarketContext.tsx` | KR/US 전환, 시장별 홈 |
| `components/layout/navigation.ts` | 새 기능의 기존 단계 배치 |
| `app/api/master-filter`, `lib/master-filter` | Market Now, breadth, 신호 변화 |
| `app/api/macro`, `lib/macro`, FRED | 글로벌 스트립, Daily Brief |
| `stock_metrics`, RS batch | 종합 RS, sector RS, 오늘 변화 |
| 5개 scanner engine | 프리셋 스크리너와 model portfolio |
| `security-lookup` | 전역 검색과 entity resolver |
| `price-history`, Lightweight Charts | 종목 360, 신고가 차트, Replay Lab |
| DART·SEC providers와 fundamental cache | 재무·공시·사업 정보 |
| contest sessions·IB prompt | AI Research Workspace, IC PDF |
| daily screeners | Daily Brief, model portfolio 후보 |
| watchlist API | 그룹·알림 Cockpit 기반 |
| `check-alerts` cron | 공통 threshold/event engine 시작점 |
| trade execution·exit rules·stop events | Replay Lab과 결과 복기 |
| portfolio risk·what-if | 섹터 flow와 보유 노출 비교 |
| history·review stats | 모델 성과와 훈련 성과 비교 |
| Telegram formatter | 알림 채널과 리포트 공유 |
| admin data health | Trust Layer 운영 콘솔 |

## 9. 새 데이터 계약

### 9.1 시장 이벤트

```ts
type MarketEvent = {
  id: string;
  market: 'KR' | 'US';
  occurredAt: string;
  observedAt: string;
  category: 'SIGNAL' | 'BREADTH' | 'SECTOR' | 'THEME' | 'EVENT' | 'NEWS' | 'PORTFOLIO';
  severity: 'INFO' | 'WATCH' | 'RISK';
  title: string;
  summary: string;
  symbols: string[];
  source: string;
  sourceUrl?: string;
  payload: Record<string, unknown>;
};
```

### 9.2 관찰 가능 데이터

```ts
type ObservableValue<T> = {
  value: T | null;
  source: string;
  observedAt: string | null;
  fetchedAt: string;
  calculatedAt?: string;
  expectedDelay?: string;
  isStale: boolean;
  fallbackReason?: string;
  quality: 'PRIMARY' | 'FALLBACK' | 'PARTIAL' | 'UNAVAILABLE';
};
```

### 9.3 저장 스크리너

```ts
type SavedScreen = {
  id: string;
  name: string;
  market: 'KR' | 'US';
  engineVersion: string;
  filters: Record<string, number | string | boolean | string[]>;
  sort: { key: string; direction: 'asc' | 'desc' };
  alertOnEnter: boolean;
  alertOnExit: boolean;
};
```

### 9.4 사용자 알림

```ts
type AlertRule = {
  id: string;
  scope: 'SYMBOL' | 'WATCHLIST_GROUP' | 'SAVED_SCREEN' | 'PORTFOLIO';
  scopeId: string;
  eventType: 'PIVOT_NEAR' | 'STOP_NEAR' | 'HIGH52_NEAR' | 'BREAKOUT' | 'PRICE_MOVE' | 'FILING' | 'SCREEN_ENTER' | 'SCREEN_EXIT';
  params: Record<string, number | string | boolean>;
  channels: Array<'IN_APP' | 'TELEGRAM' | 'PUSH'>;
  cooldownMinutes: number;
  enabled: boolean;
};
```

## 10. 구현 로드맵

### Wave 0: 신뢰성 선행조건, 0~2주

- 매크로·브레드스 P0 정확성 이슈를 먼저 닫는다.
- `ObservableValue`와 `FreshnessBadge`를 공통 계약으로 만든다.
- 종목·섹터·시장 코드와 기준 지수를 정규화한다.
- 이벤트와 snapshot의 point-in-time 보존 정책을 확정한다.

Checkpoint: stale 데이터가 최신처럼 보이지 않고, KR/US 상태가 같은 원천 시각 규칙을 사용한다.

### Wave 1: 일일 사용 표면, 2~6주

- 전역 검색과 종목 360 shell
- Market Now와 신호 변화 타임라인
- Sector Leadership v1
- 관심종목 그룹·정렬·공통 threshold
- 공통 스캐너 필터와 저장 필터

Checkpoint: 사용자가 홈에서 후보를 발견하고 3회 이하 이동으로 계획 화면에 도달한다.

### Wave 2: 리서치 깊이, 6~12주

- 재무·공시·RS Line·scanner evidence를 종목 360에 통합
- 실적·경제·배당 이벤트 캘린더
- US 마감 → KR 대응 Daily Brief
- 인앱 알림함과 Telegram preference
- AI Research session과 보고서 패키지

Checkpoint: 후보별 근거, 반대 논리, 데이터 시각, 이벤트 위험이 한 화면에서 재현된다.

### Wave 3: 검증된 확장, 12~20주

- 비용·슬리피지·benchmark를 반영한 model portfolio
- ETF 구성 변화와 종목 역검색
- Replay Lab과 3-Layer review 연결
- 읽기 전용 공유와 PDF

Checkpoint: 신규 기능이 후보의 계획 전환, 경보 적중률, 복기 완성률을 개선했다는 사용 데이터가 확인된다.

## 11. 복제하면 안 되는 요소

### 단순 누적 수익률

StockEasy 전략실은 공개 화면에서 단순 누적 수익률임을 명시한다. MTN은 이를 그대로 따라가면 안 된다. 모델 성과는 TWR, benchmark excess return, MDD, turnover, 거래비용, capacity, regime별 성과를 함께 제공해야 한다.

### 레버리지 상품의 과도한 게임화

레버리지/인버스 MVP, 고배수 배지, 수익률 순위는 탐색성은 좋지만 MTN의 위험 관리 정체성과 충돌한다. 정보는 제공할 수 있어도 진입 유도형 카피와 보상 구조는 제외한다.

### 과매매를 보상하는 게임

도전 횟수, 티어, 재화, 리더보드는 반복 사용을 만들지만 거래 빈도를 성공으로 오인하게 할 수 있다. MTN Replay Lab은 수익보다 계획 준수, R:R, 최대 역행, 손절 일관성, 대안 행동을 점수화해야 한다.

### 데이터 출처 없는 종합점수

RS, 신호등, 건전성 등급을 도입하더라도 원자료·기준 유니버스·기준일·결측·버전을 숨기지 않는다.

### 로그인 장벽의 과도한 적용

공개 정보 탐색과 검색까지 로그인 모달로 막으면 제품 가치를 경험하기 어렵다. MTN은 계정 변경·외부 전송·민감 데이터에만 인증을 요구하고 공개 데모 데이터는 읽기 전용으로 허용하는 편이 낫다.

### 메뉴 수의 그대로 복제

StockEasy의 폭넓은 메뉴는 정보 서비스에는 적합하지만 MTN의 단계형 의사결정 흐름을 분산시킬 수 있다. 기능은 기존 8단계와 종목 360에 흡수한다.

## 12. KPI

| 목표 | KPI |
|---|---|
| 탐색 효율 | 종목 검색→360 진입 시간, 후보→계획 클릭 수, 페이지 이탈률 |
| 시장 이해 | 신호 변화 설명 열람률, Daily Brief 완독률, 섹터 카드→종목 전환률 |
| 후보 품질 | 저장 필터 진입 후 계획 전환율, 교차 스캐너 후보의 사후 기대값 |
| 데이터 신뢰 | stale 노출률, fallback 사용률, 원천-화면 대사 실패율 |
| 알림 품질 | 중복률, 실제 조치율, 오탐률, 알림 후 계획·손절 변경률 |
| 리서치 품질 | 부분 완료율, 출처 누락률, 반대 논리 확인률, IC 보고서 재사용률 |
| 규율 | 사전 계획 작성률, 손절 위반률, 포트폴리오 heat 초과 시간 |
| 학습 | 복기 완료율, 동일 실수 태그 재발률, Replay와 실제 매매의 규율 점수 변화 |

## 13. 확인한 공개 경로

| 영역 | 공개 경로 |
|---|---|
| 홈 | [stockeasy.intellio.kr](https://stockeasy.intellio.kr/) |
| AI 리서치 | [AI](https://stockeasy.intellio.kr/ai) |
| 한국 시장신호 | [시장신호](https://stockeasy.intellio.kr/market-analysis?tab=overview) |
| 테마보드 | [테마보드](https://stockeasy.intellio.kr/market-analysis?tab=themeBoard) |
| 원자재 | [원자재](https://stockeasy.intellio.kr/market-analysis?tab=commodity) |
| 메모리 | [메모리](https://stockeasy.intellio.kr/market-analysis?tab=memory-prices) |
| 시장 브리핑 | [브리핑](https://stockeasy.intellio.kr/market-analysis?tab=briefing) |
| 종합 RS | [종합 RS](https://stockeasy.intellio.kr/stock-analysis?tab=integrated_rs) |
| 52주 신고가 | [52주 신고가](https://stockeasy.intellio.kr/stock-analysis?tab=high52) |
| 범용 스크리너 | [스크리너](https://stockeasy.intellio.kr/stock-analysis?tab=screener) |
| 밸류에이션 | [밸류에이션](https://stockeasy.intellio.kr/stock-analysis?tab=valuation) |
| 리포트 | [리포트](https://stockeasy.intellio.kr/stock-analysis?tab=report_summary) |
| ETF 홈 | [오늘의 ETF](https://stockeasy.intellio.kr/etf) |
| ETF 검색·길잡이 | [검색](https://stockeasy.intellio.kr/etf/search), [길잡이](https://stockeasy.intellio.kr/etf/curation) |
| ETF 분석 | [액티브/패시브](https://stockeasy.intellio.kr/etf/analysis/active), [섹터](https://stockeasy.intellio.kr/etf/sector), [레버리지/인버스](https://stockeasy.intellio.kr/etf/leverage) |
| 전략실 | [전략실](https://stockeasy.intellio.kr/strategy-room) |
| 차트 훈련 | [차트게임](https://stockeasy.intellio.kr/chart-game) |
| 미국 마켓보드 | [US](https://stockeasy.intellio.kr/us) |
| 미국 시장분석 | [시장신호](https://stockeasy.intellio.kr/us/market-signal), [섹터](https://stockeasy.intellio.kr/us/sectors), [브리핑](https://stockeasy.intellio.kr/us/briefing) |
| 미국 종목분석 | [종합 RS](https://stockeasy.intellio.kr/us/rs), [52주 신고가](https://stockeasy.intellio.kr/us/new-high), [종목정보](https://stockeasy.intellio.kr/us/stock-info) |

일부 경로는 로그인 후 상세 상호작용이 가능하다. 위 링크는 기능 존재와 공개 화면 구조를 확인하기 위한 근거다.

## 14. 최종 권고

MTN의 다음 경쟁력은 스캐너를 하나 더 만드는 데 있지 않다. 이미 후보 선정 엔진은 충분히 많다. StockEasy에서 가장 먼저 가져와야 할 것은 **시장과 종목의 맥락을 빠르게 탐색하는 방법**이다.

권고 순서는 다음과 같다.

1. 데이터 신뢰 계약을 먼저 고정한다.
2. 전역 검색, Market Now, Sector Leadership, 종목 360을 만든다.
3. 저장 스크리너와 관심종목 이벤트를 연결한다.
4. Daily Brief, 리포트·이벤트, AI 리서치를 붙인다.
5. 모델 포트폴리오와 Replay Lab은 검증 인프라가 갖춰진 뒤 추가한다.

이 순서라면 StockEasy의 넓은 정보 탐색 능력과 MTN의 깊은 실행·리스크·복기 능력을 결합할 수 있다. 결과물은 또 하나의 주식 포털이 아니라, **정보를 계획과 규율로 변환하는 투자 운영체계**가 된다.
