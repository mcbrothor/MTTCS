# Mantori Trend Trading Centaur System (MTTCS) 개발 명세서

## 1. 프로젝트 개요
본 프로젝트는 전설적인 추세매매 그룹 '터틀(Turtles)'의 철학을 벤치마킹한 반자동화 추세매매 어시스턴트 및 성과 트래킹 대시보드입니다. 기계적인 리스크 계산(🤖 시스템)과 철저한 자기 반성(🧑‍💻 만토리)을 결합하여, 승률과 규율 이행률이 계좌 성과에 미치는 영향을 추적하는 것이 핵심 목표입니다.

* **핵심 기능:** 진입 전 6단계 체크리스트(Centaur Model), 텔레그램 봇을 통한 간편한 매매 결과 기록, 실시간 성과 시각화 대시보드.
* **비용 조건:** 100% 무료 티어(Free Tier) 환경에서 구동되도록 서버리스 아키텍처 채택.

## 2. 시스템 아키텍처 (Tech Stack)
* **Input Layer 1 (계획 수립):** Vercel Web App (진입 전 체크리스트 및 리스크 계산기 UI)
* **Input Layer 2 (결과 기록):** Telegram Bot (청산 후 손익 및 최종 규율 점수 로깅용 Webhook)
* **Backend Layer:** Vercel Serverless Functions (Next.js API Routes)
* **Database Layer:** Supabase (PostgreSQL)
* **Frontend Layer:** Vercel + Next.js + Tailwind CSS + Recharts

## 3. 데이터베이스 스키마 설계 (Supabase)
테이블명: `trades`

| Column Name | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `created_at` | Timestamp | 기록 일시 |
| `ticker` | String | 종목명 (예: AAPL) |
| `status` | String | 상태 (`PLANNED` = 진입 전 계획, `COMPLETED` = 매매 종료) |
| `chk_market` | Boolean | 시장 필터 통과 여부 |
| `chk_risk` | Boolean | 리스크 허용 범위 내 수량 산정 여부 |
| `chk_entry` | Boolean | 돌파 진입 원칙 동의 여부 |
| `chk_stoploss` | Boolean | 기계적 손절 서약 여부 |
| `chk_exit` | Boolean | 추세 추종 청산 서약 여부 |
| `chk_psychology`| Boolean | 심리적 안정 상태 여부 |
| `planned_risk` | Numeric | 사전에 계산된 진입 시 최대 손실 예정 금액 |
| `result_amount` | Numeric | 청산 후 실제 손익 금액 (진입 전에는 Null) |
| `final_discipline`| Integer | 청산 후 스스로 평가한 최종 규율 이행 점수 (0~100) |
| `emotion_note` | Text | 청산 후 리뷰 및 메모 |

## 4. 사용자 시나리오 및 기능 요건 (Centaur Model)

### Phase 1: 진입 전 계획 (Web App)
사용자가 웹 대시보드의 **[New Trade Plan]** 메뉴에 진입하여 매매 계획을 수립합니다.

**Step 1: 종목 및 기본 정보 입력 (🧑‍💻 수동)**
* 사용자가 검색창에 **종목명(또는 티커)**을 입력합니다.
* 계좌의 **총 자본금(Total Equity)**을 입력/확인합니다.

**Step 2: 데이터 수집 및 리스크 자동 산출 (🤖 시스템 자동화)**
* 시스템은 입력된 티커를 바탕으로 금융 API(예: Yahoo Finance)를 호출하여 데이터를 즉각 화면에 렌더링합니다.
* **자동 계산 1 (유동성 필터):** 최근 20일 평균 거래대금을 계산하여, 설정된 기준치 통과 여부를 색상(Green/Red)으로 표시.
* **자동 계산 2 (변동성 계산):** 최근 20일 기준 **ATR(Average True Range)** 자동 계산.
* **자동 계산 3 (리스크 산정):** 총 자본금의 1%를 '최대 허용 손실액'으로 자동 설정.
* **자동 계산 4 (추천 타점):** 현재가 대비 `진입가(20일 고점 돌파 가격)`, `손절가(진입가 - 2 ATR)`를 시스템이 자동으로 제시.
* **자동 계산 5 (포지션 사이즈):** 위 데이터를 바탕으로 리스크를 초과하지 않는 **'최대 매수 가능 수량(Shares)'**을 자동 산출.

