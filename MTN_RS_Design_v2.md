# RS 계산 알고리즘 및 시스템 아키텍처 개선 설계 기준서 v2.0

**문서 정보**

| 항목 | 내용 |
|------|------|
| 작성자 | 만토리 (Mantori) |
| 버전 | v2.0 (v1.0 검토 의견 반영) |
| 대상 시스템 | MTN 코어 스캐너 엔진 |
| 목적 | 현행 RS 계산 알고리즘의 '선택된 소규모 유니버스 내 상대평가'로 인한 왜곡(하락장 착시 등)을 해결하고, IBD RS 철학에 근접한 평가 프록시 구축 및 거시 환경 필터링 도입 |

**v1.0 대비 주요 변경 사항**

| 섹션 | 변경 내용 |
|------|----------|
| 2.1 IBD Proxy Score | 신규 상장주 대응 정규화 로직 추가 |
| 2.2 표준 유니버스 | 중복 종목 Deduplication 처리 의무화 |
| 2.3 맨스필드 RS | boolean 외 연속값(score) 병행 저장 추가 |
| 2.4 거시 환경 필터 | `actionLevel`별 스캐너 동작 정의 명시 |
| 3. 아키텍처 | 배치 청크 분할 처리 구조 추가 |

---

## 1. 핵심 설계 변경 요약

1. **모멘텀 산식 개편:** 누적 수익률 중복 반영을 방지하기 위해 '분기별 독립 수익률' 기반의 IBD Proxy Score(최근 분기 2배 가중치 부여)로 변경. 신규 상장주는 가용 분기 수 기준으로 정규화하여 스코어 왜곡 방지.
2. **표준 벤치마크 유니버스 (Standard Universe) 도입:** 스캔 시점의 동적 연산 대신, 백그라운드 배치(Batch) 작업을 통해 전체 시장을 대변하는 고정 유니버스 기준으로 RS 랭킹(1~99) 사전 연산. 중복 종목은 Deduplication 후 실제 고유 종목 수로 환산 적용.
3. **이중 필터링 (Dual Filtering):** 종목별 52주 맨스필드 상대강도(Mansfield RS) boolean 및 연속값 score, 시장 벤치마크 지수의 이동평균선(50/200 MA) 추세 필터 결합. `actionLevel`별 스캐너 동작을 명시적으로 정의하여 UI 구현 모호성 제거.

---

## 2. 알고리즘 상세 명세

### 2.1. IBD Proxy Score (분기별 독립 모멘텀 산출)

기존의 현재가 대비 3/6/9/12개월 단순 누적 수익률 산식을 폐기하고, 각 분기별 수익률을 독립적으로 산출하여 최근 3개월에 2배수 가중치를 부여합니다.

**[v2.0 변경]** 신규 상장주 또는 데이터 누락 시, 가용한 분기만 연산하고 총 가중치 합(풀셋 기준 5.0)으로 정규화하여 전체 유니버스와 스케일을 통일합니다.

- **입력값:** `currentPrice`, `price3mAgo`, `price6mAgo`(optional), `price9mAgo`(optional), `price12mAgo`(optional)
- **필수 조건:** `currentPrice` 및 `price3mAgo` 모두 존재해야 스코어 산출. 미충족 시 `null` 반환 (N/A 처리).
- **산식 (TypeScript):**

