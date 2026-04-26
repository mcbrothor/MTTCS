# MTN LLM 위원회 프롬프트 — SYSTEM-LIMITATION DISCLOSURE 헤더 초안

**작성**: MTN 시스템 개발자
**일시**: 2026-04-26
**대상 파일**: `app/api/contest/sessions/[id]/analyze/route.ts`
**목적**: 위원회(외부 LLM)가 MTN 정량 엔진의 구조적 한계를 인지하고, 자신의 전문 지식으로 갭을 채워서 평가하도록 프롬프트를 보강한다.
**근거**: SIR-2026-Q2-001 응답서 §1 — "시스템을 부풀리지 말고 LLM 위원회 프롬프트를 보강하라"

---

## 1. 적용 위치

기존 컨테스트 분석 프롬프트의 **시스템 메시지 또는 프롬프트 헤더 가장 앞**에 다음 블록을 삽입한다. 분석 컨텍스트(후보 종목 정량 점수)가 LLM에 전달되기 *전*에 노출되어야 한다.

---

## 2. SYSTEM-LIMITATION DISCLOSURE 블록 (한국어/영어 병기)

```
[SYSTEM-LIMITATION DISCLOSURE — 반드시 평가에 반영하라]

본 분석 입력에 포함된 MTN 정량 점수(VCP, RS, SEPA, Momentum, Technical Quality)는
다음과 같은 구조적 한계를 가지고 있으며, 이는 시스템 결함이 아니라
정량 엔진의 의도된 범위(scope)다. 위원은 자신의 전문 지식으로 아래 갭을
*반드시* 보강하여 평가하라. 보강 없이 정량 점수만으로 의견을 형성하지 말 것.

(L-1) SEPA 점수는 **가격 기반**이다.
      - Minervini의 9개 trend template 중 가격·이동평균 조건만 자동 평가됨.
      - EPS 컨센서스 리비전, 가이던스 톤, 백로그/매출 비율 등은 *반영되지 않는다*.
      - 위원의 의무: 후보 종목의 최근 분기 EPS surprise, 가이던스 변경 톤,
        펀더멘털 모멘텀(매출·마진 가속/감속)을 자체 지식으로 평가하여
        SEPA 결과의 신뢰도를 보강 또는 차감하라.

(L-2) RS는 **universe-relative proxy**이며 IBD Official RS Rating이 아니다.
      - 자체 구현: IBD Proxy(4분기 가중 수익률) + Mansfield RS + 유니버스 백분위
      - 위원의 의무: IBD Official RS와의 차이를 인지하고, 12M 가격 모멘텀이
        과열 영역(예: +500% 이상)일 경우 신뢰도를 차감하라.

(L-3) **Moat / 경쟁우위** 자동 평가가 없다.
      - 위원의 의무: 각 후보에 대해 Wide / Narrow / None Moat 분류와
        근거를 의견에 포함하라. ROIC 5년 추이, 매출 시장점유율, gross margin
        안정성을 자체 지식으로 평가할 것.

(L-4) **회계 품질·earnings quality** 점수가 없다.
      - Beneish M-Score, Altman Z-Score, Piotroski F-Score 미산출.
      - 위원의 의무: 자본재·인프라 종목의 백로그 회계, 풍력·태양광 일회성
        손실 재인식 가능성, 매출 인식 공격성에 대한 정성 평가를 포함하라.

(L-5) **이벤트 리스크 캘린더**가 없다.
      - 향후 30일 내 실적 발표, FDA 결정, 락업 해제, 주요 컨퍼런스 등
        이벤트 직전 진입 위험을 시스템이 표시하지 않는다.
      - 위원의 의무: 위원 자체 지식으로 향후 30일 이벤트 위험을 검토하고,
        이벤트 임박 종목은 신뢰도를 명시적으로 차감하라.

(L-6) **팩터 노출도 / Regime classifier**가 없다.
      - Fama-French 5팩터, Barra 팩터 노출은 산출하지 않는다.
      - Master Filter + Macro Regime은 거시 환경 점수일 뿐 momentum vs
        mean-reversion regime 분류기가 아니다.
      - 위원의 의무: 현재 시장이 momentum-favorable인지 mean-reversion-favorable
        인지 명시적으로 판단하고, 그에 따라 후보 평가를 조정하라.

(L-7) **테마 / 매크로 클러스터** 집중도 자동 경고가 제한적이다.
      - GICS Sub-Industry 단순 분류만 적용됨 (다음 sprint 도입 예정).
      - 위원의 의무: 후보 전체 리스트의 매크로 테마 분포(예: AI 데이터센터
        인프라, 에너지 전환, 비만 치료제 등)를 직접 판정하고, 단일 테마
        집중도가 50% 이상일 경우 명시적 경고를 의견에 포함하라.

[정량 점수의 메타 신뢰도]
- 정량 신뢰도(confidence)가 0.6 부근에 좁게 분포할 때 = 시스템이 자기 자신을
  못 믿겠다고 표시하는 상태이며, 위원의 펀더멘털 보강이 *결정적*이다.
- Macro Regime이 만점(100/100)에 가까울 때 = 평균 회귀 압력 가능성이 있으므로,
  위원은 만점 자체를 과열 신호로도 해석할 여지를 검토하라.
- baseDays<5인 종목은 stopPlan이 시스템에서 차단되어 있다 — 위원은 손절 기준선을
  자체 판단으로 제시하지 말고 "Base 미형성"임을 명시하라.

[평가 의무 요약]
1. 정량 점수 + 위 7개 갭의 정성 평가를 *결합*하여 의견을 형성할 것
2. 정량 점수만으로 BUY/WATCH/SKIP을 결정하지 말 것
3. 갭 평가 근거가 약하면 신뢰도(confidence)를 명시적으로 차감하여 표시할 것

(영문 요약 — for completeness)
The MTN quantitative engine has 7 structural limitations (L-1~L-7). Each
committee member must explicitly fill these gaps using their own expert
knowledge before forming an opinion. Do not form judgments from quantitative
scores alone. If gap-filling evidence is weak, lower the confidence score
explicitly.
```

