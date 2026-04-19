# Mantori's Trading Navigator (MTN) 개발 명세서 v4.0

## 1. 프로젝트 개요
본 프로젝트는 마크 미너비니(Mark Minervini)의 SEPA 종목 발굴 필터링과 터틀(Turtles)의 기계적 리스크 관리 철학을 결합한 하이브리드 추세매매 어시스턴트입니다. 감정을 배제한 시스템적 데이터 검증(🤖 시스템)과 철저한 규율 이행(🧑‍💻 만토리)을 통해 수익을 극대화하는 것이 목표입니다.

* **핵심 기능:**
  * **전천후 스캐너:** 미국(NASDAQ 100, S&P 500) 및 한국(KOSPI 100, KOSDAQ 100) 주요 지수의 실시간/지연 데이터를 스캔하여 후보군 자동 압축.
  * **정교한 VCP 엔진:** 수축 패턴, 거래량 건조화, BB Squeeze, Pocket Pivot 등 4개 레이어를 통한 VCP 점수 산출 및 등급 판정.
  * **리스크 자동 산정:** 1% 리스크 룰, 8% 손절 캡, 패턴 무효화 지점(Trough)을 결합한 자동 수량 및 피라미딩 타점 계산.
  * **멀티 데이터 소스:** KIS API(국내), Yahoo Finance(해외 Fallback), SEC EDGAR(미국 재무 데이터) 연동.
  * **텔레그램 연동:** Webhook 기반의 명령어 체계로 실시간 매매 기록 및 상태 확인.

---

## 2. 시스템 아키텍처 (Tech Stack)
* **Frontend:** Next.js 15 (App Router), Tailwind CSS, Lucide Icons, Recharts
* **Backend:** Next.js API Routes (Serverless Functions)
* **Database:** Supabase (PostgreSQL)
* **External APIs:**
  * **한국투자증권(KIS) API:** 국내 주식 가격 및 해외 주식 1순위 데이터.
  * **Yahoo Finance API:** 해외 주식 가격 및 재무 데이터 Fallback.
  * **SEC EDGAR API:** 미국 상장사 공식 재무 데이터(EPS, Revenue 등).
  * **Nasdaq/StockAnalysis/Naver/KRX:** 종목군(Universe) 리스트 수집용.
* **Storage:** 브라우저 LocalStorage (스캐너 스냅샷 보존용).

---

## 3. 데이터베이스 스키마 (`trades` 테이블)
| 컬럼명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `id` | UUID | PK |
| `ticker` | String | 종목 티커 (예: MSFT) |
| `exchange` | String | 거래소 (NAS, NYS, KOSPI, KOSDAQ) |
| `status` | String | 상태 (`PLANNED`, `ACTIVE`, `COMPLETED`, `CANCELLED`) |
| `sepa_evidence` | JSONB | 진입 당시 기술적/기본적 지표 데이터 근거 |
| `vcp_analysis` | JSONB | VCP 점수, 등급, 수축 상세 정보 |
| `planned_risk` | Numeric | 자본의 1%에 해당하는 최대 리스크 금액 |
| `total_shares` | Integer | 계산된 총 매수 수량 |
| `entry_targets` | JSONB | 3분할 피라미딩 타점 및 목표 수량 |
| `trailing_stops` | JSONB | 단계별 익절/손절 상향 가이드 |
| `result_amount` | Numeric | 청산 후 실제 손익 |
| `final_discipline` | Integer | 규율 이행 점수 (0~100) |
| `emotion_note` | Text | 매매 복기 및 회고 |

---

## 4. 고도화된 기능 상세 (v4.0 주요 개선사항)