```typescript
interface PriceHistory {
  currentPrice: number;
  price3mAgo: number;
  price6mAgo?: number;
  price9mAgo?: number;
  price12mAgo?: number;
}

/**
 * IBD Proxy Score 산출
 * - Q1(최근 3개월)에 2배 가중치 부여
 * - 누락 분기는 계산에서 제외하고 가중치 합 기준으로 정규화
 * - 풀셋 가중치 합 = 5.0 (2.0 + 1.0 + 1.0 + 1.0)
 * @returns 정규화된 스코어 (null = 데이터 부족으로 산출 불가)
 */
const getIBDProxyScore = (prices: Partial<PriceHistory>): number | null => {
  const { currentPrice, price3mAgo, price6mAgo, price9mAgo, price12mAgo } = prices;

  // 최소 데이터 요건 미충족 시 N/A
  if (!currentPrice || !price3mAgo) return null;

  // Q1: 최근 1~3개월 수익률 (필수, 2배 가중치)
  const q1Return = (currentPrice - price3mAgo) / price3mAgo;
  let weightedSum = q1Return * 2.0;
  let totalWeight = 2.0;

  // Q2: 과거 4~6개월 수익률 (선택)
  if (price3mAgo && price6mAgo) {
    weightedSum += (price3mAgo - price6mAgo) / price6mAgo;
    totalWeight += 1.0;
  }

  // Q3: 과거 7~9개월 수익률 (선택)
  if (price6mAgo && price9mAgo) {
    weightedSum += (price6mAgo - price9mAgo) / price9mAgo;
    totalWeight += 1.0;
  }

  // Q4: 과거 10~12개월 수익률 (선택)
  if (price9mAgo && price12mAgo) {
    weightedSum += (price9mAgo - price12mAgo) / price12mAgo;
    totalWeight += 1.0;
  }

  // 풀셋(5.0) 기준 정규화: 신규 상장주와 기존 종목의 스케일 통일
  const FULL_SET_WEIGHT = 5.0;
  return (weightedSum / totalWeight) * FULL_SET_WEIGHT;
};
```

---

### 2.2. 표준 벤치마크 유니버스 RS 환산

특정 스캐너 결과 내에서의 상대평가가 아닌, 사전에 정의된 '표준 유니버스' 풀(Pool) 안에서의 백분위 점수(1~99)를 산출합니다.

**[v2.0 변경]** S&P 500과 NASDAQ 100, KOSPI 200과 KOSDAQ 150은 종목 중복이 존재합니다. `Set` 자료구조를 통한 Deduplication을 의무화하고, 실제 고유 종목 수(`actualUniverseSize`)를 환산 기준으로 사용합니다.

- **표준 유니버스 정의 (Deduplication 적용):**

```typescript
// 유니버스 구성 시 반드시 Set으로 중복 제거 후 실제 고유 종목 수 기록
const STANDARD_UNIVERSE = {
  KR: new Set([...kospi200Tickers, ...kosdaq150Tickers]),
  US: new Set([...sp500Tickers, ...nasdaq100Tickers]),
};

// 실제 고유 종목 수 (중복 제거 후) — calculateRSRating의 standardUniverseSize로 사용
const KR_UNIVERSE_SIZE = STANDARD_UNIVERSE.KR.size; // 예: 약 340 (중복 약 10종목 제거)
const US_UNIVERSE_SIZE = STANDARD_UNIVERSE.US.size; // 예: 약 503 (중복 약 97종목 제거)
```

- **RS Rating 환산 산식 (TypeScript):**

```typescript
/**
 * 표준 유니버스 내 순위를 1~99점으로 환산
 * @param rank - 유니버스 내 순위 (1위 = 가장 높은 스코어)
 * @param standardUniverseSize - Deduplication 후 실제 고유 종목 수
 * @returns 1(하위) ~ 99(상위) 점수
 */
const calculateRSRating = (rank: number, standardUniverseSize: number): number => {
  return Math.round(99 - ((rank - 1) / (standardUniverseSize - 1)) * 98);
};
```

---

### 2.3. 맨스필드 상대강도 (Mansfield RS)

해당 종목이 속한 벤치마크 지수(예: KOSDAQ, NASDAQ) 자체를 아웃퍼폼하고 있는지 검증하는 절대 강도 지표입니다.

