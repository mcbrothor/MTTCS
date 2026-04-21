# MTN — Mantori's Trading Navigator

## 프로젝트 개요

**목적**: 추세 매매(SEPA/VCP/O'Neil 방법론) 투자자를 위한 올인원 의사결정 지원 툴.  
**스택**: Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase · Vercel  
**데이터 소스**: Yahoo Finance (무료 지연 데이터), DART (한국 공시), KIS API (한국 주식)  
**배포**: Vercel (프로덕션: https://mttcs.vercel.app)

### 주요 메뉴

| 메뉴 | 경로 | 역할 |
|---|---|---|
| 마스터 필터 | `/master-filter` | 시장 전체 기류 점수화 (P3 Score 0~100, GREEN/YELLOW/RED) |
| 매크로 분석 | `/macro` | 글로벌 자금 흐름 점수화 (Macro Score 0~100, RISK_ON/NEUTRAL/RISK_OFF) |
| 스캐너 | `/scanner` | VCP/SEPA 패턴 필터링 |
| 뷰티 컨테스트 | `/beauty-contest` | AI 종목 순위 결정 |
| 포트폴리오 | `/portfolio` | 포지션 관리 및 리스크 추적 |
| 관리자 | `/admin` | 데이터 관리 (DART 동기화 등) |

---

## 완료된 작업 목록

### 이번 세션 (마스터필터 & 매크로 UI 개선)

#### P0 — 스냅샷 영속화 (기반 작업)
- [x] `supabase/migrations/012_market_state_history.sql` — `master_filter_snapshot`, `macro_snapshot` 테이블 + RLS 정책
- [x] `lib/master-filter/compute.ts` — `app/api/master-filter/route.ts`에서 p3Score 계산 로직을 순수 함수로 추출
- [x] `lib/macro/compute.ts` — 6개 컴포넌트 가중합 매크로 P-Score (0~100점)
- [x] `app/api/cron/snapshot-market-state/route.ts` — 일일 스냅샷 저장 Cron API
- [x] `scripts/snapshot-market-state.mjs` — 로컬/CI 실행 스크립트
- [x] `vercel.json` — Cron 트리거 추가 (US 장 마감 22:00, KR 07:30, Macro 22:00)

#### P1 — 매크로 P-Score 도입 (철학 통일)
- [x] `app/api/macro/route.ts` — `computeMacroScore()` 호출 후 `score`, `regime`, `breakdown` 필드 추가
- [x] `types/index.ts` — `MacroRegime`, `MacroScoreBreakdown`, `MacroResponse` 타입 추가
- [x] `app/macro/page.tsx` — `MarketOverview` → `MacroScoreCard` 리팩터
  - 0~100 점수 + 6개 컴포넌트 breakdown 바 표시
  - 컬러 스킴 통일: 초록=Risk-On, 빨강=Risk-Off (기존 빨강=상승 → 수정)
  - 임계값 UI에 명시: ≥70 Risk-ON · 45~69 Neutral · <45 Risk-OFF

#### P2 — 시계열 시각화 (추세 인지)
- [x] `app/api/master-filter/history/route.ts` — Supabase에서 30일 P3 히스토리 조회
- [x] `app/api/macro/history/route.ts` — Supabase에서 30일 Macro Score 히스토리 조회
- [x] `components/master-filter/StatusCenter.tsx` — 30일 P3 Sparkline + GREEN/YELLOW 기준선 + 변화량 (Δpt)
- [x] `app/macro/page.tsx` — 30일 Macro Score Sparkline + RISK_ON/Neutral 기준선

#### P3 — 크로스 시그널 메타 룰
- [x] `contexts/MarketContext.tsx` — 마스터필터 fetch 시 매크로 regime 동시 조회, `detectConflict()` 충돌 감지
  - 마스터필터 GREEN + 매크로 RISK_OFF → 경고
  - 마스터필터 RED + 매크로 RISK_ON → 경고
  - 1단계 차이 경고도 포함
- [x] `components/master-filter/StatusCenter.tsx` — 충돌 시 amber 경고 배너 표시
- [x] `app/macro/page.tsx` — 충돌 시 amber 경고 배너 표시
- [x] TypeScript 타입 체크 통과 (exit code 0)

---

## 현재 멈춘 지점

**모든 P0~P3 코드 구현은 완료.** 단, 아래가 아직 미완성:

### 1. Supabase 마이그레이션 미적용
- `supabase/migrations/012_market_state_history.sql`이 파일로만 존재하며, 실제 Supabase DB에 적용(migrate)하지 않음.
- `master_filter_snapshot`, `macro_snapshot` 테이블이 DB에 없으므로 **history API는 빈 배열을 반환**하고, **Cron API는 upsert 오류 발생**.

### 2. Sparkline은 스냅샷 데이터 누적 후 표시됨
- P2 sparkline은 DB 테이블 적용 + Cron 1회 이상 실행 후부터 실제 렌더링 가능.
- 그 전까지는 StatusCenter와 MacroScoreCard에 sparkline 영역이 숨겨짐 (history.length < 2 조건).

### 3. `app/api/master-filter/route.ts` 는 아직 compute.ts를 import하지 않음
- `lib/master-filter/compute.ts`를 분리했으나 기존 route는 그대로 자체 계산 유지.
- 중복 로직이 남아 있음. 다음 세션에서 route가 compute.ts를 호출하도록 리팩터 필요.

---

## 아직 안 한 작업 목록

### 단기 (필수)
- [ ] **Supabase 마이그레이션 적용**: `supabase db push` 또는 Supabase 대시보드에서 012 파일 실행
- [ ] **`app/api/master-filter/route.ts` 리팩터**: 자체 계산 로직을 제거하고 `computeP3()` import로 교체 (회귀 방지 테스트 후)
- [ ] **Cron 첫 수동 실행**: 마이그레이션 후 `/api/cron/snapshot-market-state?type=master-filter&market=US` 등 수동 호출로 초기 데이터 적재

### 중기 (권장)
- [ ] **계산 로직 단위 테스트**: `lib/master-filter/compute.ts`, `lib/macro/compute.ts`에 대한 Vitest 스냅샷 테스트 (경계값: p3Score 74/75, macroScore 44/45/70)
- [ ] **P3 MetricsGrid 헤더에 Δ 표시**: `MetricsGrid.tsx` P3 Score 헤더([MetricsGrid.tsx:245](components/master-filter/MetricsGrid.tsx:245))에 30일 추세선 오버레이
- [ ] **글로벌 헤더 미니 칩**: 레이아웃 헤더에 `MF:GREEN · Macro:RISK-OFF ⚠` 형태 상시 노출

### 장기 (선택)
- [ ] **RRG 4분면 섹터 로테이션**: 현재 20일 수익률 단일 관점 → 4분면 Leading/Weakening/Lagging/Improving
- [ ] **한국 시장 매크로**: KRW/USD, KTB, 외국인 순매수 수급 지표
- [ ] **매크로 백테스트**: 임계값(70/45) 최적화를 위한 히스토리컬 검증
- [ ] **2s10s 금리 커브**: FRED API 연동 시 추가

---

## 다음 세션 주의사항

1. **마이그레이션 먼저**: 코드 변경 전 반드시 `supabase/migrations/012_market_state_history.sql`을 DB에 적용할 것. 미적용 상태에서 Cron API를 호출하면 에러 발생.

2. **route.ts 리팩터 시 회귀 주의**: `app/api/master-filter/route.ts`를 `computeP3()` 기반으로 교체할 때, 기존 `legacyScore`, `macroMap`, AI insight 입력 구조가 변하지 않도록 주의. 특히 `insightInput`의 `macroData` 필드는 기존 구조 유지 필요.

3. **컬러 스킴**: macro 페이지는 이번에 초록=상승/빨강=하락으로 통일됨. 다른 페이지와 일관성 유지할 것.

4. **YahooQuote 타입**: `lib/macro/compute.ts`의 `QuoteData` 인터페이스는 `regularMarketPrice`, `regularMarketChangePercent`, `fiftyDayAverage` 세 필드만 사용. `getYahooQuotes` 반환 타입과 호환됨.

5. **Cron 시간대**: vercel.json의 cron 스케줄은 UTC 기준. `0 22 * * 1-5`는 UTC 22:00 = 한국 익일 07:00. 미국 장 마감(EST 16:00 = UTC 21:00) 이후 1시간 여유.

---

## 다음 세션 시작용 프롬프트

```
이 프로젝트는 MTN(Mantori's Trading Navigator) — 추세 매매 투자자용 Next.js 15 앱입니다.

지난 세션에서 마스터필터/매크로 UI 개선 P0~P3를 코드 구현까지 완료했습니다.
CLAUDE.md를 먼저 읽고 현재 상태를 파악해주세요.

이번 세션에서 할 일:
1. Supabase 마이그레이션 적용 확인 (supabase/migrations/012_market_state_history.sql)
2. app/api/master-filter/route.ts를 lib/master-filter/compute.ts의 computeP3()를 import하여 중복 로직 제거
3. /api/cron/snapshot-market-state 수동 호출로 초기 스냅샷 적재
4. 스파크라인이 정상 렌더링되는지 /master-filter, /macro 페이지 브라우저 확인

주의: Supabase 마이그레이션 미적용 시 history API와 cron API 모두 오류 발생함.
```
