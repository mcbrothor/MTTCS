# 쿨라매기 셋업 판단 근거 차트 설계

작성: 2026-09-05 · 상태: 검토·설계안 · 제품 기능 미구현

## 1. 결론과 권장 범위

구현 가능하다. 기존 MTN Pro 차트의 캔들·이평선·거래량·선·영역·마커를 재사용하고, **판정 엔진이 실제 사용한 조건·수치·기간을 동일 시세 스냅샷에 연결**한다. 첨부 화면은 현재 UI와 표시 문구를 확인하는 참고 자료로 사용했다. 첨부에 원본 OHLCV나 판정 기준일은 없으므로 MU·VRTX·AMGN의 실제 차트 근거를 복원했다고 주장할 수 없다.

권장 진입은 카드의 `근거 차트 보기` → 종목 상세 모달이다. 데스크톱에는 차트와 조건 목록, 모바일에는 차트 아래 조건 목록을 배치한다. 목록에는 차트를 모두 생성하지 않고 선택한 종목 하나만 렌더링한다.

1차는 Continuation Breakout을 대상으로 데이터 보존과 조건→차트 강조를 구현한다. 이후 EP·Super Breakout·과열 경고를 확장한다. 기존 셋업 판정식과 점수를 유지하면서 설명 가능성을 추가한다. 판정 임계값·조회봉 수 변경은 별도 전략 버전으로 다룬다.

## 2. 현행 구현에서 확인한 근거

| 확인 항목 | 현재 상태와 설계 영향 | 코드 위치 |
|---|---|---|
| 첨부 카드 | 셋업 아이콘은 장식이며 근거는 `evidence.slice(0, 4)` 문자열만 노출 | `app/(dashboard)/qullamaggie/page.tsx:424`, `:444` |
| 판정 결과 | 셋업·점수·피벗·기초 지표는 반환. 원본 봉·시점·근거 좌표는 없음 | `lib/finance/engines/qullamaggie-score.ts:15` |
| 실제 입력 | KIS/Toss→Yahoo fallback으로 봉을 확보하고 analysis만 반환 | `app/api/scanner/qullamaggie/route.ts:28`, `:103`, `:113` |
| 차트 재사용 | `initialData`, 패턴 focus, 선·영역·마커 지원 | `components/analysis/AnalysisChartContainer.tsx:31`, `components/analysis/LightweightChart.tsx:257` |
| 별도 차트 조회 | Yahoo 데이터로 재조회하므로 기존 판정 입력과 달라질 수 있음 | `app/api/price-history/[ticker]/route.ts:16` |
| 일일 저장 | 분석 결과 전체를 `raw`에 복사하고 목록 API도 `raw`를 반환 | `lib/daily-screeners/index.ts:416`, `app/api/scanner/snapshots/route.ts:43` |
| 기존 패턴 분석 | VCP 등 별도 엔진의 패턴이며 Qullamaggie의 판단 근거가 아님 | `app/api/market-data/route.ts:467`, `types/index.ts:575` |

기존 패턴 분석을 새로 실행해 쿨라매기 셋업을 설명하지 않는다. 쿨라매기 엔진의 계산 결과를 전용 adapter로 차트 annotation으로 변환한다. 기존 차트 렌더러는 재사용하되 데이터 출처는 분리한다.

## 3. 사용자 화면과 상호작용

### 카드와 상세 화면

