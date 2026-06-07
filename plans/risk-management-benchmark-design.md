# MTN Professional Risk Management Benchmark Design

> 작성일: 2026-06-07
> 범위: 설계안 및 1차 구현 기준.
> 기준 코드: `lib/finance/core/position-sizing.ts`, `lib/finance/core/portfolio-risk.ts`, `lib/finance/core/position-lifecycle.ts`, `app/api/portfolio/risk/route.ts`, `app/portfolio/page.tsx`, `types/index.ts`

---

## 0. 결론

MTN의 리스크 관리는 이미 단일 트레이드 기준 `1% risk`, `7~8% max loss cap`, 패턴 무효화 손절, 피라미딩/부분청산 라이프사이클, 포트폴리오 총 오픈 리스크 경고를 갖고 있다.

다음 단계는 새 매매 기법을 추가하는 것이 아니라, 전문 트레이더들이 공통으로 쓰는 **사전 정의된 손실 한도, 변동성 기반 사이징, 포트폴리오 heat limit, 상관/섹터 집중 제어, drawdown 기반 throttle**을 MTN의 의사결정 레이어로 승격시키는 것이다.

우선순위는 다음 순서가 적절하다.

1. `RiskPolicy`를 도입해 리스크 한도를 설정값으로 외부화한다.
2. 단일 트레이드의 `RiskPlan`에 `R`, reward/risk, ATR stop, slippage buffer를 추가한다.
3. 포트폴리오 요약에 `portfolioHeat`, `riskBudgetRemaining`, `correlationBuckets`, `drawdownThrottle`을 추가한다.
4. scanner/contest/plan 단계에서 리스크 게이트를 선행 적용한다.
5. history/review에서 규칙 위반을 mistake tag가 아니라 별도 `risk_violation`으로 구조화한다.

### 0-1. 2026-06-07 1차 구현 반영

반영 완료:
- `RiskStrategy`: `AUTO | MINERVINI_VCP | HIGH_TIGHT_FLAG | ATR_VOLATILITY | CONSERVATIVE`
- `RiskPolicy`: 전략별 base risk, single-trade cap, portfolio heat, ATR multiple, pyramid spacing
- `RiskGate`: `PASS | REDUCE | BLOCK` 및 사유 코드
- `RiskPlan`: requested/applied strategy, stop quality, ATR/pattern/selected stop, 2R target, reward/risk, risk policy snapshot, risk gate
- `/plan`: 리스크 전략 선택 드롭다운 및 Risk Gate 표시
- `/portfolio`: portfolio heat, risk budget, position open-risk pct 표시
- DB migration: `risk_policies`, `trades.risk_strategy`, `trades.requested_risk_strategy`, `trades.risk_gate`, `trades.risk_policy_snapshot`
- 검증: `npm run build`, 변경 파일 lint, 전체 테스트 통과

다음 구현 후보:
- 실제 `risk_policies` 테이블에서 사용자별 정책을 읽어 fallback 정책과 merge
- scanner/contest 단계에서 `RiskGate`를 사전 적용
- review loop에 `risk_violation_tags` 추가

---

## 1. 벤치마크 원칙

### 1-1. CME식 fixed fractional risk

벤치마크:
- 진입 전에 stop 위치와 계좌 대비 허용 손실액을 먼저 정한다.
- CME는 신규 트레이더에게 단일 거래 1~3% 위험을 예시로 제시하고, 2% rule은 계좌 손실 한도를 구조화하는 임의지만 실용적인 기준이라고 설명한다.

MTN 반영:
- 현재 `calculatePositionSize(totalEquity, entryPrice, stopLossPrice, riskPercent)`는 이 원칙을 이미 구현한다.
- 개선점은 `riskPercent`를 하드코딩 기본값이 아니라 `RiskPolicy.baseRiskPct`로 관리하고, market regime에 따라 자동 감액하는 것이다.

설계값:
- `baseRiskPct`: 기본 1.0%
- `maxSingleTradeRiskPct`: 최대 2.0%
- `riskOffMultiplier`: 0.0~0.5
- `yellowMultiplier`: 0.5
- `greenMultiplier`: 1.0

