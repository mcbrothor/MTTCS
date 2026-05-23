# MTN P0 버그 헌팅 체크리스트

**작성**: MTN 시스템 개발자
**일시**: 2026-04-26
**근거**: SIR-2026-Q2-001 응답서 §A, §A-bis
**원칙**: null·동일값·일관성 깨짐은 *모두 버그 후보*. UI 숨김으로 회피하지 말고 근본 원인을 추적·수정한다.

---

## BH-1. `avg_dollar_volume` 단위 오류

**증상**: GEV $270,920,000,000 (2,709억 달러) — 일평균 거래대금 불가능. 시가총액 수준값.

**조사 경로**:
1. `lib/finance/providers/yahoo-api.ts` — Yahoo Finance에서 가져온 거래량(volume) 필드의 단위 (주 수 vs 달러)
2. 거래량과 가격을 곱해서 거래대금으로 변환하는 로직 위치 — 이 변환 단계에서 누적값을 평균으로 잘못 라벨링했을 가능성
3. 후보 추출 단계에서 ADV 필드를 문서·페이로드에 직렬화하는 함수
4. UI 표시 단계에서 단위 변환(M/B) 문자열 가공이 추가로 일어나는지

**수정 기준**:
- 일평균 거래대금 = (직전 20거래일 종가 × 거래량)의 산술평균, 단위 USD
- 후보 10개의 ADV가 시가총액 대비 0.1~5% 범위에 들어오는지 sanity check 통과

**완료 정의**: GEV ADV가 1억~10억 달러 범위로 수정됨

---

## BH-2. RS 데이터 null 경로

**증상**: 컨테스트에서 `rs_rating`, `rs_percentile`, `ibd_proxy_score`, `mansfield_rs_flag`가 모든 후보에 null. 그러나 `lib/finance/market/rs-proxy.ts`에는 산출 함수가 구현되어 있음.

**조사 경로** (3단계):

### 단계 1: RS Proxy 단위 호출
- `lib/finance/market/rs-proxy.ts` 함수를 단독으로 호출하여 정상값이 반환되는지 확인
- 입력: 종목 ticker + 1년 일봉 + 유니버스 일봉
- 출력: IBD Proxy 25~75점, Mansfield RS, 백분위
- 만약 단독 호출도 실패 → RS Proxy 자체 버그 (입력 데이터 결측, 외부 API 응답 형식 변화 등)

### 단계 2: 후보 추출 단계
- `lib/master-filter/compute.ts` 또는 후보 빌더가 RS Proxy 결과를 candidate 객체에 첨부하는 경로
- candidate 객체 직렬화 시점에 RS 필드가 살아있는지 확인 (console.log 또는 로깅 삽입)

### 단계 3: 컨테스트 페이로드
- `app/api/contest/sessions/[id]/analyze/route.ts` — candidate → LLM 입력 변환에서 RS 필드를 의도적으로 제외하거나 null로 덮어쓰는 코드 존재 여부

**수정 기준**: 컨테스트 응답 페이로드 candidate 객체에 RS 4개 필드가 모두 정상 산출값으로 채워짐.

**완료 정의**: 다음 컨테스트 실행 시 RS null이 0건

---

## BH-3. `vcp_status: 'none'` 일관성 오류

**증상**: VCP 점수 14~24점인 종목 전체에 `status='none'` 표시. 점수와 status 분류 임계값 불일치.

**조사 경로**:
1. `lib/master-filter/compute.ts` — VCP 점수 산출 함수 (24점·21점·14점 산출 위치 추적)
2. VCP status 라벨링 함수 — 점수를 'none'/'forming'/'standard'/'tight' 등으로 매핑하는 위치
3. 라벨링 임계값(thresholds)이 코드에 하드코딩되어 있는지, 외부 설정에서 로드되는지

**가설**:
- 라벨링 함수가 점수 입력 대신 다른 필드(예: 별도의 boolean flag)를 보고 있어서 모두 'none'으로 떨어짐
- 임계값이 잘못 설정되어 있어서 14~24점 범위 전체가 'none' 구간에 매핑됨

**수정 기준**: 점수 14~24점 범위에 점수 분포에 따라 `forming`, `standard`, `tight` 등 차등 라벨이 출력됨.

---

## BH-4. `recommendation_tier: 'Low Priority'` 일관성 오류

**증상**: 1위~10위 모든 후보에 `Low Priority` 표시. 분류 로직 미작동 또는 임계값 오류.

