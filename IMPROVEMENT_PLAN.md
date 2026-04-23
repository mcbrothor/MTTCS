# MTN 개선 작업 현황 및 후속 계획

> 최종 업데이트: 2026-04-23
> 기준 문서: `MTN_전체검토보고서_2026-04-22.docx`, `Scanner.html`, `MTN App.html`
> 기준 상태: 현재 저장소 반영 내용 + `npm run lint`, `npm run test` 통과

---

## 0. 현재 결론

검토보고서 기준 핵심 개선 축은 사실상 모두 반영되었다.

- [완료] Week 1: 스캐너 신뢰도 개선
- [완료] Week 2: UI 구조 정리 및 매크로-스캐너 연결
- [완료] Week 3: snapshot / LLM structured verdict / scanner card 고도화
- [완료] Week 4: history 3-layer, review stats, position lifecycle, E2E 시나리오

현재 남아 있는 일은 "핵심 기능 개발"보다는 운영 안정화와 문서/배포 마감에 가깝다.

---

## 1. 보고서 핵심 문제와 반영 결과

### 1-1. RS Rating 출처 혼재

- [완료] RS source를 `DB / Proxy / Rank` 배지로 명확히 노출
- [완료] DB batch RS와 내부 universe rank가 섞이지 않도록 정리
- [완료] scanner card / table 양쪽에 동일한 출처 정보 반영

관련 구현:
- `lib/finance/core/sepa.ts`
- `lib/scanner-recommendation.ts`
- `components/scanner/ScannerCardView.tsx`
- `components/scanner/ScannerTable.tsx`

### 1-2. SEPA 판정 기준이 느슨함

- [완료] Minervini 핵심 7개 조건을 별도 집계
- [완료] `7/7 = pass`, `6/7 = warning`, 그 이하는 `fail`로 조정
- [완료] scanner recommendation에서도 `7/7`만 `Recommended`, `6/7`은 `Partial`

관련 구현:
- `lib/finance/core/sepa.ts`
- `lib/scanner-recommendation.ts`
- `tests/sepa-core.test.mjs`

### 1-3. 페이지 간 데이터 단절

- [완료] `entry_snapshot`, `contest_snapshot`, `llm_verdict` 저장 구조 추가
- [완료] contest 결과를 structured JSON으로 정규화
- [완료] history에서 진입 시점, LLM 판단, 실제 결과를 3-layer로 복기 가능

관련 구현:
- `supabase/migrations/018_trade_snapshots.sql`
- `lib/finance/core/snapshot.ts`
- `app/api/trades/route.ts`
- `app/api/contest/candidates/[id]/route.ts`
- `app/api/contest/sessions/[id]/llm-result/route.ts`
- `app/history/[tradeId]/page.tsx`

---

## 2. Week별 완료 현황

## 2-1. Week 1 — 스캐너 신뢰도

- [완료] RS source 배지 노출
- [완료] SEPA core 7/7 판정 강화
- [완료] VCP contraction 검증 강화
- [완료] `rs:metrics` cron 자동화 및 실패 알림 연결

검증:
- `tests/rs-proxy.test.mjs`
- `tests/sepa-core.test.mjs`
- `tests/vcp-engine.test.mjs`

## 2-2. Week 2 — UI 기반 재정리

참고 HTML은 "기능 복제"가 아니라 "가독성/위계/레이아웃 원칙"만 선별 벤치마킹했다.

- [완료] 상단 shell 재설계 (`Navbar`, `FlowBanner`, `MarketStrip`)
- [완료] scanner / macro / master-filter / dashboard / plan / portfolio / history / contest / watchlist / CAN SLIM까지 흐름 UI 통일
- [완료] 매크로 상태를 scanner 노출 정책에 실제 반영
- [완료] `HALT / REDUCED` 정책과 "전체 보기" 예외 동선 추가

관련 구현:
- `components/layout/Navbar.tsx`
- `components/layout/FlowBanner.tsx`
- `components/layout/MarketStrip.tsx`
- `app/scanner/page.tsx`
- `app/macro/page.tsx`
- `app/master-filter/page.tsx`
- `hooks/scanner/index.ts`
- `lib/finance/market/macro-policy.ts`

## 2-3. Week 3 — 데이터 구조화

- [완료] `018_trade_snapshots.sql` 추가
- [완료] trade 생성/수정 시 `entry_snapshot` 생성
- [완료] contest linked trade에 `contest_snapshot`, `llm_verdict` 반영
- [완료] LLM 응답을 `mtn-contest-json-v3` 기준 structured verdict로 정규화
- [완료] scanner card에 RS band / TrendDots / Momentum Curve / signal tile 반영

관련 구현:
- `supabase/migrations/018_trade_snapshots.sql`
- `types/index.ts`
- `lib/finance/core/snapshot.ts`
- `lib/contest.ts`
- `lib/ai/gemini.ts`
- `lib/scanner-presentation.ts`