### 1-2. CAN SLIM / Minervini식 max loss cap

벤치마크:
- 성장주 돌파 전략은 손실을 작게 고정하고, 소수의 큰 승자가 전체 기대값을 만든다.
- MTN은 이미 `MINERVINI_MAX_LOSS_PCT = 0.08`, High Tight Flag `0.07` 캡을 사용한다.

MTN 반영:
- `maxLossPct`를 전략별 정책으로 분리한다.
- `stopSource`의 신뢰도를 계산해 stop이 너무 멀거나 너무 가까우면 진입을 막는다.

설계값:
- `MINERVINI_VCP.maxLossPct`: 8%
- `HIGH_TIGHT_FLAG.maxLossPct`: 7%
- `stopDistanceMinAtr`: 0.5 ATR
- `stopDistanceMaxAtr`: 2.5 ATR
- `stopQuality`: `VALID | TOO_TIGHT | TOO_WIDE | INVALID`

### 1-3. Turtle식 volatility-normalized sizing

벤치마크:
- Turtle 계열 시스템은 `N`, 즉 ATR류 변동성 단위로 포지션 크기와 피라미딩 간격을 정해 종목별 변동성 차이를 흡수한다.
- 변동성이 큰 종목은 같은 명목 금액이라도 계좌에 더 큰 손익 흔들림을 만든다.

MTN 반영:
- 현재 `RiskPlan.atr`는 표시용에 가깝다.
- `atrRiskUnit = atr * atrStopMultiple`을 도입하고, 패턴 손절과 ATR 손절 중 더 보수적인 쪽을 선택한다.

설계값:
- `atrLookback`: 14 또는 20
- `atrStopMultiple`: 기본 2.0
- `pyramidSpacingAtr`: 0.5 ATR 또는 기존 +2%/+4% 중 더 엄격한 값
- `volatilityAdjustedShares = floor(maxRisk / max(patternRiskPerShare, atrRiskPerShare))`

### 1-4. Portfolio heat limit

벤치마크:
- 전문 운용에서는 단일 거래보다 동시에 열려 있는 총 위험이 더 중요하다.
- MTN은 이미 `totalOpenRisk / equity > 8%` 경고를 낸다.

MTN 반영:
- 경고 문자열이 아니라 구조화된 `riskGate`로 만들고, 신규 진입 가능 금액을 계산한다.

설계값:
- `maxPortfolioHeatPct`: 기본 6%, 공격 모드 8%, 방어 모드 3%
- `riskBudgetRemaining = max(0, equity * maxPortfolioHeatPct - totalOpenRisk)`
- 신규 계획의 `maxRisk`가 `riskBudgetRemaining`을 넘으면 position size를 자동 축소하거나 `BLOCKED` 처리한다.

### 1-5. Concentration and correlated exposure

벤치마크:
- 섹터·테마·상관 포지션은 개별 종목 수가 여러 개여도 실제로는 하나의 베팅처럼 움직일 수 있다.
- MTN은 현재 섹터 35% 이상이고 2종목 이상이면 경고한다.

MTN 반영:
- `sectorExposure`를 유지하되 `riskExposurePct`도 추가한다. 명목 노출과 stop 기준 리스크는 다르다.
- 섹터뿐 아니라 `industry`, `theme`, `country`, `currency`, `assetClass` bucket을 점진 도입한다.

설계값:
- `maxSectorExposurePct`: 35%
- `maxSectorRiskPct`: 3%
- `maxThemeRiskPct`: 4%
- `sameBucketNewEntryPolicy`: `ALLOW | REDUCE_SIZE | BLOCK`

### 1-6. Drawdown throttle

벤치마크:
- 전문 트레이더는 연속 손실이나 equity drawdown 발생 시 포지션 크기를 줄이고, 복구 전까지 공격도를 낮춘다.

