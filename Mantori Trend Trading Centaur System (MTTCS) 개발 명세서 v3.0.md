# Mantori Trend Trading Centaur System (MTTCS) 개발 명세서 v3.0

## 1. 프로젝트 개요
본 프로젝트는 마크 미너비니(Mark Minervini)의 SEPA 종목 발굴 필터링과 전설적인 추세매매 그룹 '터틀(Turtles)'의 기계적 리스크 및 포지션 관리 철학을 결합한 하이브리드 반자동화 추세매매 어시스턴트입니다. 감정을 배제한 시스템적 데이터 검증(🤖 시스템)과 철저한 규율 이행(🧑‍💻 만토리)을 통해 수익을 극대화하는 것이 목표입니다.

* **핵심 기능:** 미너비니 트렌드 템플릿(SEPA) 기반의 엄격한 종목 필터링(근거 데이터 제시), 1% 리스크 룰에 기반한 3분할 피라미딩 타점 계산, 진입 전 6단계 체크리스트(Centaur Model), 텔레그램 봇 간편 기록, 성과 대시보드.
* **비용 조건:** 100% 무료 티어(Free Tier) 환경에서 구동되도록 서버리스 아키텍처 채택.

## 2. 시스템 아키텍처 (Tech Stack)
* **Frontend Layer:** Vercel + Next.js 14 (App Router) + Tailwind CSS + Recharts + Lucide Icons
* **Input Layer 1 (계획 수립):** Vercel Web App (비동기 API 기반 SEPA 스크리너, 리스크 계산기 및 체크리스트 UI)
* **Input Layer 2 (결과 기록):** Telegram Bot (청산 후 손익 및 최종 규율 점수 로깅용 Webhook)
* **Backend Layer (API & Functions):** Next.js API Routes (Telegram Webhook 처리, 한국투자증권 API 우선 호출 및 Yahoo Finance API Fallback 에러 핸들링 로직 포함)
* **Database Layer:** Supabase (PostgreSQL)

## 3. 데이터베이스 스키마 설계 (Supabase)
테이블명: `trades`
* SEPA 필터링 시점의 실제 데이터를 증거로 남기기 위해 `sepa_evidence` 컬럼이 추가되었습니다.

| Column Name | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key (Default: uuid_generate_v4()) |
| `created_at` | Timestamp | 기록 일시 (Default: NOW()) |
| `ticker` | String | 종목명 (예: AAPL) |
| `status` | String | 상태 (`PLANNED` = 진입 전 계획, `COMPLETED` = 매매 종료) |
| `chk_sepa` | Boolean | [시스템 승인] SEPA 트렌드 템플릿 및 기본적 분석 통과 확인 |
| `chk_risk` | Boolean | [확인] 리스크 산정 동의 |
| `chk_entry` | Boolean | [서약] 진입 규율 동의 |
| `chk_stoploss` | Boolean | [서약] 손절매 동의 |
| `chk_exit` | Boolean | [서약] 청산 규율 동의 |
| `chk_psychology`| Boolean | [자가진단] 심리 통제 상태 |
| `sepa_evidence`| JSONB | 진입 당시 SEPA 근거 데이터 (예: `{'ma50': 150, 'eps_growth': 25.5, 'is_pass': true}`) |
| `planned_risk` | Numeric | 사전에 계산된 진입 시 최대 손실 예정 금액 (자본의 1%) |
| `total_shares` | Integer | 최대 진입 가능 총 수량 |
| `entry_targets` | JSONB | 3분할 진입 목표가 및 수량 (예: `{"e1": {"p": 150, "s": 10}, ...}`) |
| `trailing_stops`| JSONB | 3분할 단계별 통합 손절가 (예: `{"sl1": 140, "sl2": 145, ...}`) |
| `result_amount` | Numeric | 청산 후 실제 손익 금액 (진입 전에는 Null) |
| `final_discipline`| Integer | 청산 후 스스로 평가한 최종 규율 이행 점수 (0~100) |
| `emotion_note` | Text | 청산 후 리뷰 및 메모 |

## 4. 사용자 시나리오 및 기능 요건 (Centaur Model)

### Phase 1: 진입 전 계획 (Web App - 'New Trade Plan' Tab)
사용자가 웹 대시보드에서 매매 계획을 수립합니다.

**Step 1: 종목 및 기본 정보 입력 (🧑‍💻 수동)**
* 사용자가 검색창에 **종목명(Ticker)**과 계좌의 **총 자본금(Total Equity)**을 입력합니다.