- 카드에는 셋업명, 판정 시점의 `돌파 대기 / 피벗 도달·상회`, 주요 수치와 `근거 차트 보기` 버튼을 둔다. 기존 표 보기에도 같은 진입점을 제공한다.
- 상세 상단에 종목·셋업·Q점수·기준봉 날짜·장중/종가 확정 상태를 표시한다. 판정 시점 가격을 실시간 현재가와 혼동하지 않게 한다.
- 가격 차트에는 기본적으로 선택 베이스 박스, 피벗, 판정봉을 표시한다. 거래량은 별도 축을 쓴다.
- 조건 목록은 `필수조건`, `점수 기여`, `참고`, `경고` 역할을 표시하고 실제값·기준·충족/미충족/계산불가를 함께 제공한다. 미충족 가점도 숨기지 않는다.
- 조건을 누르면 연결된 구간·선·점을 강조하고 필요한 날짜 범위를 보여준다. 선택 해제 시 직전 전체 보기를 복원한다. 반복 선택으로 사용자 줌을 초기화하지 않는다.
- MVP는 조건→차트 선택을 지원한다. 차트의 번호 마커→조건 선택은 후속 단계다. 키보드·터치로 같은 정보에 접근 가능해야 한다.
- `왜 이 베이스인가`를 펼치면 10·15·20·30·45봉 후보별 점수와 선택 이유를 비교한다. 해당 점수는 최종 Q점수와 별도임을 표시한다.
- `점수 상세`에는 6개 항목 가중 기여도, Super 보너스, 점수 상한을 표시한다. Q점수를 성공확률로 표기하지 않는다.
- 손절·진입·3R은 `리스크 참고선` 옵션으로 구분한다. 기본 판단 근거 위에 모두 겹쳐 표시하지 않는다.

첨부 값의 표시 예시는 MU `피벗 대비 +2.69% → 피벗 상회`, VRTX `−2.52% → 돌파 대기`, AMGN `−2.19% → 돌파 대기`다. 이는 첨부 숫자에 대한 UI 해석이며 최신 시세 확인이나 돌파 이벤트 확정이 아니다.

### 차트에 연결할 근거

| 항목 | 차트 표현 | 정확한 의미 |
|---|---|---|
| 선택 베이스 | 시작·끝 날짜, 최고·최저가를 갖는 반투명 박스 | 마지막 분석봉을 제외한 선택 b봉 |
| 피벗과 거리 | 베이스 최고가 수평선, 판정 종가 마커, 선택 시 허용 범위 | BREAKOUT은 −6%~+6%도 후보에 포함 |
| 선행 상승 | 선행 최저가 봉과 피벗 봉을 표시하고 측정 구간 연결 | 베이스 이전 최대74봉 최저가→베이스 최고가 |
| 거래량 감소 | 기준 구간·최근 구간 음영과 각 평균선 | 베이스 최근 최대8봉 평균 / 베이스 이전 최대34봉 평균 |
| 전후반 저점 지지 | 두 반구간과 각 최저가 마커, 허용 기준선 | 후반 최저가 ≥ 전반 최저가 × 0.98 |
| 추세 | MA10/20/50 및 판정봉 값 | 실제 추세 점수 구성 조건 표시 |
| 유동성 | 거래량·거래대금 수치와 가격 기준 | 차트 위치만으로 설명이 부족하므로 조건 목록 병행 |

거래량 감소와 전후반 저점 지지는 가점 요소다. 필수조건처럼 표시하지 않는다. 현재의 `베이스 내부 저점 상승 구조`는 `전후반 저점 지지`로 설명한다. 연속 스윙 저점을 검출하지 않으므로 임의 상승 추세선을 만들지 않는다.

## 4. 현행 판정식과 설명의 일치

마지막 분석봉 인덱스를 t, 선택 베이스 길이를 b라 할 때 베이스는 `[t-b, t-1]`이다. 선행 구간은 `[max(0,t-b-74), t-b-1]`, 거래량 기준 구간은 `[max(0,t-b-34), t-b-1]`이다. `일`은 달력일 대신 거래봉 수로 설명한다. 원본 slice의 실제 길이를 저장하여 기간을 추정하지 않는다.