**[v2.0 변경]** boolean 반환 외에 연속값 `score`(종목 수익률 / 지수 수익률 - 1)를 병행 저장합니다. 이를 통해 "지수 대비 +X% 아웃퍼폼 필터" 또는 "강도 순 정렬" 등의 고급 조건을 재계산 없이 즉시 적용할 수 있습니다.

- **기준 기간:** 52주 (약 250 거래일)
- **산식 (TypeScript):**

```typescript
interface MansfieldResult {
  isOutperforming: boolean; // true = 지수 대비 강세
  score: number;            // 양수: 아웃퍼폼, 음수: 언더퍼폼 (소수점 표현, 예: 0.15 = +15%)
}

/**
 * 맨스필드 상대강도 산출
 * @returns isOutperforming: 지수 아웃퍼폼 여부, score: 아웃퍼폼 강도 (연속값)
 */
const getMansfieldRS = (
  stockPrices: { currentPrice: number; price250DaysAgo: number },
  indexPrices: { currentPrice: number; price250DaysAgo: number }
): MansfieldResult => {
  const stockPerf = stockPrices.currentPrice / stockPrices.price250DaysAgo;
  const indexPerf = indexPrices.currentPrice / indexPrices.price250DaysAgo;
  const score = stockPerf / indexPerf - 1;

  return {
    isOutperforming: score > 0,
    score, // DB에 mansfield_rs_score 컬럼으로 저장
  };
};
```

---

### 2.4. 거시 환경 필터 (Macro Trend Filter)

지수의 추세를 파악하여 스캐너의 진입 신호 유효성을 검증합니다.

**[v2.0 변경]** `REDUCED` 레벨의 동작 정의가 부재하면 프론트엔드 UI 구현 시 모호성이 발생합니다. 아래와 같이 `actionLevel`별 스캐너 동작을 명시적으로 정의합니다.

- **필터 조건:** 벤치마크 지수의 현재가가 50일 또는 200일 이동평균선 상단에 위치하는지 판별.
- **`actionLevel` 동작 정의표:**

| actionLevel | 조건 | 스캐너 동작 | UI 표시 |
|---|---|---|---|
| `FULL` | 50MA 위 AND 200MA 위 | 전체 신호 노출, 신규 진입 허용 | 정상 (녹색 인디케이터) |
| `REDUCED` | 50MA 아래 AND 200MA 위 | RS 상위 20% 종목만 노출, 포지션 축소 권고 | 주의 배너 (황색) |
| `HALT` | 200MA 아래 | 신규 매수 신호 숨김, 관망 권고 | 경고 배너 (적색) — "현재 하락장(HALT) — 신규 매수 주의" |

- **산식 (TypeScript):**

```typescript
interface MacroTrend {
  isUptrend50: boolean;
  isUptrend200: boolean;
  actionLevel: 'FULL' | 'REDUCED' | 'HALT';
}

const evaluateMacroTrend = (
  indexPrice: number,
  indexMA50: number,
  indexMA200: number
): MacroTrend => {
  const isUptrend50 = indexPrice > indexMA50;
  const isUptrend200 = indexPrice > indexMA200;

  let actionLevel: 'FULL' | 'REDUCED' | 'HALT' = 'HALT';
  if (isUptrend50 && isUptrend200) actionLevel = 'FULL';
  else if (!isUptrend50 && isUptrend200) actionLevel = 'REDUCED';
  // !isUptrend200 인 경우 (50MA 여부 무관) → HALT

  return { isUptrend50, isUptrend200, actionLevel };
};
```

> **REDUCED 레벨 스캐너 필터링 기준:** `rs_rating >= 80` (유니버스 상위 20%) 종목만 노출. 이 임계값은 설정 상수(`REDUCED_RS_THRESHOLD`)로 관리하여 추후 조정 가능하도록 구현할 것.

---

## 3. 데이터 파이프라인 및 아키텍처 요구사항

이 설계는 동적 계산의 부하를 줄이기 위해 배치(Batch) 처리 구조를 요구합니다.

### 3.1. 일 단위 스케줄러 배치 (Daily Cron Job)

