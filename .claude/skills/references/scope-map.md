# MTN 파일 역할 및 의존 관계 맵

코드 수정 시 임팩트 체크에 활용한다. 파일을 수정하기 전에 "이 파일을 import하는 곳"을 확인한다.

---

## 페이지 레이어 (src/pages/)

| 파일 | 역할 | 의존하는 lib |
|------|------|-------------|
| `dashboard` | 대시보드, 매매 데이터 요약 | portfolio, history |
| `master-filter` | 시장 컨디션 GREEN/YELLOW/RED | 외부 API (FTD, 분산일) |
| `scanner` | 종목군 SEPA/VCP 스캔 | sepa, vcp, kis-api, krx-api |
| `plan` | 신규 매매 계획, 수량 계산 | risk-calc, sepa, vcp |
| `watchlist` | 관심종목 관리 | 로컬 스토리지 |
| `portfolio` / `risk` | 포지션 리스크 관리 | risk-calc, history |
| `guide` | Minervini 전략 가이드 | 정적 컨텐츠 |
| `history` | 매매 복기, R-Multiple | risk-calc |
| `macro` | 매크로 분석 | 외부 API |

---

## 핵심 lib 레이어 (src/lib/)

### sepa.ts — SEPA 스크리닝 로직
**사용하는 곳:** scanner, plan, watchlist  
**주요 함수:**
- `calculateSepa(ticker)` → SEPA 7개 조건 pass/fail
- `getRelativeStrength(ticker, benchmark)` → RS 프록시 점수
- `checkMovingAverages(prices)` → MA 정배열 여부

**수정 시 임팩트:** scanner 테이블 결과, plan의 SEPA 점수, watchlist 필터 모두 영향

---

### vcp.ts — VCP 피벗 분석
**사용하는 곳:** scanner, plan  
**주요 함수:**
- `calculateVcpScore(prices)` → VCP 점수 (0-100)
- `detectContractions(prices)` → 수축 패턴 감지
- `getPocketPivot(prices)` → Pocket Pivot 감지
- `getVolumeDryUp(volumes)` → 거래량 건조화 확인

**수정 시 임팩트:** scanner VCP 점수 열, plan의 피벗 근접도

---

### risk-calc.ts — 리스크 계산
**사용하는 곳:** plan, portfolio, history  
**주요 함수:**
- `calcPosition(capital, riskPct, entry, stopLoss)` → 수량 계산
- `calcRMultiple(entry, exit, stopLoss)` → R-Multiple
- `applyEightPctCap(entry)` → 8% 손절 캡 적용

**수정 시 임팩트:** plan 수량 계산, history R-Multiple 소급 변경 가능성 있음

---

### kis-api.ts — 한국투자증권 KIS API
**사용하는 곳:** scanner (KOSPI/KOSDAQ 시세), plan (현재가)  
**주요 함수:**
- `getStockPrice(ticker)` → 현재가
- `getDailyOHLCV(ticker, days)` → 일봉 데이터
- `getMarketCap(ticker)` → 시가총액

**수정 시 임팩트:** KOSPI/KOSDAQ 스캔 전체, 국내 종목 plan 수량 계산

**Fallback 체계:**
```
KRX 공식 → KIS API → Naver Finance
```

---

### krx-api.ts / naver-api.ts — 외부 데이터
**사용하는 곳:** scanner (종목 목록)  
**수정 시 임팩트:** KOSPI 100 / KOSDAQ 100 종목 목록

---

## 자주 깨지는 패턴 TOP 3

### 1. API 응답 필드명 변경
KIS / KRX API 응답 구조가 바뀌면 `undefined` 에러 발생.  
→ **임팩트 HIGH.** `kis-api.ts` 수정 시 KOSPI/KOSDAQ 스캔 전체 재확인 필수.

### 2. SEPA/VCP 계산 함수 시그니처 변경
파라미터 추가/제거 시 호출처 모두 업데이트 필요.  
→ **임팩트 MED~HIGH.** `sepa.ts`, `vcp.ts` 수정 시 scanner + plan 동시 확인.

### 3. 로컬 스토리지 스키마 변경
watchlist, plan 저장 구조 변경 시 기존 저장 데이터와 충돌.  
→ **임팩트 MED.** 마이그레이션 함수 또는 버전 키 추가 필요.

---

## 롤백 우선순위

앱이 완전히 멈출 때 아래 순서로 원인을 찾는다:

1. **라우터** — 탭 이동이 안 되면 router 파일 확인
2. **인증** — 로그인 화면이 안 나오면 auth 관련 파일 확인  
3. **API 키/환경변수** — 스캔 자체가 안 되면 `.env` / Vercel 환경변수 확인
4. **빌드 에러** — Vercel 배포 로그에서 TypeScript 컴파일 에러 확인