| 셋업 | 실제 조건 | 추가 시각화 |
|---|---|---|
| BREAKOUT | 선행 상승 US≥30% / KR≥20%, 베이스 range≤38%, pullback≤38%, 피벗 거리 −6%~+6%, 추세점수≥65, 유동성 통과 | 베이스·측정 구간·피벗·이평선 |
| EP | 갭 US≥10% / KR≥6%, RVOL≥3, 종가 위치≥55%, 종가≥MA20, 유동성 통과 | 전일 종가↔시가 갭, 당일봉, 이전20봉 거래량 평균 |
| SUPER_BREAKOUT | EP AND (피벗 위 0~6% OR 조회 구간 고점 3% 이내) | 실제 통과한 OR 분기와 피벗/고점선 |
| PARABOLIC_WARNING | 5봉 수익률≥45% OR 10봉≥75% OR 20봉≥120% OR 종가>MA10×1.35 | 충족한 수익률 측정 구간 또는 MA10 이격 |

유동성은 가격·이전20봉 평균 거래량·20봉 평균 거래대금의 결합 조건이다. US는 각각 5달러·30만주·2천만달러, KR은 1천원·10만주·30억원이다. 평균 거래대금은 현재봉을 포함하며 RVOL의 분모는 현재봉을 제외한 이전20봉 평균이다.

베이스 후보 점수는 range 25% + pullback 20% + 거래량 감소 20% + 피벗 거리 25% + 전후반 저점 10%다. 후보별로 산출된 점수 중 최대값을 선택한다. 현재 순서와 안정 정렬에 의해 동점은 짧은 후보가 먼저 선택된다. `selectedBase`와 모든 유효 후보 점수를 저장한다.

최종 Q점수는 상승률 점수25% + 베이스25% + 피벗20% + 거래량15% + 추세10% + 촉매 프록시5%다. `primarySetup=SUPER_BREAKOUT`일 때 +8 후 100점 상한, 유동성 미달은 최대54, NONE은 최대39, 주 셋업이 PARABOLIC이면 최대49다. 기존 반올림·상한 적용 순서를 기록한다. `relativeStrength`는 현 엔진에서 벤치마크 상대강도가 아닌 절대 상승률 점수이므로 화면 설명도 이에 맞춘다.

주 셋업 우선순위는 SUPER → BREAKOUT → EP → PARABOLIC → NONE이다. 여러 셋업이 충족되면 `왜 이 셋업이 우선인가`를 제공한다. SUPER를 BREAKOUT 전체 조건 AND EP로 설명하면 잘못이다. 과열 플래그는 다른 셋업이 우선해도 별도 경고로 남긴다. EP의 뉴스·실적 원인은 엔진이 검증하지 않으므로 `가격·거래량 기준 EP 후보`로 설명한다.

## 5. 데이터 계약 제안

다음 타입과 endpoint는 신규 설계이며 현재 구현되어 있지 않다. 기존 `QullamaggieAnalysis`의 요약 필드를 유지하면서 목록에 `evidenceRef`를 추가한다. 문자열 `evidence`는 하위 호환 표시용으로 남기고 구조화 데이터에서 생성하도록 전환한다.

```ts
type EvidenceRef = {
  snapshotId: string | null;
  availability: 'ready' | 'legacy' | 'unavailable';
  asOfBarDate: string | null; // legacy 결과는 실제 기준봉 날짜가 없을 수 있음
};

type SetupEvidenceSnapshot = {
  schemaVersion: '1';
  snapshotId: string;
  symbol: { ticker: string; exchange: string; currency: string };
  provenance: {
    engineVersion: string;
    paramsHash: string;
    provider: string;
    adjustment: 'adjusted' | 'unadjusted' | 'unknown';
    timeframe: '1d';
    exchangeTimezone: string;
    asOfBarDate: string;
    calculatedAt: string;
    barStatus: 'closed' | 'partial' | 'unknown';
    barsHash: string;
    barCount: number;
  };
  bars: OHLCData[];
  analysis: QullamaggieAnalysis;
  decision: {
    primarySetup: QullamaggieSetup;
    matchedSetups: QullamaggieSetup[];
    selectedBranchIds: string[];
    selectedBaseId: string | null;
    selectionReason: string;
  };
  baseCandidates: BaseEvaluation[];
  criteria: SetupCriterion[];
  annotations: SetupAnnotation[];
  scoreTrace: ScoreContribution[];
};

type SetupCriterion = {
  id: string;
  setup: QullamaggieSetup;
  role: 'required' | 'score' | 'context' | 'warning';
  result: 'pass' | 'fail' | 'unknown';
  actual: number | boolean | null;
  rule: RuleExpression; // 구조화한 AND/OR, 비교 연산자, 임계값, 단위
  inputs: MetricInput[]; // 실제 비교에 사용한 정밀도·기간·평균값
  annotationIds: string[];
};
```