**[v2.0 변경]** 전체 유니버스(KR ~340종목, US ~503종목)를 단일 Cron Job으로 처리하면 Vercel 함수 실행 시간 제한(기본 10초, Pro 300초)을 초과할 위험이 있습니다. 아래와 같이 청크 분할 처리 구조를 적용합니다.

```
[Daily Cron Trigger — 장 마감 후]
    │
    ├─ Queue에 유니버스 종목 분할 적재
    │      KR: ~340종목 → 50종목 단위 청크 (약 7회)
    │      US: ~503종목 → 50종목 단위 청크 (약 11회)
    │
    ├─ Worker (청크 단위 실행)
    │      1. 청크 내 종목들의 최근 12개월 가격 데이터 Fetch
    │      2. getIBDProxyScore 연산 (신규 상장주 정규화 포함)
    │      3. 전체 유니버스 정렬 후 calculateRSRating 적용
    │      4. getMansfieldRS 연산 (boolean + score)
    │      5. evaluateMacroTrend 연산 (지수 MA 데이터 별도 Fetch)
    │      6. Supabase stock_metrics 테이블 UPSERT
    │
    └─ 청크 전체 완료 시 → macro_trend 테이블 UPSERT (지수별 1건)
```

> **권장 큐 구현:** Vercel 환경에서는 **Upstash QStash** 또는 **Vercel Queue**와 조합하여 청크 단위 비동기 처리. 자체 서버 환경에서는 Bull/BullMQ(Redis 기반) 사용 가능.

### 3.2. 스캐너 조회 (Runtime Query)

사용자가 프론트엔드에서 특정 유니버스를 스캔할 때, 실시간 RS 계산 없이 DB에 사전 계산된 값을 단순 JOIN/조회하여 노출합니다.

- **조회 컬럼:** `rs_rating`, `mansfield_rs_flag`, `mansfield_rs_score`, `macro_action_level`
- **REDUCED 레벨 필터링:** `actionLevel = 'REDUCED'`인 경우 쿼리 단에서 `rs_rating >= {REDUCED_RS_THRESHOLD}` 조건 자동 추가.
- **클라이언트 전달값:** `macro_action_level`을 포함하여 장세에 따른 UI 경고 배너 표출에 활용.

---

## 4. Database Schema (Supabase Migration SQL)

```sql
-- stock_metrics 테이블: 종목별 일별 RS 지표 저장
CREATE TABLE IF NOT EXISTS stock_metrics (
  id              BIGSERIAL PRIMARY KEY,
  ticker          TEXT NOT NULL,
  market          TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  calc_date       DATE NOT NULL,

  -- IBD Proxy Score (정규화된 연속값, null = 데이터 부족)
  ibd_proxy_score NUMERIC(10, 6),

  -- 표준 유니버스 기준 RS Rating (1~99, null = 산출 불가)
  rs_rating       SMALLINT CHECK (rs_rating BETWEEN 1 AND 99),

  -- 맨스필드 RS
  mansfield_rs_flag   BOOLEAN,                -- true = 지수 아웃퍼폼
  mansfield_rs_score  NUMERIC(8, 4),          -- 연속값 (예: 0.15 = +15%)

  -- 메타
  data_quality    TEXT DEFAULT 'FULL'
                  CHECK (data_quality IN ('FULL', 'PARTIAL', 'NA')),
                  -- FULL: 12개월 데이터 완비
                  -- PARTIAL: 일부 분기 누락 (신규 상장주 등)
                  -- NA: 최소 데이터 미충족으로 스코어 산출 불가

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (ticker, market, calc_date)
);

-- macro_trend 테이블: 지수별 거시 환경 필터 결과 저장
CREATE TABLE IF NOT EXISTS macro_trend (
  id              BIGSERIAL PRIMARY KEY,
  index_code      TEXT NOT NULL,             -- 예: 'KOSPI', 'KOSDAQ', 'SPX', 'NDX'
  market          TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  calc_date       DATE NOT NULL,

  index_price     NUMERIC(12, 4) NOT NULL,
  ma_50           NUMERIC(12, 4) NOT NULL,
  ma_200          NUMERIC(12, 4) NOT NULL,
  is_uptrend_50   BOOLEAN NOT NULL,
  is_uptrend_200  BOOLEAN NOT NULL,
  action_level    TEXT NOT NULL CHECK (action_level IN ('FULL', 'REDUCED', 'HALT')),

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (index_code, calc_date)
);

-- 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_stock_metrics_date_market
  ON stock_metrics (calc_date, market);

CREATE INDEX IF NOT EXISTS idx_stock_metrics_rs_rating
  ON stock_metrics (calc_date, rs_rating DESC)
  WHERE rs_rating IS NOT NULL;
```

