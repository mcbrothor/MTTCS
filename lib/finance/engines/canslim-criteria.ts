/**
 * CAN SLIM 상수 정의 (디자인 문서 v2.0 §2.2, §1 M 조건)
 *
 * 모든 임계값은 윌리엄 오닐의 CAN SLIM 원칙을 기반으로 하되,
 * v2.0에서 추가된 가속화 검증, 연속 성장, 과밀집 경고 등의 세부 조건을 반영합니다.
 */

// --- CAN SLIM 7 Pillar 필터링 상수 ---

export const CANSLIM_CRITERIA = {
  // ── C: Current Quarterly Earnings ──────────────────────────
  MIN_CURRENT_EPS_GROWTH: 25,        // 최소 분기 EPS 성장률 (%)
  PREFERRED_EPS_GROWTH: 40,          // 강세장 선호 기준
  MIN_CURRENT_SALES_GROWTH: 20,      // 최소 분기 매출 성장률 (%)
  MIN_CONSECUTIVE_GROWTH_QTRS: 3,    // 연속 성장 최소 분기 수

  // ── A: Annual Earnings Growth ──────────────────────────────
  MIN_ANNUAL_EPS_GROWTH: 25,         // 연간 EPS 성장률 (각 연도 독립 적용)
  MIN_ROE: 17,                       // 최소 ROE (%)

  // ── N: New High / Base Pattern ─────────────────────────────
  MAX_DIST_FROM_52W_HIGH: 0.05,      // 52주 신고가 대비 최대 하락폭 (5%) - 오닐 원본 기준
  LOOSE_DIST_FROM_52W_HIGH: 0.10,    // 관심 종목(Loose) 최대 하락폭 (10%)
  PIVOT_BUY_ZONE_MAX: 0.06,          // 피벗 대비 매수 적정 구간 상단 (+6%) - Minervini 버퍼 반영
  PIVOT_EXTENDED_MAX: 0.10,          // 피벗 대비 추격 위험 구간 상단 (+10%)

  // ── S: Supply & Demand ─────────────────────────────────────
  MIN_BREAKOUT_VOLUME_RATIO: 1.5,    // 돌파일 거래량 배율 (50일 평균 대비)
  PREFERRED_MAX_FLOAT: 50_000_000,   // 프리미엄 Float 상한 (5천만 주)
  LARGE_FLOAT_THRESHOLD: 200_000_000, // 대형주 Float (2억 주 초과 → 감점)
  // 유동 시총 (Dollar Float = Float Shares * Price) - 현대적 매물 분석 기준
  PREFERRED_MAX_DOLLAR_FLOAT: 1_000_000_000, // $1B 이하 (가벼움)
  LARGE_DOLLAR_FLOAT_THRESHOLD: 5_000_000_000, // $5B 초과 (무거움)

  // ── L: Leader ──────────────────────────────────────────────
  MIN_RS_RATING: 80,                 // RS 최소 80점
  PREFERRED_RS_RATING: 90,           // 90 이상 → HIGH confidence 가산

  // ── I: Institutional Sponsorship ───────────────────────────
  MIN_INSTITUTIONAL_HOLDERS: 3,      // 보유 기관 최소 3개
  MIN_INSTITUTIONAL_OWNERSHIP_PCT: 20, // 기관 보유 최소 20%
  MAX_INSTITUTIONAL_OWNERSHIP_PCT: 80, // 초과 시 Over-owned 경고

  // ── 손절매 ─────────────────────────────────────────────────
  STOP_LOSS_PCT: 0.08,               // 오닐 원칙: 7~8% 기계적 손절
} as const;

// --- M: Market Direction 매크로 상수 ---

export const MACRO_CRITERIA = {
  DISTRIBUTION_DAY_REDUCED_THRESHOLD: 4,  // 4일 이상 → REDUCED 강제
  DISTRIBUTION_DAY_HALT_THRESHOLD: 6,     // 6일 이상 → HALT 강제
  FTD_MIN_GAIN_PCT: 1.25,                 // FTD 최소 상승률 (%)
  FTD_EARLIEST_DAY: 4,                    // 바닥 후 최소 4일째부터 유효
  DISTRIBUTION_DAY_DROP_PCT: 0.2,         // 분배일 하락 기준 (0.2%)
  DISTRIBUTION_DAY_LOOKBACK_WEEKS: 5,     // 분배일 집계 기간 (5주 = 25거래일)
} as const;

// --- 베이스 패턴 수치 조건 (디자인 문서 §N 표) ---

export const BASE_PATTERN_CRITERIA = {
  CUP_WITH_HANDLE: {
    MIN_WEEKS: 7,
    MIN_DEPTH_PCT: 12,
    MAX_DEPTH_PCT: 33,
    MIN_RIGHT_SIDE_RECOVERY: 0.95,  // 우측 고점이 좌측의 95% 이상 회복
    MAX_HANDLE_DEPTH_PCT: 12,       // 손잡이 최대 깊이
    PIVOT_OFFSET: 0.10,             // 피벗 = 손잡이 고점 + $0.10
  },
  DOUBLE_BOTTOM: {
    MIN_WEEKS: 7,
    MIN_DEPTH_PCT: 15,
    MAX_DEPTH_PCT: 33,
    MAX_BOTTOM_DIFF_PCT: 3,         // 두 바닥 가격 차이 최대 3%
    PIVOT_OFFSET: 0.10,             // 피벗 = 중간 고점 + $0.10
  },
  FLAT_BASE: {
    MIN_WEEKS: 5,
    MIN_DEPTH_PCT: 0,               // 최소 깊이 없음 (타이트한 패턴)
    MAX_DEPTH_PCT: 15,              // 최대 15% 이내
    PIVOT_OFFSET: 0.10,             // 피벗 = 베이스 고점 + $0.10
  },
  VCP: {
    MIN_WEEKS: 3,
    MIN_CONTRACTIONS: 3,            // 수축 연속 3회 이상
  },
} as const;

// --- 데이터 품질 경고 상수 ---

export const DATA_QUALITY = {
  STALE_THRESHOLD_DAYS: 90,          // 90일 이상 미갱신 → DATA_STALE 경고
  PARTIAL_LABEL: 'DATA_PARTIAL',     // Yahoo에서 일부 필드만 확보된 경우
  STALE_LABEL: 'DATA_STALE',         // 펀더멘털 갱신 90일 초과
} as const;