MTN 반영:
- `history/review-stats`의 완료 거래를 기반으로 rolling drawdown과 최근 N거래 손익을 계산한다.
- scanner 추천 티어를 직접 낮추기보다 plan 단계에서 `effectiveRiskPct`를 낮춘다.

설계값:
- `dailyLossLimitPct`: 2%
- `weeklyLossLimitPct`: 4%
- `drawdownSoftLimitPct`: 5% → risk 50%
- `drawdownHardLimitPct`: 8% → 신규 진입 중단
- `consecutiveLossLimit`: 3 → 신규 진입 risk 50%

---

## 2. 목표 아키텍처

### 2-1. 신규 핵심 타입

```ts
export interface RiskPolicy {
  market: 'US' | 'KR';
  profile: 'CONSERVATIVE' | 'STANDARD' | 'AGGRESSIVE';
  baseRiskPct: number;
  maxSingleTradeRiskPct: number;
  maxPortfolioHeatPct: number;
  maxSectorExposurePct: number;
  maxSectorRiskPct: number;
  maxPositions: number | null;
  atrLookback: number;
  atrStopMultiple: number;
  pyramidSpacingAtr: number;
  drawdownSoftLimitPct: number;
  drawdownHardLimitPct: number;
  dailyLossLimitPct: number;
  weeklyLossLimitPct: number;
}

export interface RiskGateResult {
  status: 'PASS' | 'REDUCE' | 'BLOCK';
  effectiveRiskPct: number;
  allowedRiskAmount: number;
  reasons: RiskGateReason[];
}

export interface RiskGateReason {
  code:
    | 'MARKET_REGIME'
    | 'PORTFOLIO_HEAT'
    | 'SECTOR_CONCENTRATION'
    | 'CORRELATED_EXPOSURE'
    | 'DRAWDOWN_THROTTLE'
    | 'STOP_QUALITY'
    | 'INSUFFICIENT_RISK_BUDGET';
  severity: 'INFO' | 'WARN' | 'BLOCK';
  message: string;
}
```

### 2-2. 기존 타입 확장

`RiskPlan` 확장:
- `initialRiskAmount`
- `initialRiskPct`
- `effectiveRiskPct`
- `rewardRiskRatio`
- `targetPrice`
- `atrStopPrice`
- `patternStopPrice`
- `selectedStopPrice`
- `stopQuality`
- `riskGate`

`PortfolioRiskSummary` 확장:
- `portfolioHeatPct`
- `riskBudgetRemaining`
- `sectorRisk`
- `correlationBuckets`
- `drawdownState`
- `riskGate`

### 2-3. DB 확장

기존 `portfolio_settings`를 확장하거나 별도 `risk_policies`를 둔다.

권장안: `risk_policies` 신규 테이블.

이유:
- `portfolio_settings`는 현재 total equity/cash/max positions 성격이다.
- 정책은 계좌 상태가 아니라 룰셋이므로 버전 관리와 실험이 필요하다.

초안:

```sql
CREATE TABLE IF NOT EXISTS public.risk_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'KR')),
  profile TEXT NOT NULL DEFAULT 'STANDARD',
  enabled BOOLEAN NOT NULL DEFAULT true,
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(market, profile)
);

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS risk_gate JSONB,
  ADD COLUMN IF NOT EXISTS risk_policy_snapshot JSONB;
```

---

## 3. 엔진 설계

### 3-1. `risk-policy.ts`

역할:
- market/profile별 기본 정책을 제공한다.
- Supabase 정책이 없으면 deterministic default를 사용한다.

주요 함수:
- `getDefaultRiskPolicy(market, profile)`
- `mergeRiskPolicy(defaultPolicy, dbPolicyJson)`
- `resolveEffectiveRiskPct(policy, marketState, drawdownState)`

### 3-2. `risk-gate.ts`

역할:
- 신규 진입 또는 피라미딩이 가능한지 판단한다.
- 결과는 UI와 저장 snapshot에서 모두 쓰는 구조화 객체로 반환한다.

입력:
- `RiskPolicy`
- `PortfolioRiskSummary`
- `MarketState`
- candidate `RiskPlan`
- optional `Trade` for add-on entries