---

## 3. 통합 가이드

### 3.1 기존 프롬프트 구조 점검

`app/api/contest/sessions/[id]/analyze/route.ts`의 현재 프롬프트는 다음 형태로 추정됨 (코드 미열람, 일반 패턴):

```typescript
const prompt = `
[5인 위원회 페르소나 정의]
당신은 D. Kim, S. Chen, A. Novak, M. Torres, J. Liu 5인의 위원으로...

[후보 종목 정량 데이터]
{candidates_json}

[평가 지시]
각 후보에 대해 rank, recommendation, confidence를 JSON으로 반환...
`
```

### 3.2 삽입 위치

```typescript
const prompt = `
${SYSTEM_LIMITATION_DISCLOSURE}   // <-- 이 블록을 헤더에 삽입

[5인 위원회 페르소나 정의]
...
`
```

### 3.3 상수 정의 권장 패턴

```typescript
// app/api/contest/sessions/[id]/analyze/route.ts 상단 또는 별도 모듈
const SYSTEM_LIMITATION_DISCLOSURE = `
[SYSTEM-LIMITATION DISCLOSURE — 반드시 평가에 반영하라]
...
` as const;
```

### 3.4 단위 테스트 권장

- 프롬프트가 실제로 LLM 호출에 포함되는지 컨테스트 1회 실행 후 응답 trace 확인
- LLM 응답에 L-1 ~ L-7 갭에 대한 언급이 포함되는지 회귀 테스트

---

## 4. 검증 (sprint 완료 시점에)

다음 4주차 재청취 회의 전에 컨테스트를 1회 재실행하고 응답 품질 변화를 점검:

| 검증 항목 | 기대 변화 |
|-----------|-----------|
| 위원회 의견에 펀더멘털 언급 빈도 | 증가 (L-1, L-2 효과) |
| Moat·회계 품질 정성 평가 등장 | 신규 등장 (L-3, L-4) |
| 매크로 테마 집중도 자체 경고 | 신규 등장 (L-7) |
| 신뢰도(confidence) 분포 폭 | 확대 (좁은 0.6 부근에서 벗어남) |
| 정량 점수 만점에 대한 비판적 해석 | 증가 (Macro Regime 과열 해석) |

---

## 5. 후속 sprint 검토 항목

- L-1 ~ L-7 갭 중 일부는 시간이 지남에 따라 *시스템 측에서도 일부 자동화 가능* (예: B-13 EPS surprise, B-12 GICS 클러스터)
- 자동화가 진행되면 본 DISCLOSURE에서 해당 항목을 단계적으로 제거하여 LLM에 부담을 줄임
- 자동화 ↔ LLM 위임의 경계는 분기 로드맵에서 정기 재검토
