# CAN SLIM 스캐너 모듈 설계 기준서 v2.0

**문서 정보**

| 항목 | 내용 |
|------|------|
| 작성자 | 만토리 (Mantori) |
| 버전 | v2.0 (v1.0 철학적 검토 의견 반영) |
| 대상 시스템 | MTN (Mantori Trend Navigator) CAN SLIM 스캐너 모듈 |
| 철학적 배경 | 윌리엄 오닐 (William J. O'Neil) — CAN SLIM 주도주 발굴 원칙 |
| 목적 | 펀더멘털과 기술적 분석이 결합된 CAN SLIM 조건 검색을 자동화하여 하락장을 피하고 진짜 주도주만을 스크리닝하는 모듈 구축. 미너비니 VCP 스크리너(기존 MTN 모듈)와 결과를 상호 비교하는 이중 검증 체계 구성. |

**v1.0 대비 주요 변경 사항**

| 섹션 | 변경 내용 |
|------|----------|
| C | EPS 가속화(Acceleration) 조건 및 연속 성장 분기 검증 추가 |
| A | 3년 성장률 평균 → 연도별 독립 검증으로 변경, 적자 이력 필터 추가 |
| N | 피벗 포인트 기반 매수 구간 정의, 수치 기반 패턴 감지 알고리즘 설계 추가 |
| S | Float(유통 주식수) 정량 기준 및 자사주 매입 신호 추가 |
| I | 기관 과밀집(Over-owned) 상한 조건 추가 |
| M | 분배일(Distribution Day) 카운트 로직 추가 |
| 신규 | 차트 패턴 감지 알고리즘 설계 (Vision AI 방식 채택 불가 근거 포함) |
| 신규 | StockData 인터페이스 전면 개정 |

---

## 1. CAN SLIM 철학과 시스템 매핑 (The 7 Pillars)

CAN SLIM의 각 알파벳은 스캐너의 독립적인 필터링 파라미터로 작동해야 합니다. **하나라도 기준에 미달하면 해당 종목을 즉시 탈락**시킵니다. 필터 적용 순서는 연산 비용이 낮은 항목을 먼저 처리하여 불필요한 API 호출을 최소화합니다.

### M: Market Direction (시장의 방향성) — 최우선 체크

> *"주도주의 4분의 3은 전체 시장이 하락할 때 같이 하락한다. 시장을 거스르지 마라."*

시장 환경이 불리하면 아무리 좋은 종목도 매수 신호를 내지 않습니다. 모든 필터보다 먼저 실행됩니다.

**시스템 조건:**

- 기존 Macro Trend Filter(`actionLevel`)와 완전 연동
- **`HALT`:** CAN SLIM 스캐너 신규 발굴 로직 전면 정지
- **`REDUCED`:** RS 80점 이상 종목으로 스캐너 범위 제한
- **`FULL`:** 전체 조건 활성화

**[v2.0 추가] 분배일(Distribution Day) 카운트:**

> **분배일 정의:** 벤치마크 지수가 전일 대비 **0.2% 이상 하락**하면서 **거래량이 전일보다 증가**한 날. 기관의 대규모 매도를 의미하는 시장 천장 신호.

| 분배일 수 (5주 이내) | 조치 |
|---|---|
| 0 ~ 3일 | 정상 (`actionLevel` 유지) |
| 4 ~ 5일 | `REDUCED` 강제 전환 |
| 6일 이상 | `HALT` 강제 전환 |

**[v2.0 추가] 후속 확인일(Follow-Through Day, FTD):**

하락 후 반등 시 진짜 상승 전환인지 확인하는 신호. 지수가 바닥 이후 4일째부터, **전일 대비 1.25% 이상 상승 + 거래량 증가**가 확인되면 FTD로 판정하고 `HALT → REDUCED` 전환을 허용합니다.

```typescript
interface MacroMarketData {
  actionLevel: 'FULL' | 'REDUCED' | 'HALT';
  distributionDayCount: number;   // 최근 5주 내 분배일 수
  followThroughDay: boolean;      // 바닥 확인 신호 (FTD) 발생 여부
  lastFTDDate: string | null;     // 가장 최근 FTD 날짜
}

const MACRO_CRITERIA = {
  DISTRIBUTION_DAY_REDUCED_THRESHOLD: 4,  // 4일 이상 → REDUCED 강제
  DISTRIBUTION_DAY_HALT_THRESHOLD: 6,     // 6일 이상 → HALT 강제
  FTD_MIN_GAIN_PCT: 1.25,                 // FTD 최소 상승률 (%)
  FTD_EARLIEST_DAY: 4,                    // 바닥 후 최소 4일째부터 유효
};
```

---

### C: Current Quarterly Earnings (현재 분기 실적)

> *"주도주의 가장 강력한 엔진은 최근 분기의 폭발적인 실적 성장이다. 단, 성장률이 가속화되고 있어야 한다."*

**시스템 조건:**

- 최근 분기 EPS(주당순이익) 전년 동기 대비 **최소 25% 이상 증가** (강세장 선호: 40~100%)
- 최근 분기 매출액(Sales) 전년 동기 대비 **최소 20% 이상 증가**
- 1회성 특별 이익(부동산 매각, 자산 처분 등) 제외한 **영업 기반 EPS** 사용

**[v2.0 추가] EPS 가속화(Acceleration) 검증:**

단순 임계값 통과만으로는 부족합니다. **직전 분기 대비 성장률이 높아지는 종목**이 진짜 주도주입니다. 성장률이 둔화되고 있다면 경고 플래그를 부여합니다.

```typescript
// 가속화 여부는 하드 필터가 아닌 신뢰도(confidence) 감점 요소로 처리
const isEpsAccelerating = stock.currentQtrEpsGrowth >= stock.priorQtrEpsGrowth;
// false → CAN SLIM confidence: 'MEDIUM' 이하로 강등
```

**[v2.0 추가] 연속 성장 분기 검증:**

최근 3분기 연속으로 기준치 이상 성장을 유지해야 합니다. 1분기 반짝 실적은 인정하지 않습니다.

```typescript
// epsGrowthLast3Qtrs: [가장최근, 직전, 2분기전]
const allQtrsAboveThreshold = stock.epsGrowthLast3Qtrs
  .every(g => g >= CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH);
// false → C 조건 탈락
```

---

### A: Annual Earnings Growth (연간 실적 성장률)

> *"반짝 실적이 아닌 지속 가능한 성장성을 찾아라. 단, 중간에 적자가 한 번이라도 났다면 그 기업은 내 리스트에 없다."*

**시스템 조건:**

- 자기자본이익률(ROE) **최소 17% 이상** (주도주 통상 20~50%)

**[v2.0 변경] 3년 성장률 평균 → 연도별 독립 검증:**

`annualEpsGrowth3Yr: number` (평균값) 방식은 **1년 부진을 2년 호실적으로 은폐**할 수 있습니다. 반드시 3년 각각 독립적으로 25% 이상을 검증해야 합니다.

```typescript
// 변경 전 (v1.0) — 평균으로 처리, 은폐 가능
annualEpsGrowth3Yr: number;

// 변경 후 (v2.0) — 연도별 배열, 각각 독립 검증
annualEpsGrowthEachYear: number[]; // [올해, 1년전, 2년전]

const allYearsAboveThreshold = stock.annualEpsGrowthEachYear
  .every(g => g >= CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH);
```

**[v2.0 추가] 적자 이력 필터:**

3년 내 단 한 번이라도 적자를 기록한 기업은 즉시 탈락입니다.

```typescript
// hadNegativeEpsInLast3Yr: boolean
if (stock.hadNegativeEpsInLast3Yr) return false; // A 조건 즉시 탈락
```

---

### N: New Product / New High / New Pivot (신촉매, 신고가, 피벗 돌파)

> *"N의 핵심은 고가 근처에 있다는 것이 아니다. 올바른 베이스를 완성하고 피벗 포인트를 돌파하는 그 순간을 포착하는 것이다."*

**시스템 조건:**

- 현재 주가가 **52주 신고가의 15% 이내** 위치 (바닥권 종목 매수 금지)
- 차트상 올바른 베이스 완성 후 **피벗 포인트(Pivot Point) 돌파 시점** 포착

**[v2.0 추가] 피벗 포인트 기반 매수 구간 정의:**

피벗 포인트 대비 현재가 위치로 매수 적정 구간을 판별합니다.

| 구간 | 조건 | 판정 |
|---|---|---|
| 매수 적정 | `currentPrice ≤ pivotPoint × 1.05` | ✅ VALID — 피벗 5% 이내 |
| 추격 매수 위험 | `pivotPoint × 1.05 < currentPrice ≤ pivotPoint × 1.10` | ⚠️ EXTENDED |
| 추격 매수 금지 | `currentPrice > pivotPoint × 1.10` | ❌ TOO LATE |

```typescript
interface StockData {
  pivotPoint: number | null;        // 베이스 피벗 포인트 가격
  weeksBuildingBase: number | null; // 베이스 형성 기간 (주 단위)
  detectedBasePattern: BasePatternType | null; // 감지된 패턴 유형
}

type BasePatternType =
  | 'CUP_WITH_HANDLE'
  | 'DOUBLE_BOTTOM'
  | 'FLAT_BASE'
  | 'VCP'         // 미너비니 VCP — MTN 기존 모듈과 공유
  | 'UNKNOWN';

// N 조건 평가
const evaluateN = (stock: StockData): 'VALID' | 'EXTENDED' | 'TOO_LATE' | 'INVALID' => {
  const distFromHigh =
    (stock.price52WeekHigh - stock.currentPrice) / stock.price52WeekHigh;

  if (distFromHigh > CANSLIM_CRITERIA.MAX_DIST_FROM_52W_HIGH) return 'INVALID';

  if (!stock.pivotPoint) {
    // 피벗 미정의 시 52주 고가 기준 fallback
    return distFromHigh <= 0.05 ? 'VALID' : 'EXTENDED';
  }

  const ratio = stock.currentPrice / stock.pivotPoint;
  if (ratio <= 1.05) return 'VALID';
  if (ratio <= 1.10) return 'EXTENDED';
  return 'TOO_LATE';
};
```

**[v2.0 추가] 베이스 패턴 감지 알고리즘 설계:**

> **Vision AI(이미지 인식) 방식 채택 불가 근거:**
> 차트 패턴 인식은 이미지 인식 문제가 아니라 **시계열 수치 데이터 분석 문제**입니다. 이미지 변환 과정에서 가격/날짜 정밀도가 손실되며, 피벗 포인트 계산이 불가능합니다. OHLCV 수치 데이터를 직접 분석하는 알고리즘이 유일한 정답입니다.

**권장 아키텍처 (하이브리드):**

```
[주봉 OHLCV 수치 데이터]
       │
       ▼
[패턴 감지 알고리즘] → BasePattern { type, pivotPoint, depthPct, weeksForming, confidence }
       │
       ▼
[차트 렌더링 (TradingView Lightweight Charts)]
  - 패턴 영역 음영 오버레이
  - 피벗 포인트 수평선 표시
  - Confidence 등급 표시 (HIGH / MEDIUM / LOW)
       │
       ▼
[사용자 육안 최종 확인] → "승인 / 거절" 버튼
       │
       ▼
[CAN SLIM 스캐너 진입 신호 확정]
```

**Cup with Handle 수치 조건 구현 예시:**

```typescript
interface BasePattern {
  type: BasePatternType;
  pivotPoint: number;
  weeksForming: number;
  depthPct: number;
  isValid: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const detectCupWithHandle = (weeklyOHLCV: OHLCV[]): BasePattern | null => {
  // 조건 1: 최소 7주 데이터 필요
  if (weeklyOHLCV.length < 7) return null;

  const highs = weeklyOHLCV.map(w => w.high);
  const lows  = weeklyOHLCV.map(w => w.low);

  const cupLeft  = Math.max(...highs.slice(0, 3));   // 컵 좌측 고점
  const cupFloor = Math.min(...lows);                // 컵 바닥
  const cupRight = Math.max(...highs.slice(-3));     // 컵 우측 고점

  // 조건 2: 컵 깊이 12~33%
  const depthPct = (cupLeft - cupFloor) / cupLeft * 100;
  if (depthPct < 12 || depthPct > 33) return null;

  // 조건 3: 우측 고점이 좌측 고점의 95% 이상 회복
  if (cupRight < cupLeft * 0.95) return null;

  // 조건 4: 손잡이 — 최근 1~2주, 깊이 8~12% 이내
  const handleHigh = cupRight;
  const handleLow  = Math.min(...lows.slice(-2));
  const handleDepth = (handleHigh - handleLow) / handleHigh * 100;
  if (handleDepth > 12) return null;

  // 조건 5: 손잡이는 컵 상단 절반에 위치해야 함
  const cupMidpoint = (cupLeft + cupFloor) / 2;
  if (handleLow < cupMidpoint) return null;

  return {
    type: 'CUP_WITH_HANDLE',
    pivotPoint: handleHigh + 0.10,  // 손잡이 고점 + $0.10 (원화: + 100원 단위 조정)
    weeksForming: weeklyOHLCV.length,
    depthPct,
    isValid: true,
    confidence: depthPct <= 25 ? 'HIGH' : 'MEDIUM',
  };
};
```

**베이스 패턴별 수치 조건 요약:**

| 패턴 | 최소 기간 | 깊이 범위 | 피벗 포인트 | MTN 호환 |
|---|---|---|---|---|
| Cup with Handle | 7주 이상 | 12~33% | 손잡이 고점 + 0.10 | - |
| Double Bottom | 7주 이상 | 15~33% | 중간 고점 + 0.10 | - |
| Flat Base | 5주 이상 | 10~15% 이내 | 베이스 고점 + 0.10 | - |
| VCP | 3주 이상 | 수축 연속 3회 이상 | 마지막 수축 고점 | ✅ 기존 모듈 공유 |

---

### S: Supply and Demand (수요와 공급)

> *"주가가 오르기 위해서는 기관의 대규모 매수세가 고갈된 매도세를 압도해야 한다. 그리고 공급이 작을수록 같은 매수세에 더 크게 오른다."*

**시스템 조건:**

- 돌파 지점(Breakout)에서 거래량이 **50일 평균 거래량 대비 최소 150% 이상** 증가

**[v2.0 추가] Float(유통 주식수) 정량 기준:**

"과도하게 많지 않은 종목"이라는 모호한 표현을 수치로 명확화합니다.

| Float 규모 | 기준 | 판정 |
|---|---|---|
| 5천만 주 미만 | 소형·중형주 | ✅ 프리미엄 (기관 매수 시 주가 탄력 극대화) |
| 5천만 ~ 2억 주 | 중대형주 | ⭕ 기관 보유 비중과 함께 판단 |
| 2억 주 초과 | 대형주 | ⚠️ 감점 (대규모 매수세 필요) |

```typescript
interface StockData {
  floatShares: number;        // 유통 주식 수
  sharesBuyback: boolean;     // 최근 분기 자사주 매입 실시 여부 (공급 축소 신호)
}

const CANSLIM_CRITERIA = {
  MIN_BREAKOUT_VOLUME_RATIO: 1.5,
  PREFERRED_MAX_FLOAT: 50_000_000,    // 5천만 주 미만 → 프리미엄
  LARGE_FLOAT_THRESHOLD: 200_000_000, // 2억 주 초과 → 감점
};
```

**[v2.0 추가] 자사주 매입(Buyback) 신호:**

자사주 매입은 공급 축소의 강력한 신호입니다. `sharesBuyback: true`이면 S 조건 신뢰도 가산점을 부여합니다.

---

### L: Leader or Laggard (주도주인가, 소외주인가)

> *"시장을 이끄는 진짜 대장주만 매수하라. RS 점수가 모든 것을 말한다."*

**시스템 조건:**

- **표준 벤치마크 유니버스 기준 RS 점수 80 이상** (이상적으로는 90 이상)
- 기존 MTN RS 알고리즘(IBD Proxy Score 기반, MTTCS RS 설계 기준서 v2.0)과 완전 연동

```typescript
const CANSLIM_CRITERIA = {
  MIN_RS_RATING: 80,
  PREFERRED_RS_RATING: 90,   // 90 이상 → HIGH confidence 가산
};
```

> **MTN 이중 검증 포인트:** 미너비니 VCP 스크리너와 CAN SLIM 스캐너 모두에서 RS 80+ 조건을 통과한 종목은 **최우선 관심 종목**으로 별도 태깅합니다.

---

### I: Institutional Sponsorship (기관의 뒷받침)

> *"기관이 많다고 무조건 좋은 것이 아니다. 이미 기관이 가득 찬 종목은 추가 매수 여력이 없다. 매도가 시작되면 폭락이다."*

**시스템 조건:**

- 최근 분기 해당 주식 보유 기관 수가 **증가 추세(`INCREASING`)**
- 보유 기관 수 **최소 3개 이상** (너무 적으면 수급 불안정)

**[v2.0 추가] 기관 과밀집(Over-owned) 상한:**

기관 보유 비율이 과도하게 높은 종목은 매도 압력 위험으로 경고 처리합니다.

| 기관 보유 비율 | 판정 |
|---|---|
| 20% 미만 | ⚠️ 기관 관심 부족 |
| 20% ~ 80% | ✅ 정상 구간 |
| 80% 초과 | ⚠️ 과밀집 경고 (Over-owned) |

```typescript
interface StockData {
  institutionalSponsorshipTrend: 'INCREASING' | 'FLAT' | 'DECREASING';
  institutionalOwnershipPct: number;   // 기관 보유 비율 (%)
  numInstitutionalHolders: number;     // 보유 기관 수
}

const CANSLIM_CRITERIA = {
  MIN_INSTITUTIONAL_HOLDERS: 3,
  MIN_INSTITUTIONAL_OWNERSHIP_PCT: 20,
  MAX_INSTITUTIONAL_OWNERSHIP_PCT: 80, // 초과 시 Over-owned 경고
};

// I 조건 검증
if (stock.institutionalSponsorshipTrend === 'DECREASING') return false;
if (stock.numInstitutionalHolders < CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS) return false;
if (stock.institutionalOwnershipPct > CANSLIM_CRITERIA.MAX_INSTITUTIONAL_OWNERSHIP_PCT) {
  // 하드 탈락이 아닌 경고 플래그 처리 (대형주 예외 존재)
  result.warnings.push('OVER_OWNED');
}
```

> **데이터 소스 현실적 대안 (단기 구현):**
> - 한국: DART 분기보고서 기관 보유 내역
> - 미국: SEC 13F 공시 (분기별)
> - 단기적으로는 `institutionalSponsorshipTrend: INCREASING` + 보유 비율 범위(20~80%) 조건만으로 1차 필터링

---

## 2. 전면 개정된 TypeScript 인터페이스 및 구현 코드

### 2.1. StockData 인터페이스 (v2.0 전체 통합)

```typescript
type BasePatternType =
  | 'CUP_WITH_HANDLE'
  | 'DOUBLE_BOTTOM'
  | 'FLAT_BASE'
  | 'VCP'
  | 'UNKNOWN';

interface StockData {
  symbol: string;
  market: 'KR' | 'US';

  // ── C: Current Quarterly Earnings ──────────────────────────────
  currentQtrEpsGrowth: number;       // 최근 분기 EPS 성장률 (%)
  priorQtrEpsGrowth: number;         // 직전 분기 EPS 성장률 (%) — 가속화 검증용
  epsGrowthLast3Qtrs: number[];      // [가장최근, 직전, 2분기전] — 연속 성장 검증용
  currentQtrSalesGrowth: number;     // 최근 분기 매출 성장률 (%)

  // ── A: Annual Earnings Growth ───────────────────────────────────
  annualEpsGrowthEachYear: number[]; // [올해, 1년전, 2년전] — 각각 독립 검증
  hadNegativeEpsInLast3Yr: boolean;  // 3년 내 적자 이력 여부
  roe: number;                       // 자기자본이익률 (%)

  // ── N: New High / Base Pattern ──────────────────────────────────
  currentPrice: number;
  price52WeekHigh: number;
  pivotPoint: number | null;         // 베이스 피벗 포인트 가격
  weeksBuildingBase: number | null;  // 베이스 형성 기간 (주)
  detectedBasePattern: BasePatternType | null;

  // ── S: Supply & Demand ──────────────────────────────────────────
  dailyVolume: number;
  avgVolume50: number;               // 50일 평균 거래량
  floatShares: number;               // 유통 주식 수
  sharesBuyback: boolean;            // 최근 분기 자사주 매입 여부

  // ── L: Leader ───────────────────────────────────────────────────
  rsRating: number;                  // 1~99 (표준 유니버스 기준, MTN RS 모듈 연동)
  mansfieldRsFlag: boolean;          // 지수 아웃퍼폼 여부

  // ── I: Institutional Sponsorship ────────────────────────────────
  institutionalSponsorshipTrend: 'INCREASING' | 'FLAT' | 'DECREASING';
  institutionalOwnershipPct: number; // 기관 보유 비율 (%)
  numInstitutionalHolders: number;   // 보유 기관 수
}
```

### 2.2. CANSLIM_CRITERIA 상수 (v2.0)

```typescript
const CANSLIM_CRITERIA = {
  // C
  MIN_CURRENT_EPS_GROWTH: 25,       // 최소 분기 EPS 성장률 (%)
  PREFERRED_EPS_GROWTH: 40,         // 강세장 선호 기준
  MIN_CURRENT_SALES_GROWTH: 20,     // 최소 분기 매출 성장률 (%)
  MIN_CONSECUTIVE_GROWTH_QTRS: 3,   // 연속 성장 최소 분기 수

  // A
  MIN_ANNUAL_EPS_GROWTH: 25,        // 연간 EPS 성장률 (각 연도 독립 적용)
  MIN_ROE: 17,                      // 최소 ROE (%)

  // N
  MAX_DIST_FROM_52W_HIGH: 0.15,     // 52주 신고가 대비 최대 하락폭
  PIVOT_BUY_ZONE_MAX: 0.05,         // 피벗 대비 매수 적정 구간 상단 (+5%)
  PIVOT_EXTENDED_MAX: 0.10,         // 피벗 대비 추격 위험 구간 상단 (+10%)

  // S
  MIN_BREAKOUT_VOLUME_RATIO: 1.5,   // 돌파일 거래량 배율 (50일 평균 대비)
  PREFERRED_MAX_FLOAT: 50_000_000,  // 프리미엄 Float 상한 (5천만 주)
  LARGE_FLOAT_THRESHOLD: 200_000_000,

  // L
  MIN_RS_RATING: 80,
  PREFERRED_RS_RATING: 90,

  // I
  MIN_INSTITUTIONAL_HOLDERS: 3,
  MIN_INSTITUTIONAL_OWNERSHIP_PCT: 20,
  MAX_INSTITUTIONAL_OWNERSHIP_PCT: 80,
} as const;
```

### 2.3. CAN SLIM 필터링 엔진 (v2.0 전체 통합)

```typescript
interface CanslimResult {
  pass: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  failedPillar: string | null;       // 탈락 원인 pillar
  warnings: string[];                // 경고 플래그 (탈락은 아니나 주의)
  nStatus: 'VALID' | 'EXTENDED' | 'TOO_LATE' | 'INVALID';
  stopLossPrice: number | null;      // 매수 기준가 × 0.92 (7~8% 손절)
}

const evaluateCanslim = (
  stock: StockData,
  macro: MacroMarketData,
  isBreakoutDay: boolean,
  entryPrice?: number,               // 매수 기준가 (알림 발생 시 손절가 계산용)
): CanslimResult => {
  const warnings: string[] = [];
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

  const fail = (pillar: string): CanslimResult => ({
    pass: false, confidence: 'LOW', failedPillar: pillar,
    warnings, nStatus: 'INVALID', stopLossPrice: null,
  });

  // ── M: 시장 환경 최우선 체크 ─────────────────────────────────────
  const effectiveAction = macro.distributionDayCount >= 6 ? 'HALT'
    : macro.distributionDayCount >= 4 ? 'REDUCED'
    : macro.actionLevel;

  if (effectiveAction === 'HALT') return fail('M');
  if (effectiveAction === 'REDUCED' &&
      stock.rsRating < CANSLIM_CRITERIA.PREFERRED_RS_RATING) return fail('M_REDUCED');

  // ── C: 분기 실적 ─────────────────────────────────────────────────
  if (stock.currentQtrEpsGrowth < CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH) return fail('C_EPS');
  if (stock.currentQtrSalesGrowth < CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH) return fail('C_SALES');

  const allQtrsGrowing = stock.epsGrowthLast3Qtrs
    .every(g => g >= CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH);
  if (!allQtrsGrowing) return fail('C_CONSECUTIVE');

  // EPS 가속화 여부 (탈락 아닌 confidence 감점)
  if (stock.currentQtrEpsGrowth < stock.priorQtrEpsGrowth) {
    confidence = 'MEDIUM';
    warnings.push('EPS_DECELERATING');
  }

  // ── A: 연간 실적 ─────────────────────────────────────────────────
  if (stock.hadNegativeEpsInLast3Yr) return fail('A_NEGATIVE_EPS');
  if (stock.roe < CANSLIM_CRITERIA.MIN_ROE) return fail('A_ROE');

  const allYearsGrowing = stock.annualEpsGrowthEachYear
    .every(g => g >= CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH);
  if (!allYearsGrowing) return fail('A_ANNUAL');

  // ── N: 신고가 및 베이스 패턴 ─────────────────────────────────────
  const nStatus = evaluateN(stock);
  if (nStatus === 'INVALID') return fail('N_TOO_FAR');
  if (nStatus === 'TOO_LATE') { warnings.push('N_EXTENDED'); confidence = 'LOW'; }
  if (nStatus === 'EXTENDED') warnings.push('N_WATCH');

  // ── S: 수급 ──────────────────────────────────────────────────────
  if (isBreakoutDay) {
    const volumeRatio = stock.dailyVolume / stock.avgVolume50;
    if (volumeRatio < CANSLIM_CRITERIA.MIN_BREAKOUT_VOLUME_RATIO) return fail('S_VOLUME');
  }

  if (stock.floatShares > CANSLIM_CRITERIA.LARGE_FLOAT_THRESHOLD) {
    warnings.push('S_LARGE_FLOAT');
    if (confidence === 'HIGH') confidence = 'MEDIUM';
  }
  if (stock.sharesBuyback) warnings.push('S_BUYBACK_POSITIVE'); // 긍정 신호

  // ── L: 상대강도 ───────────────────────────────────────────────────
  if (stock.rsRating < CANSLIM_CRITERIA.MIN_RS_RATING) return fail('L_RS');
  if (stock.rsRating >= CANSLIM_CRITERIA.PREFERRED_RS_RATING && confidence === 'HIGH') {
    warnings.push('L_RS_ELITE'); // 90+ 엘리트 종목 태깅
  }

  // ── I: 기관 수급 ──────────────────────────────────────────────────
  if (stock.institutionalSponsorshipTrend === 'DECREASING') return fail('I_TREND');
  if (stock.numInstitutionalHolders < CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS) return fail('I_COUNT');
  if (stock.institutionalOwnershipPct > CANSLIM_CRITERIA.MAX_INSTITUTIONAL_OWNERSHIP_PCT) {
    warnings.push('I_OVER_OWNED');
    if (confidence === 'HIGH') confidence = 'MEDIUM';
  }

  // ── 손절가 자동 계산 ─────────────────────────────────────────────
  const stopLossPrice = entryPrice ? Math.round(entryPrice * 0.92 * 100) / 100 : null;
  // 매수 단가 대비 -8% (오닐 원칙: 7~8% 기계적 손절)

  return { pass: true, confidence, failedPillar: null, warnings, nStatus, stopLossPrice };
};
```

---

## 3. 데이터 파이프라인 — 배치 주기 이원화

펀더멘털 데이터와 기술적 데이터의 갱신 주기가 다릅니다. API 리소스를 절약하기 위해 **배치 Cron을 두 트랙으로 분리**합니다.

| 트랙 | 데이터 유형 | 갱신 주기 | 해당 Pillar |
|---|---|---|---|
| **Daily Cron** | 가격, 거래량, RS Rating, MA, 분배일 | 매일 장 마감 후 | N, S, L, M |
| **Quarterly Cron** | EPS, 매출, ROE, 기관 보유 내역, Float | 분기 실적 발표 후 | C, A, I |

> **주의:** Quarterly 데이터가 업데이트되지 않은 상태에서 Daily 스캔을 실행하면 구 데이터 기반으로 신호가 발생할 수 있습니다. `lastFundamentalUpdate` 타임스탬프를 DB에 기록하고, **90일 이상 미갱신 종목에는 `DATA_STALE` 경고 플래그**를 부여하십시오.

---

## 4. MTN 이중 스크리너 비교 체계

CAN SLIM 스캐너와 미너비니 VCP 스크리너의 결과를 교차 비교하여 신뢰도를 높입니다.

| 결과 조합 | 의미 | 권장 액션 |
|---|---|---|
| CAN SLIM ✅ + VCP ✅ | 두 철학 모두 통과 — 최강 주도주 후보 | 🔴 최우선 관심 종목 (TIER 1) |
| CAN SLIM ✅ + VCP ❌ | 펀더멘털 강하나 기술적 패턴 미완성 | 🟡 워치리스트 편입, 패턴 완성 대기 |
| CAN SLIM ❌ + VCP ✅ | 기술적 패턴 양호하나 펀더멘털 미달 | 🟡 단기 트레이딩 후보 (장기 보유 부적합) |
| CAN SLIM ❌ + VCP ❌ | 양쪽 모두 탈락 | ⚫ 스크리너 제외 |

> **공유 모듈:** VCP 패턴은 CAN SLIM의 N 조건 베이스 패턴(`BasePatternType: 'VCP'`)으로 직접 재사용합니다. RS Rating 및 Mansfield RS 역시 두 스크리너가 동일한 사전 계산값을 공유합니다.

---

## 5. 운영 시 철학적 원칙

1. **손절매(Stop-Loss) 자동 계산 강제:**
   - 진입 신호 발생 시 반드시 `entryPrice × 0.92` (−8%) 손절가를 함께 출력
   - 텔레그램 알림 메시지 포맷: `[매수 신호] {symbol} | 진입가: {entryPrice} | 손절가: {stopLossPrice} | RS: {rsRating} | Confidence: {confidence}`
   - **물타기(Averaging Down) 완전 금지** — 시스템 로직에서 배제

2. **`DATA_STALE` 경고 운영:**
   - 펀더멘털 데이터 90일 이상 미갱신 종목은 신호 발생 시 경고 배너 표출
   - DART/SEC 공시 연동으로 분기 실적 발표일 자동 감지 권장

3. **사용자 최종 승인 절차:**
   - 차트 패턴(`detectedBasePattern`)의 시스템 감지 결과는 참고용
   - 진입 신호 확정 전 사용자가 차트 오버레이를 육안으로 확인하고 "승인 / 거절" 처리
   - `confidence: 'LOW'` 종목은 UI에서 경고 색상으로 표시하여 신중한 판단 유도