출력:
- `RiskGateResult`

규칙:
- master filter RED 또는 macro `RISK_OFF`면 `BLOCK` 또는 `REDUCE`.
- `portfolioHeatPct >= maxPortfolioHeatPct`면 `BLOCK`.
- risk budget이 부족하면 `REDUCE` 또는 `BLOCK`.
- 같은 섹터/테마 risk가 한도 초과면 `REDUCE`.
- drawdown hard limit이면 `BLOCK`.

### 3-3. `portfolio-risk.ts` 확장

추가 계산:
- `portfolioHeatPct = totalOpenRisk / equity`
- `riskBudgetRemaining`
- `sectorRisk = sum(openRisk by sector)`
- `largestPositionExposurePct`
- `largestPositionRiskPct`
- `positionRiskRows`

현재 `warnings: string[]`는 유지하되, 새 `riskGate.reasons`를 추가한다.

### 3-4. `position-sizing.ts` 확장

추가 계산:
- ATR 기반 stop 후보
- pattern stop 후보
- max loss cap 후보
- 최종 stop 선택 사유
- R 단위와 reward/risk
- slippage-adjusted open risk

규칙:
- long 기준 `selectedStopPrice = max(patternStop, maxLossCapStop, atrStop)`처럼 손실을 더 작게 제한하는 가격을 우선한다.
- 단, stop이 entry와 너무 가까우면 noise stop으로 판단해 `STOP_QUALITY: TOO_TIGHT`.
- stop이 너무 멀어 position size가 0이면 `BLOCK`.

---

## 4. 사용자 흐름 반영

### 4-1. Scanner

변경:
- 종목 점수와 별도로 `riskFit`을 계산한다.
- 추천 티어를 직접 대체하지 않고, plan CTA에 `정상 / 축소 / 보류` 상태를 붙인다.

예:
- `Recommended + PASS`: 계획 생성 가능
- `Recommended + REDUCE`: 절반 리스크로만 계획 생성
- `Recommended + BLOCK`: watchlist만 허용

### 4-2. Plan

변경:
- `RiskCalculator`에 단순 수량뿐 아니라 `Risk Gate`, `R`, `risk budget remaining`, `stop quality`를 표시한다.
- 저장 시 `risk_policy_snapshot`, `risk_gate`를 trade에 저장한다.

### 4-3. Portfolio

변경:
- 상단 카드에 `Portfolio Heat`, `Risk Budget`, `Drawdown Mode` 추가.
- amber warning 문자열을 유지하되, 액션형 경고를 추가한다.

액션 예:
- `BLOCK`: 신규 진입 금지, 기존 포지션 방어
- `REDUCE`: 신규 진입 risk 0.5% 이하
- `TRIM_REQUIRED`: 특정 섹터/포지션 축소 후보 표시

### 4-4. History / Review

변경:
- `mistake_tags`와 별도로 `risk_violation_tags`를 도입한다.
- 리뷰 통계에 “룰 위반 손실 기여도”를 계산한다.

태그 예:
- `RISK_OVER_BUDGET`
- `STOP_MOVED_DOWN`
- `NO_STOP`
- `OVERSIZED_ENTRY`
- `PYRAMID_TOO_EARLY`
- `IGNORED_DRAWDOWN_THROTTLE`

---

## 5. 구현 Wave 제안

### Wave 1: 정책과 순수 계산 엔진

파일:
- `types/index.ts`
- `lib/finance/core/risk-policy.ts`
- `lib/finance/core/risk-gate.ts`
- `lib/finance/core/portfolio-risk.ts`
- `lib/finance/core/position-sizing.ts`

검증:
- 단일 거래 sizing
- portfolio heat
- risk budget 부족
- drawdown throttle
- sector concentration

### Wave 2: API와 저장 구조

파일:
- `supabase/migrations/026_risk_policy_and_gate.sql`
- `app/api/portfolio/risk/route.ts`
- `app/api/market-data/route.ts`
- `app/api/trades/route.ts`