### [1] 정밀 VCP 분석 엔진 (Engine v2.0)
단순 가격 돌파가 아닌, 변동성 수축의 본질을 정량화합니다.
1. **수축 감지 (35%):** Peak-Trough 쌍을 추적하여 점진적 수축 여부 판정.
2. **거래량 건조화 (25%):** 수축 구간 내 거래량 감소 및 50일 평균 대비 감소율 측정.
3. **BB Squeeze (20%):** 볼린저 밴드 Width가 120일 내 하위 20%인지 분석.
4. **Pocket Pivot (20%):** 기관 매집 시그널인 포켓 피벗 발생 횟수 추적.
* **결과:** Strong(70점↑), Forming(50점↑), Weak(25점↑), None 판정.

### [2] 하이퍼 스캐너 (Universe Scanning)
* **지원 유니버스:** NASDAQ 100, S&P 500, KOSPI 100, KOSDAQ 100.
* **멀티 소스 전략:** KRX 세션 제한 시 KIS 및 Naver 데이터를 교차 검증하여 리스트 확보.
* **스냅샷 기능:** 스캔 결과를 브라우저에 저장하여 페이지 이탈 후에도 유지.

### [3] 리스크 관리 및 피라미딩 (Turtle Logic)
* **손절가 결정:** `max(최종 수축 저점, 진입가 * 0.92(8% 캡))`
* **수량 계산:** `(자본금 * 리스크 %) / (진입가 - 손절가)`
* **피라미딩:** 진입 후 +2%, +4% 시점에서 추가 매수 후보 타점 자동 제시.

---

## 5. 사용자 인터페이스 (UX/UI)
* **Navbar:** 약칭(MTN)과 전체 명칭을 병기하여 전문적인 톤앤매너 유지.
* **대시보드:** 시장(US/KR) 단위로 지표를 분리하여 정확한 성과 추정 (환율 혼선 방지).
* **알고리즘 가이드:** 전략의 근거와 수치를 시각적으로 교육하는 탭 제공.

---

## 6. 향후 과제
* **백테스팅 연동:** 수립된 VCP 로직의 과거 성과 검증 기능.
* **자동 알림:** 텔레그램을 통해 피벗 도달 시 실시간 알림 전송.
* **포트폴리오 비중 최적화:** 현재 보유 종목 간 상관계수 분석 및 리스크 분산.

---

## 7. [설계 명세서] Master Filter 모듈

### 7.1. 모듈 개요 (Overview)
본 모듈은 **Mantori's Trading Navigator(MTN)**의 최상위 의사결정 엔진인 **'Master Filter(마스터 필터)'**의 설계안이다. MTN은 개별 종목 분석 전, 시장의 전체적인 기류(Market Regime)를 분석하여 사용자에게 '항해 가능 여부'를 알려주는 탑다운(Top-down) 리스크 관리 시스템을 지향한다. 5가지 핵심 지표를 통해 시장 국면을 정의하며, 하락장 시 사용자의 뇌동매매를 시스템적으로 차단하는 기능을 포함한다.

### 7.2. 전역 상태 관리 (Global State Management)
마스터 필터의 판별 결과에 따라 시스템 전체의 전역 변수인 `Market_State`를 다음과 같이 정의하고, 모든 하위 스캐닝 모듈은 이 값을 최우선적으로 참조한다.

* **`State: GREEN (BULL)`**: 4~5개 기준 충족. 시장의 순풍 구간. 공격적인 SEPA 전략 가동 및 포지션 확대.
* **`State: YELLOW (NEUTRAL)`**: 2~3개 기준 충족. 안개 구간. 신규 진입 억제 및 기존 포지션의 손절선 상향 조정.
* **`State: RED (BEAR)`**: 0~1개 기준 충족. 폭풍우 구간. 모든 신규 매수 금지 및 현금 비중 극대화.