**조사 경로**:
1. recommendation_tier 산출 함수 위치 (점수 + 신뢰도 → tier 매핑)
2. 임계값이 너무 높게 설정되어 모두 Low로 떨어지는지 확인
3. tier 산출이 실제 호출되고 있는지 (default 'Low Priority'로 초기화만 되고 실제 매핑이 누락되었을 가능성)

**수정 기준**: 분포 백분위 기반으로 상위 20% Recommended, 20~50% Partial, 그 외 Low로 차등.

---

## BH-5. `mtn_recommendation: 'WATCH'` 일관성 오류

**증상**: 1위~10위 모두 WATCH. 강도 차등 부재.

**조사 경로**:
1. mtn_recommendation 결정 로직 위치 (BUY/WATCH/SKIP 분기)
2. baseDays<5는 자동 WATCH 상한이 적용되는지
3. 신뢰도 0.6 부근으로 좁게 갇혀서 모두 WATCH 구간에 떨어지는 부수효과 가능성

**수정 기준**:
- 점수 + 신뢰도 결합 임계값으로 BUY/WATCH/SKIP 분류
- baseDays<5 → 자동 WATCH 상한 (안전 가드)
- 결과적으로 후보 10개에 BUY·WATCH·SKIP이 합리적 비율로 분포

---

## BH-6. P3 Macro Regime 100점 만점 산출 로직 감사

**증상**: P3 = 100점. 만점이 *실제 지표* 기반인지 검증 필요.

**조사 경로**:
1. `lib/master-filter/compute.ts` Macro Regime 산출식의 입력 변수 목록:
   - M1 (FRED) — fetch 시점, 결측 대응
   - 달러지수 (FRED) — 동일
   - 구리/금 비율 (Yahoo) — 동일
   - 분산일 (자체 계산) — 25거래일 데이터 무결성
   - FTD (자체 계산) — 4% 조정 저점 후 4거래일차 +1.5% 대거래량 확인
2. 각 입력의 fetch 함수가 실패 시 어떤 fallback을 반환하는지 (특히 임의 기본값으로 만점 보정하는 코드 존재 여부)
3. Macro Regime 점수 합산 가중치가 어떻게 정의되어 있는지

**결함 유형 검증**:
- (a) 모든 입력이 정상 fetch되어 만점 산출 → 정당한 결과. Glossary `Regime Score`에 사용자 해석 가이드 보강
- (b) 일부 입력이 결측이지만 fallback으로 만점 보정됨 → **P0 버그** (BH-2와 동일 처리)
- (c) 산출식 자체가 입력에 둔감하여 항상 만점 영역에 떨어짐 → **P0 버그**

**완료 정의**:
- 모든 입력 fetch 함수가 결측 시 명시적으로 표시 (fallback 만점 금지)
- 산출식이 입력 변동에 반응하는지 단위 테스트 통과
- 만점 도출이 정당한 경우 Glossary 보강

---

## BH-7. 그 외 null 필드 일괄 점검

**대상**:
- `base_type` (VCP Standard vs High_Tight_Flag 분기)
- `macro_action_level` (시스템에서 보수적 75% 기본값 의존 여부)
- `high_tight_flag.passed: false`인데 객체 내부 필드가 채워진 경우 — Alex 지적 (회의록)

**원칙**:
- false 케이스에 무의미한 값을 채우는 모든 코드 위치를 찾아 명시적으로 null 또는 부재 라벨로 변경
- 정당한 결측만 명시적으로 표시 (예: 신생 종목 1년 미만, IPO 전후 데이터 부재)

---

## 실행 순서

1. **BH-1** (단위 오류) — 가장 시급, 데이터 신뢰성 토대 무너뜨림
2. **BH-2** (RS 복구) — 컨테스트 정량 신호의 1/4를 차지
3. **BH-6** (Macro Regime 감사) — 시스템 자기 신뢰성 검증
4. **BH-3, BH-4, BH-5** (일관성 오류 3종) — 라벨링 로직 통합 점검
5. **BH-7** (잔여 null 일괄)

---

## 회귀 검증

각 수정 후 다음 검증:
- [ ] 컨테스트 1회 재실행하여 후보 10개의 모든 필드 출력 확인
- [ ] null 필드 비율 < 5% (정당한 결측만)
- [ ] BUY/WATCH/SKIP 또는 Recommended/Partial/Low가 합리적 분포로 차등
- [ ] 신뢰도 분포 폭이 0.6 부근에서 확대됨 (예: 0.45 ~ 0.85)
- [ ] LLM 위원회 응답이 정량 점수의 결함을 자기 비판으로 반환하지 않음

---

**다음 sprint 작업 분량 추정**: 5~8 영업일 (감사 BH-6 포함)