**Step 3: 6단계 체크리스트 수행 및 서약 (🧑‍💻 수동 및 🤖 하이브리드)**
*사용자는 시스템이 계산한 데이터를 확인한 후, 아래 6개 항목을 직접 판단하고 모두 체크(True)해야 합니다. 하나라도 체크되지 않으면 [계획 저장]이 비활성화됩니다.*
1. **[🧑‍💻 판단] 시장 필터 (Market):** "시스템이 유동성을 승인했습니다. 현재 시장의 거시적 추세가 이 종목에 유리하게 작용합니까?"
2. **[🤖 확인] 리스크 산정 (Risk):** "시스템이 계산한 최대 허용 손실액과 포지션 수량을 확인하고, 이 리스크를 감수할 것을 동의합니까?"
3. **[🧑‍💻 서약] 진입 규율 (Entry):** "나는 시스템이 제시한 돌파 가격 도달 시, 임의로 예측하지 않고 기계적으로 진입할 것을 서약합니다."
4. **[🧑‍💻 서약] 손절매 (Stop Loss):** "나는 지정된 손절가 도달 시, 즉시 전량 시장가로 청산하겠습니다."
5. **[🧑‍💻 서약] 청산 규율 (Exit):** "나는 추세 이탈 신호 전까지 이익을 길게 가져가겠습니다."
6. **[🧑‍💻 자가진단] 심리 통제 (Psychology):** "나는 현재 이전 손실을 만회하기 위한 조급함이나 보복 심리가 없는 평온한 상태입니까?"

**Step 4: 상태 저장 (🤖 시스템 자동화)**
* 모든 항목 체크 후 **[계획 저장]** 버튼 클릭 시, DB에 `status: 'PLANNED'` 상태로 데이터 Insert.

### Phase 2: 청산 후 결과 기록 (Telegram Bot)
1. 사용자가 실제 매매 종료 후 텔레그램 봇으로 결과 전송.
2. **명령어 포맷:** `/close [종목명] / [실제손익금액] / [최종규율점수] / [메모]`
    * 예시: `/close AAPL / 500 / 100 / 원칙대로 깔끔하게 매매함`
3. **Webhook 파싱 로직 (🤖 시스템 자동화):**
    * Vercel API가 메시지 수신 시, DB에서 해당 `ticker`의 가장 최근 `PLANNED` 상태인 레코드를 찾음.
    * 해당 레코드의 `result_amount`, `final_discipline`, `emotion_note`를 업데이트하고, `status`를 `COMPLETED`로 변경.

### Phase 3: 성과 분석 대시보드 (Web App)
`COMPLETED` 상태의 데이터만 모아서 아래 지표를 시각화 (Recharts 사용).
1. **자산 곡선 (Equity Curve):** 누적 손익 그래프 (Line Chart).
2. **핵심 메트릭 카드:** 누적 승률(%), 총 누적 손익, 평균 규율 점수(%).
3. **규율 상관관계 차트:** 규율 점수 80점 이상 그룹 vs 80점 미만 그룹의 평균 승률 및 손익 비교 차트 (Bar Chart).
4. **매매 일지 테이블:** 체크리스트 항목과 최종 결과를 한눈에 보는 최근 매매 히스토리.

## 5. Antigravity 작업 지시 사항 (Action Items for AI)
1. Next.js 14 (App Router) 기반 프로젝트를 생성하고 Tailwind CSS를 셋업해 주세요.
2. Supabase 연동 코드를 구성하고, 명시된 `trades` 테이블 스키마 생성 SQL 쿼리를 작성해 주세요.
3. **[Frontend]** 메인 페이지에 '성과 분석 대시보드'와 'Phase 1의 6단계 체크리스트 입력 폼' 컴포넌트를 구현해 주세요. 금융 API를 활용한 자동 계산 로직(ATR, 포지션 사이즈 등)을 폼 상단에 배치해야 합니다.
4. **[Backend]** `/api/telegram-webhook/route.ts`를 생성하여 텔레그램 메시지를 파싱하고, 기존 `PLANNED` 상태의 DB 레코드를 `COMPLETED`로 업데이트하는 로직을 작성해 주세요.