---

## 5. Codex / AI 어시스턴트 코드 생성 지침 (Prompt Instructions)

이 기준서를 읽은 AI 어시스턴트는 다음 작업을 순서대로 수행해야 합니다.

### Task 1. Refactoring — IBD Proxy Score

기존의 `weightedMomentumScore` 산식을 `getIBDProxyScore` 분기별 로직으로 리팩토링합니다.

- **요건:**
  - `PriceHistory` 인터페이스 정의 (섹션 2.1 참조)
  - `price6mAgo`, `price9mAgo`, `price12mAgo`는 optional 처리
  - 최소 데이터 요건 미충족 시 `null` 반환
  - 가용 분기 수 기반 정규화 로직 포함 (풀셋 가중치 5.0 기준)

### Task 2. Database Schema Update

섹션 4의 Supabase Migration SQL을 기반으로 스키마를 생성합니다.

- **요건:**
  - `stock_metrics` 테이블: `ibd_proxy_score`, `rs_rating`, `mansfield_rs_flag`, `mansfield_rs_score`, `data_quality` 컬럼 포함
  - `macro_trend` 테이블: `action_level` 포함
  - 조회 성능 인덱스 포함
  - 기존 테이블 존재 시 `ALTER TABLE`로 컬럼 추가하는 마이그레이션 버전도 병행 제공

### Task 3. Cron Job Batch Script

표준 벤치마크 유니버스 종목들의 점수를 일괄 계산하여 DB에 업데이트하는 배치 스크립트 (Node.js/TypeScript) 초안을 작성합니다.

- **요건:**
  - 유니버스 구성 시 `Set`으로 Deduplication 처리 — `KR_UNIVERSE_SIZE`, `US_UNIVERSE_SIZE`는 실제 고유 종목 수 사용
  - 50종목 단위 청크 분할 처리 (Vercel 함수 실행 시간 제한 대응)
  - 청크별 `getIBDProxyScore` → 전체 정렬 → `calculateRSRating` → `getMansfieldRS` → Supabase UPSERT 순서 준수
  - `evaluateMacroTrend` 결과는 `macro_trend` 테이블에 별도 UPSERT
  - 청크 처리 결과 로깅 포함 (성공/실패 종목 수 기록)

### Task 4. Error Handling

모든 함수에 다음 예외 처리를 반드시 포함합니다.

| 케이스 | 처리 방식 |
|--------|----------|
| `price3mAgo` 누락 | `null` 반환, `data_quality = 'NA'` 저장 |
| 일부 분기 데이터 누락 (신규 상장주) | 가용 분기만 연산 후 정규화, `data_quality = 'PARTIAL'` 저장 |
| 12개월 데이터 완비 | 정상 연산, `data_quality = 'FULL'` 저장 |
| 가격 데이터 `0` 또는 음수 | 에러 throw 없이 `null` 반환, 로그 기록 |
| API Fetch 실패 (개별 종목) | 해당 종목 skip 후 다음 종목 진행, 청크 전체 중단 금지 |