검증:
- `tests/trade-snapshot.test.mjs`
- `tests/contest.test.mjs`
- `tests/contest-presentation.test.mjs`
- `tests/scanner-presentation.test.mjs`

## 2-4. Week 4 — 복기와 실전 운용 흐름

- [완료] history 3-layer detail 페이지 추가
- [완료] mistake tag / exit reason / setup tag 기반 review stats 대시보드 추가
- [완료] 부분매도/피라미딩을 읽을 수 있는 `PositionLifecycleCard` 추가
- [완료] portfolio에 lifecycle 요약 노출
- [완료] 실시간 가격 기준을 trades / portfolio 양쪽에서 동일하게 맞춤
- [완료] 전문 투자자 관점 E2E 시나리오 3종 검증

관련 구현:
- `app/history/[tradeId]/page.tsx`
- `lib/history-presentation.ts`
- `lib/review-stats.ts`
- `lib/finance/core/position-lifecycle.ts`
- `components/plan/PositionLifecycleCard.tsx`
- `lib/finance/core/portfolio-risk.ts`
- `lib/finance/core/live-trade-pricing.ts`
- `app/api/portfolio/risk/route.ts`

검증:
- `tests/history-presentation.test.mjs`
- `tests/review-stats.test.mjs`
- `tests/position-lifecycle.test.mjs`
- `tests/portfolio-risk.test.mjs`
- `tests/live-trade-pricing.test.mjs`
- `tests/e2e-lifecycle.test.mjs`

---

## 3. E2E 기준 현재 시스템이 검증한 흐름

현재 테스트는 다음 라이프사이클을 실제 운용 흐름처럼 검증한다.

### 시나리오 1. 공격적 운영

- macro GREEN
- master filter PASS
- scanner Recommended / SEPA 7/7
- contest structured verdict `PROCEED`
- plan 저장 및 snapshot 생성
- execution에서 pyramid / trim 반영
- portfolio lifecycle 반영
- history 3-layer 복기 반영

### 시나리오 2. 방어적 운영

- macro REDUCED 또는 HALT
- scanner 기본 노출 축소
- HALT 시 완료 후보 차단
- 경고 배너 및 예외 동선 검증

### 시나리오 3. 포지션 관리

- 부분매도 2회
- 재피라미딩
- 평균단가 / 잔량 / 실현손익 / 평가손익 / R-multiple 일관성 검증

---

## 4. 남은 작업

핵심 개발은 끝났고, 남은 항목은 운영 마감과 품질 보강이다.

### 4-1. 운영 반영 체크

- [남음] `018_trade_snapshots.sql`를 staging / production에 실제 적용 확인
- [남음] `rs:metrics` cron의 운영 환경 변수(`CRON_SECRET`, 텔레그램 알림) 최종 확인
- [남음] 실제 배포 환경에서 live price source가 미국/한국 모두 안정적으로 응답하는지 점검

### 4-2. 문서 및 기록 정리

- [남음] `CHANGELOG.md`를 이번 개선 범위 기준으로 정리
- [남음] 최종 운영자용 점검표 문서화
- [남음] 실제 사용 가이드에 3-layer review와 lifecycle interpretation 추가

### 4-3. UI 마감 품질 보강

- [진행 가능] 아직 손대지 않은 페이지의 빈 상태 / 에러 상태 / 문구 톤 통일
- [진행 가능] scanner / portfolio / history의 모바일 간격과 density를 실사용 기준으로 추가 점검
- [진행 가능] chart tooltip / badge wording을 더 투자자 언어로 미세 조정

### 4-4. 선택적 고도화

- [선택] 서비스 레벨 E2E 외에 Playwright 기반 브라우저 E2E 추가
- [선택] history에서 mistake tag별 교정 액션 추천 자동 생성
- [선택] portfolio에서 sector / open risk 초과 시 액션형 경고 더 강화

---

## 5. 현재 우선순위 제안

지금부터의 우선순위는 아래 순서가 적절하다.

1. `018_trade_snapshots.sql` 운영 반영 확인
2. cron / 알림 / live data 운영 체크
3. `CHANGELOG.md` 및 사용자 문서 정리
4. 브라우저 수준 E2E 또는 UI polish 추가

---

## 6. 최종 상태 요약

이 개선 계획은 현재 기준으로 "실행 예정 문서"보다 "구현 완료 + 운영 체크리스트"에 더 가깝다.

- 핵심 기능 축: 완료
- 구조적 데이터 저장: 완료
- 투자자 복기 흐름: 완료
- 전문 투자자 관점 E2E: 완료
- 남은 일: 운영 적용 확인, 문서화, 선택적 polish

---

## 7. 최근 검증 상태

- `npm run lint` 통과
- `npm run test` 통과

검증 기준일: 2026-04-23