위 타입은 핵심 계약을 설명한 초안이며 `BaseEvaluation`, `RuleExpression`, `MetricInput`, `ScoreContribution`의 구체 타입은 구현 때 정의한다. 각 입력에는 날짜 범위, 실제 봉 수, 값, 단위, 계산식 식별자·반올림 규칙을 둔다. 조건 상태는 UI가 표시 문자열이나 반올림된 화면값에서 다시 판정하지 않고 엔진의 실제 비교 결과를 사용한다. 결측 지표에 적용하는 기존 점수 기본값도 trace에 보존한다. 예를 들어 126봉 이하의 6개월 수익률은 null이지만 `scoreThreshold(null)=35`로 계산하므로 `계산불가` 표시와 점수 계산용 기본값을 구분하고 임의로 0점 처리하지 않는다.

`SetupAnnotation`은 식별자·criterionId와 함께 `price-line`, `price-zone`, `price-marker`, `volume-window`, `volume-average`의 판별 가능한 union으로 정의한다. 가격 annotation은 date/price, 거래량 annotation은 date/volume을 사용한다. 기존 `ChartPatternOverlay`의 `confidence`에 Q점수를 억지로 넣지 않는다. 공통 렌더링 모델로 변환하는 adapter를 추가한다.

max/min 봉이 여러 개면 결정적인 anchor 규칙을 사용하고 해당 규칙을 버전 관리한다. 기준값은 유지하면서 모든 동률 봉을 보조 표시하거나 대표 봉 선택 이유를 제공한다. 인덱스는 진단에만 쓰고 저장·차트 연결은 정규화된 거래일로 한다.

## 6. 생성·저장·조회 흐름

```text
시세 조회 + 공급자/조정 기준 메타데이터
  → 입력 검증·거래일 정규화
  → 동일 OHLCV로 셋업·조건·점수 trace 계산
  → annotation 생성 및 범위 검증
  → 불변 evidence snapshot 저장
  → 목록 응답: 기존 요약 + evidenceRef
  → 사용자가 근거 차트 선택
  → snapshot 상세 조회 → 동일 bars + annotations 렌더링
```

목록의 기존 `{ results: [{ ticker, success, data }] }` 형식을 유지한다. OHLCV 전체를 `data`에 넣으면 `raw` 복사를 통해 DB와 500종목 목록까지 커질 수 있으므로 요약에는 참조만 담는다. 기존 일일 스캐너 정규화·worker 저장 경로가 참조를 보존하도록 연결한다.

제안 endpoint는 인증된 `GET /api/scanner/qullamaggie/evidence/{snapshotId}`다. 반환은 `{ snapshot }`, snapshot은 위 계약을 포함한다. 기존 인증·오류 envelope에 맞추고 401/403, 404, 만료된 경우 410을 구분한다. URL 종목만 바꿔 다른 snapshot을 얻을 수 없도록 권한 범위 및 식별자를 검증한다. 시세 재조회가 아니라 저장된 snapshot 조회를 수행한다.

저장은 전용 evidence 레코드에 분석·조건과 입력 봉을 함께 보존하는 방식을 권장한다. 중복 봉은 후속 단계에서 content hash로 분리 가능하다. 캐시 키에는 snapshotId뿐 아니라 엔진·파라미터·종목·거래소·조정 기준·봉 내용 hash를 반영한다. 같은 종목·같은 날짜라도 장중 봉이 바뀌면 새 snapshot이다. hash는 동일성을 확인하는 수단이며 원본 데이터 자체를 대신하지 않는다.