**Step 2: 시스템 자동 분석 - SEPA 스크리닝 & 리스크 산출 (🤖 시스템 자동화 - 비동기 API)**
* 티커 입력 완료 시, 2026년 최신 금융 데이터를 가져오기 위해 **한국투자증권 API**를 우선적으로 호출합니다. 한국투자증권 API에서 데이터를 제공하지 않는 종목이거나 호출에 실패할 경우, **Yahoo Finance API**를 후순위(Fallback)로 사용하여 데이터를 수집합니다.
* 수집된 데이터를 바탕으로 아래의 미너비니 SEPA 기준 통과 여부를 검증하고 **반드시 명확한 데이터와 근거 수치를 UI에 표시**합니다. (단 하나라도 미달 시 'Fail' 처리)

  **[1] SEPA 기술적 기준 (트렌드 템플릿 8원칙):**
  1. 현재 주가 > 50일 이평선
  2. 현재 주가 > 150일 이평선
  3. 현재 주가 > 200일 이평선
  4. 50일 이평선 > 150일 이평선
  5. 150일 이평선 > 200일 이평선
  6. 200일 이평선이 최소 1개월 이상 상승 추세
  7. 현재 주가가 52주 최고가 대비 25% 이내 근접
  8. 상대강도(RS) 최소 70 이상

  **[2] SEPA 기본적 기준 & 추가 필터:**
  * 분기 EPS 성장률 (최소 20% 이상), 매출 성장률 (최소 15% 이상)
  * 마진율 확장세, ROE (17% 이상), 부채 비율 (40% 이하)
  * 기관 소유 비중 (30~70%) 및 거래대금/가격(일 40만 주 이상, $20 이상)

  **[3] 리스크 산정 & 3분할 피라미딩 (터틀 트레이딩 모델):**
  * **ATR 산출:** 최근 20일간의 TR 평균.
  * **포지션 사이즈:** 총 자본금 1% 룰 적용 `(자본금 * 0.01) / (2 * ATR)` = 최대 매수 수량.
  * **3분할 및 트레일링 스탑:** 1차(돌파가), 2차(+0.5 ATR), 3차(+1.0 ATR) 목표가 산출 및 단계별 손절가 동적 상향(-2 ATR).

**Step 3: 6단계 체크리스트 수행 및 서약 (🧑‍💻 수동 및 🤖 시스템 통제)**
* **[시스템 통제 블락]:** Step 2의 SEPA 검증에서 1개 이상의 기준이 미달(Fail)하면, 1번 체크 항목이 하드 블락(Hard Block)되어 시스템적으로 매매 계획 저장이 불가능합니다. 감정적 매매를 철저히 차단합니다.
* SEPA 승인(Pass) 시, 리스크 확인 및 규율 서약을 모두 체크해야만 **[계획 저장]** 버튼이 활성화됩니다.

### Phase 2: 청산 후 결과 기록 (Telegram Bot)
1. 사용자가 매매 종료 후 텔레그램 봇으로 `/close [종목명] / [실제손익금액] / [최종규율점수] / [메모]` 전송.
2. **Webhook 파싱 및 응답 로직:** Vercel API가 메시지 수신 후 파싱. 포맷 오류나 진행 중인(PLANNED) 계획이 없을 경우 사용자에게 오류 메시지를 회신하고, 정상 처리 시 상태를 `COMPLETED`로 변경 후 '기록 완료' 피드백을 전송.

### Phase 3: 성과 분석 및 가이드 대시보드 (Web App)
1. **성과 대시보드:** 누적 수익률 차트, 누적 승률, 평균 규율 점수, 규율별 수익 상관관계 차트, 매매 일지.
2. **트레이딩 가이드 탭:** 미너비니 SEPA 트렌드 템플릿의 각 지표의 의미, 터틀의 ATR 및 1% 리스크 룰, 피라미딩 원리를 교육하는 안내 페이지 제공.

## 5. Antigravity 작업 지시 사항 (Action Items for AI)
1. Next.js 14 기반 프로젝트(Tailwind CSS, Recharts, Lucide Icons 포함)를 셋업해 주세요.
2. **[Database]** Supabase에 연결하여 위 명세된 `trades` 테이블 스키마 생성 SQL을 작성해 주세요. (특히 `sepa_evidence`, `entry_targets`, `trailing_stops` JSONB 컬럼 필수 포함)
3. **[Backend/API]** * `/api/finance?ticker={ticker}`: **한국투자증권 API**를 1순위로 호출하고, 응답 지연/오류/미지원 티커 발생 시 **Yahoo Finance API**를 2순위(Fallback)로 호출합니다. 수집된 데이터를 바탕으로 SEPA 트렌드 템플릿(이평선, 52주 고점, RS)과 기본적 지표(EPS, ROE 등)의 실제 수치를 계산하여 반환하고, Pass/Fail 여부를 명확한 데이터 근거와 함께 응답하는 비동기 API를 구성하세요.
   * `/api/telegram-webhook`: 텔레그램 메시지 파싱 웹훅 API.
4. **[Frontend]** * UI 메인 대시보드에서 '새 매매 계획' 화면 구현.
   * 티커 입력 시 API를 호출하여 **"SEPA 분석 결과 대시보드 (데이터 근거 포함)"**와 **"3분할 피라미딩 리스크 테이블"**을 시각적으로 명확하게 렌더링.
   * SEPA Fail 시 체크리스트 1번 항목을 시각적(붉은색) & 기능적으로 블락 처리하는 로직을 반드시 포함하세요.