### 7.3. 마스터 필터 5대 판별 기준 (The 5 Navigator Metrics)
1. **Trend Alignment (이평선 정배열)**: 주요 지수(Nasdaq, S&P500)의 가격이 50일 > 150일 > 200일 이동평균선 위에 위치하며, 200일선이 최소 1개월 이상 상승 곡선을 그려야 함.
2. **Market Breadth (시장 폭)**: 전체 상장 종목 중 50일/200일 이평선 상회 종목 비율이 50%를 넘고 상승 추세여야 하며, 신고가 종목 수가 신저가 종목 수를 압도해야 함.
3. **Liquidity Flow (수급 분석)**: 최근 4주간 거래량이 실린 지수 하락일(Distribution Days)이 4회 이하로 제한되어야 함.
4. **Volatility Regime (VIX 지수)**: VIX 지수가 20 이하의 낮은 레벨에서 안정화되거나, 구조적인 하락(Lower Highs) 패턴을 보여야 함.
5. **Leadership (주도 섹터)**: 시장의 RS(상대강도) 상위 80~90 이상의 종목들이 특정 1~2개 섹터에 집중적으로 포진하여 시장을 견인해야 함.

### 7.4. UI/UX 구성안 (Dashboard Layout)

#### 7.4.1 상단: Navigator Status Center
* **Status Indicator**: 현재 `Market_State`에 따라 대형 신호등 아이콘(Green/Yellow/Red) 점등.
* **Guideline**: 상태별 행동 강령 출력 (예: "현재는 자산 방어가 최우선인 RED 국면입니다").

#### 7.4.2 중단: Metrics Analysis Matrix (2x2 Grid)
* **Grid 1 (Trend)**: 지수 차트 및 주요 이동평균선 시각화.
* **Grid 2 (Breadth)**: 시장 폭 지표의 실시간 퍼센티지 및 히스토리 그래프.
* **Grid 3 (VIX)**: 변동성 지수 게이지 바 (안전/주의/위험 구간 표시).
* **Grid 4 (Leaders)**: 현재 시장을 주도하는 Top 3 섹터 히트맵 및 RS 점수 리스트.

#### 7.4.3 하단: Centaur Insight Log
* AI가 현재 5대 지표를 종합 분석하여 트레이더에게 던지는 전문적인 시장 총평 텍스트 섹션.

### 7.5. 단계별 경고 및 제어 시스템 (Warning System)
사용자가 SEPA 종목 스캐너나 개별 분석 페이지로 진입할 때 `Market_State`에 따라 다음과 같이 UI를 제어한다.

* **[Case: YELLOW - 주의]**
  * **UI 액션**: 페이지 상단에 오렌지색 고정 배너(Sticky Banner) 노출.
  * **메시지**: "⚠️ **주의: 시장의 힘이 분산되고 있습니다.** SEPA 셋업이 발견되더라도 평소 투자 비중의 50% 이하로만 운영하십시오."

* **[Case: RED - 위험/차단]**
  * **UI 액션 1 (Visual Blur)**: SEPA 스캔 결과 리스트 및 상세 차트 영역을 블러(Blur) 처리하여 정보 노출을 제한함.
  * **UI 액션 2 (Modal Intercept)**: 화면 중앙에 강한 레드 톤의 경고 팝업 출력.
  * **메시지**: "🚨 **위험: 현재는 항해가 불가능한 폭풍우 구간입니다.** 마스터 필터가 하락장을 가리키고 있습니다. 지금의 돌파 시도는 80% 이상의 확률로 실패합니다. 신규 매수를 중단하고 현금을 확보하십시오."
  * **제어**: 사용자가 [위험을 인지했으며, 단순 관찰용으로 확인하겠습니다] 버튼을 클릭해야만 블러 처리 해제.

### 7.6. 개발 지시사항 (Action Items for Antigravity)
* `Market_State` 전역 변수 로직을 최상위 App Context에 배치하여 모든 컴포넌트가 실시간 참조하게 할 것.
* RED 상태 시 적용되는 블러(Blur) 효과와 모달 팝업의 인터랙션을 자연스럽고 묵직하게 구현할 것.
* VIX 및 시장 폭 데이터 수집을 위한 API 연동 구조를 설계하고, 시각화를 위한 Chart 라이브러리(예: Recharts, Chart.js 등)를 적용할 것.
* 각 상태(GREEN, YELLOW, RED) 전환에 따른 연동 테스트 코드를 포함할 것.