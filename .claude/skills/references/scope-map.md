# MTN 파일 역할 및 의존 관계 맵

코드 수정 시 임팩트 체크에 활용한다. 파일을 수정하기 전에 "이 파일을 import하는 곳"을 확인한다.

---

## 페이지 레이어 (app/)

| 폴더 (Route) | 역할 | 주요 컴포넌트/파일 |
|------------|------|-----------------|
| `(dashboard)` | 대시보드, 매매 데이터 요약 | `page.tsx`, `SummaryCards` |
| `master-filter` | 시장 컨디션 GREEN/YELLOW/RED | `page.tsx`, `IndicatorList` |
| `scanner` | 종목군 SEPA/VCP 스캔 | `page.tsx`, `ScanTable` |
| `beauty-contest` | 종목 발굴 콘테스트 | `page.tsx`, `ContestEntry` |
| `plan` | 신규 매매 계획, 수량 계산 | `page.tsx`, `RiskCalculator` |
| `watchlist` | 관심종목 관리 | `page.tsx` |
| `portfolio` | 포지션 리스크 관리 | `page.tsx`, `Exposures` |
| `guide` | Minervini 전략 가이드 | `page.tsx` |
| `history` | 매매 복기, R-Multiple | `page.tsx`, `TradeHistoryTable` |
| `macro` | 매크로 분석 | `page.tsx` |
| `links` | 외부 투자 도구 링크 허브 | `page.tsx` |

---

## 핵심 lib 레이어 (lib/finance/)

### core/ — 핵심 로직
- `sepa.ts`: SEPA 7개 조건 스크리닝 및 RS 점수 계산
- `position-sizing.ts`: 1% 리스크 룰 및 8% 캡 기반 수량 계산
- `portfolio-risk.ts`: 전체 자산 대비 노출도 및 리스크 관리
- `trade-metrics.ts`: R-Multiple 및 매매 통계 계산

### engines/ — 분석 엔진
- `vcp/`: VCP(변동성 수축 패턴) 감지 및 피벗 분석
- `canslim-engine.ts`: CAN SLIM 전략 데이터 취합 및 평가

### providers/ — 외부 API 연동
- `kis-api.ts`: 한국투자증권 KIS API (시세, OHLCV)
- `dart-api.ts`: DART 전자공시 API (재무 데이터)
- `yahoo-api.ts`: 미국 주식 시세 데이터

### market/ — 시장 데이터 처리
- `rs-proxy.ts`: 시장 대비 상대강도(RS) 계산 프록시
- `scanner-universes.ts`: 시장별(S&P, NASDAQ 등) 종목 리스트 관리

---

## 자주 깨지는 패턴 TOP 3

### 1. API 응답 필드명 변경
KIS / DART API 응답 구조가 바뀌면 `undefined` 에러 발생.
→ **임팩트 HIGH.** `lib/finance/providers/` 수정 시 전체 스캔 기능 재확인 필수.

### 2. SEPA/VCP 계산 함수 시그니처 변경
파라미터 추가/제거 시 호출처 모두 업데이트 필요.
→ **임팩트 MED~HIGH.** `lib/finance/core/sepa.ts` 수정 시 scanner + plan 동시 확인.

### 3. Supabase RLS 정책 / 스키마 변경
콘테스트 결과 저장이나 매매 기록 저장 시 권한 에러 발생 가능.
→ **임팩트 HIGH.** `lib/supabase/` 관련 수정 시 DB 쓰기 동작 확인.

---

## 롤백 우선순위

앱이 완전히 멈출 때 아래 순서로 원인을 찾는다:

1. **라우터** — 탭 이동이 안 되면 router 파일 확인
2. **인증** — 로그인 화면이 안 나오면 auth 관련 파일 확인  
3. **API 키/환경변수** — 스캔 자체가 안 되면 `.env` / Vercel 환경변수 확인
4. **빌드 에러** — Vercel 배포 로그에서 TypeScript 컴파일 에러 확인