일일 후보의 `run_id`만 immutable ID처럼 사용하면 안 된다. 현재 강제 재실행은 동일 run의 후보를 삭제하고 재생성한다(`app/api/cron/daily-screeners/route.ts:100`, `scripts/local-llm-worker.mjs:1062`). 증거 snapshot은 독립 ID로 보존하고 보존기간·용량 정책을 명시한다. 운영 보존기간은 기존 후보 보존정책과 실제 저장량 측정 후 정하며 이 설계 단계에서 DB 정책을 변경하지 않는다.

snapshot 저장 실패 시 셋업 결과와 `unavailable` 상태를 반환할 수 있으나 잘못된 상세 링크를 생성하지 않는다. 저장과 참조 생성의 원자성을 보장한다. 실패 원인과 데이터 완전성을 로깅한다.

## 7. 기존 차트에 필요한 변경

| 변경 대상 | 설계 |
|---|---|
| `LightweightChart` 인스턴스 생명주기 | 차트 생성·제거와 annotation 변경을 분리. focus마다 `remove → createChart → fitContent` 반복 방지 |
| 좌표계 | 가격/거래량 pane을 명시. 현재 가격 좌표 변환으로 volume annotation을 그리지 않음 |
| 기간 선택 | 모든 근거 앵커를 포함하는 표시 범위 계산. 범위 밖 날짜를 첫/마지막 봉으로 치환하지 않음 |
| 지표 | 원본 전체 봉에서 이평선을 계산한 후 표시 구간만 잘라 warm-up 손실 방지 |
| 포커스 | `focusedCriterionId → annotationIds + dateRange` 지원. 기존 patternId focus와 구분 |
| 상세 컨테이너 | snapshot 로드 후 `initialSource="mtn"`, `initialData=snapshot.bars`로 mount. 근거 모드에서 자동 Yahoo 재조회 금지 |
| 모바일 | 차트 높이 반응형, 한 차트만 mount, 목록 아래 배치, 긴 라벨 축약+상세 제공 |