검증:
- DB policy fallback
- `risk_gate` snapshot 저장
- 기존 trade 저장 호환성

### Wave 3: UI 반영

파일:
- `components/plan/RiskCalculator.tsx`
- `app/portfolio/page.tsx`
- scanner/contest CTA 주변 컴포넌트

검증:
- `PASS / REDUCE / BLOCK` 표시
- 모바일에서 카드 overflow 없음
- 기존 portfolio summary 표시 유지

### Wave 4: Review loop

파일:
- `types/index.ts`
- `lib/review-stats.ts`
- `components/dashboard/ReviewStatsDashboard.tsx`
- `components/dashboard/panels/TradeReviewPanel.tsx`

검증:
- risk violation tag 저장
- 위반별 손익 집계
- 기존 mistake tag 통계 회귀 없음

---

## 6. 테스트 전략

필수 테스트:
- `tests/position-sizing.test.mjs`: ATR stop, stop quality, max loss cap
- `tests/portfolio-risk.test.mjs`: heat/budget/sector risk 확장
- `tests/risk-gate.test.mjs`: PASS/REDUCE/BLOCK matrix
- `tests/e2e-lifecycle.test.mjs`: risk gate snapshot이 trade lifecycle에 보존되는지

회귀 테스트:
- `npm run test`
- UI 변경이 포함되면 Playwright로 `/plan`, `/portfolio`, `/scanner` 확인

---

## 7. 기본 정책 초안

```ts
const STANDARD_US_RISK_POLICY = {
  market: 'US',
  profile: 'STANDARD',
  baseRiskPct: 0.01,
  maxSingleTradeRiskPct: 0.02,
  maxPortfolioHeatPct: 0.06,
  maxSectorExposurePct: 0.35,
  maxSectorRiskPct: 0.03,
  maxPositions: null,
  atrLookback: 20,
  atrStopMultiple: 2,
  pyramidSpacingAtr: 0.5,
  drawdownSoftLimitPct: 0.05,
  drawdownHardLimitPct: 0.08,
  dailyLossLimitPct: 0.02,
  weeklyLossLimitPct: 0.04,
} satisfies RiskPolicy;
```

KR 기본값은 동일하게 시작하되, 호가/상하한가/갭 리스크 때문에 `maxPortfolioHeatPct`를 5%로 낮추는 편이 보수적이다.

---

## 8. 보류할 것

이번 설계에서 제외:
- 자동 주문 집행
- 브로커 계좌 잔고 실시간 동기화
- 옵션/선물 margin 기반 VaR
- 머신러닝 기반 상관 추정

이유:
- MTN README가 명시하듯 현재 시스템은 order execution management system이 아니다.
- 지금 필요한 것은 실행 자동화보다 계획 단계의 리스크 예산 통제다.

---

## 9. 참고 근거

- CME Group, `Proper Position Size`: stop 위치와 계좌 대비 허용 손실을 먼저 정해 포지션 크기를 계산하는 접근.
  https://www.cmegroup.com/education/courses/trade-and-risk-management/proper-position-size
- CME Group, `The 2% Rule`: 단일 거래에서 계좌 2% 이상을 위험에 노출하지 않는 fixed fractional 예시.
  https://www.cmegroup.com/education/courses/trade-and-risk-management/the-2-percent-rule
- CME Group, `Position and Risk Management`: 계약/포지션 수/stop을 주요 리스크 변수로 설명.
  https://www.cmegroup.com/education/courses/things-to-know-before-trading-cme-futures/position-and-risk-management
- Original Turtle Trading Rules 계열 자료: ATR/N 기반 변동성 조정 포지션 사이징과 피라미딩.
  https://www.tradingblox.com/originalturtles/originalturtlerules.pdf
  https://www.turtletrader.com/rules/
- MTN 내부 기준: `lib/finance/core/position-sizing.ts`의 Minervini/VCP/HTF risk plan, `lib/finance/core/portfolio-risk.ts`의 open risk/sector concentration 계산.