Lightweight Charts 5.2.0이 로컬에 설치되어 있다. 기존 SVG overlay를 확장하는 접근이 가장 작으며, 확대/축소 동기화와 거래량 pane 구현에 맞춰 series/pane primitives를 사용할 수 있다. 공식 5.2 문서는 [series primitives](https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives)와 [series markers](https://tradingview.github.io/lightweight-charts/docs/api/functions/createSeriesMarkers)를 제공한다. 새 차트 라이브러리 도입은 필요하지 않다.

## 8. 데이터·표시 예외 정책

- **기존 snapshot:** 원본 봉과 근거가 없으면 `이전 결과는 차트 근거 미보관` 표시. 사용자가 재분석하면 새 기준일·새 점수로 보여주며 예전 결과의 증거로 취급하지 않는다.
- **시점:** `calculatedAt`은 작업 시간, `asOfBarDate`는 판정봉 날짜다. 현재 `priceAsOf = new Date()`를 판정 기준봉 날짜로 쓰지 않는다. 최종봉 확정 여부를 확인하지 못하면 `unknown`으로 표시한다.
- **데이터 불일치:** 공급자·조정 기준·barsHash 불일치 시 overlay 표시를 중단하고 저장 snapshot을 다시 요청한다. 최신 시세를 겹쳐 보여줄 때도 과거 판정과 별도 상태로 구분한다.
- **입력 품질:** 날짜 중복/역순, 비정상 OHLC 관계, 결측/음수 거래량, 잘못된 날짜를 검증한다. 판정 입력을 변경하는 정규화는 엔진과 차트에 똑같이 적용하고 버전·정책을 남긴다. 계산 불가능한 조건은 통과로 취급하지 않는다.
- **조회 구간 고점:** 현재 180봉 요청과 최대252봉 고점 계산이 혼재한다. 252봉 미만이면 `조회 N봉 고점`으로 표시한다. 252봉 보장으로 전략을 바꾸는 것은 별도 작업이다.
- **돌파 상태:** 피벗 도달/상회는 실제 과거 돌파 순간 검출과 다르다. 과거 종가·장중 고가 교차 검증 없이 `돌파 확정` 마커를 임의 생성하지 않는다.
- **리스크 선:** 실제 `stopPrice`는 ADR과 구조 stop 조합이므로 베이스 최저가와 같다고 표시하지 않는다. `stop < entry < target` 관계가 유효하지 않으면 3R 영역을 그리지 않고 수치 확인 상태를 표시한다.
- **경고:** 과열·데이터 부족·촉매 미확인 경고는 주 셋업이 다른 유형이어도 유지한다. 점수는 확률이나 수익 보장이 아니다.

## 9. 구현 Wave와 인수 기준

| 단계 | 병렬 작업 | 다음 단계 진입 조건 |
|---|---|---|
| 1. 증거 계약 | 엔진 trace·베이스 후보 기록 / 입력 metadata·snapshot 저장 | 기존 셋업·점수 동일, 모든 좌표가 같은 봉에서 재현됨 |
| 2. Breakout MVP | snapshot 상세 API·일일 경로 / annotation adapter·상세 UI | 카드→동일 snapshot→조건 강조까지 연결, 모바일 포함 검증 |
| 3. 확장 | EP·SUPER·과열 설명 / 베이스 비교·점수 상세 | AND/OR·우선순위·경고가 엔진 결과와 일치 |
| 4. 도입 | 성능·접근성·회귀 검증 → 기능 플래그로 적용 | 아래 인수 기준 통과 후 노출 확대 |

인수 기준:

1. 기존 입력 fixture에 대해 primarySetup, flags, qScore, 피벗 등 판정값이 변경되지 않는다.
2. 베이스가 마지막 분석봉을 제외하고 정확히 b봉이며, 선택 후보·동점 처리·선행74/거래량34·최근8봉·RVOL20봉 비교가 직접 검증된다.
3. 모든 필수조건·가점에 실제 비교값·기준·결과가 있고 표시 반올림 때문에 판정 설명이 뒤집히지 않는다.
4. 조건 버튼마다 올바른 기간과 가격/거래량 좌표를 강조한다. 범위 밖 앵커를 잘못 이동하지 않는다.
5. 같은 snapshot을 다음 날 열어도 봉·셋업·근거가 같고, 강제 재스캔은 새 snapshot을 만든다.
6. 구버전·만료·저장 실패·장중·공급자 불일치의 UI 상태를 확인한다. 인증 endpoint를 실제 테스트 환경에서 호출한다.
7. 360px·데스크톱, 다크·라이트, 키보드·터치에서 조건 선택과 라벨이 겹치지 않는다.
8. 전체 목록 응답에 OHLCV가 포함되지 않고, 상세 선택 시 하나의 차트만 생성된다. 기존 목록 대비 전송량·렌더링 비용을 측정한다.
9. 관련 lint/typecheck/단위·통합·E2E를 실제 실행한다. 공용 차트 변경은 기존 VCP·일반 종목 차트도 회귀 검증한다.

## 10. 이번 검토의 검증 범위

- 쿨라매기 엔진 기존 테스트: BREAKOUT, SUPER/EP, PARABOLIC의 3사례 통과.
- `tests/chart-overlay-focus.test.mjs`, `tests/chart-time.test.mjs`, `tests/daily-scanner-snapshot.test.mjs` 실행 통과.
- 설치된 `lightweight-charts` 5.2.0 타입과 공식 문서에서 annotation 확장 지원 확인.
- 설명용 화면 예시는 가상 봉을 사용하는 UI 목업이다. 실제 MU 시세나 판정 결과 재현 테스트가 아니다.
- 제품 코드·DB·전략 파라미터는 변경하지 않았다. 신규 endpoint 통합, 실제 공급자 연결, 전체 빌드·전체 E2E는 구현 단계 검증 대상으로 남는다.
