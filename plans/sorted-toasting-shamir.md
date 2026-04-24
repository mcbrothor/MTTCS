# MTN Master Filter UX 개선 플랜

## Context

UX 전문가 검토 의견 중 **수용 가능한 항목**과 **개발자 관점의 추가 제안**을 구현한다. 전체 레이아웃 재구성이나 모바일 재설계 같은 과설계는 제외하고, 비용 대비 효과가 확실한 접근성·신뢰성·일관성 개선에 집중한다.

현재 `app/master-filter/page.tsx`는 Next.js 16 + React 19 + Tailwind 4 구조이며, 핵심 컴포넌트는 `StatusCenter.tsx`, `MetricsGrid.tsx`, `InsightLog.tsx` 3개. 데이터 소스 메타(`DataSourceMeta`)와 sparkline(`ScoreSparkline`)은 이미 타입/컴포넌트 레벨에 존재하지만 UI 노출이 제한적이다.

**목표**: 트레이더가 (a) 데이터 신뢰도를 즉시 파악하고, (b) 색각 이상/스크린리더 사용자도 상태를 인지하며, (c) LLM 브리핑을 빠르게 스캔하고, (d) 데이터 장애 시 "최신"과 "이전 값 유지"를 구분할 수 있도록 한다.

---

## Wave 1 (병렬) — 기반 레이어

### 1-A. 숫자/시간 포맷 유틸리티
- **파일**: `lib/format.ts` (신규)
- **내용**: `formatScore(n)`, `formatPercent(n, digits=2)`, `formatVolume(n)`, `formatTimestamp(iso, mode='relative'|'absolute')`, `formatDelay(meta: DataSourceMeta)` 유틸 export
- **목적**: 전역 숫자·시간 표기 통일, 이후 Wave에서 재사용

### 1-B. 타입 확장
- **파일**: `types/index.ts`
- **변경**:
  - `AiModelInsight`에 `headline?: string`, `bullets?: string[]`, `cachedAt?: string` 추가 (옵셔널, 점진적 마이그레이션)
  - `MasterFilterMetrics`의 각 metric detail 타입에 `meta?: DataSourceMeta` 병합 (기존 `source` 필드 유지)
- **주의**: `MasterFilterResponse.meta: DataSourceMeta` 이미 `ApiSuccess<T>` 레벨에 존재 → 개별 지표 메타는 별도 필드로 분리

### 1-C. 상태 표시 공통 컴포넌트 (접근성)
- **파일**: `components/master-filter/StatusBadge.tsx` (신규)
- **내용**: `{ state: 'GREEN'|'YELLOW'|'RED', label?: string, size?: 'sm'|'md' }` 받아 아이콘(`CheckCircle2`/`AlertTriangle`/`ShieldAlert`) + 텍스트 레이블 + `role="status"` + `aria-label="상태: 안전"` 병행 렌더
- **대상**: `StatusCenter.tsx:92-123`, `MetricsGrid.tsx:54-58`의 색상 전용 표시를 본 컴포넌트로 교체

---

## Wave 2 (병렬) — UI 적용

### 2-A. 데이터 타임스탬프·지연 상시 노출
- **파일**: `components/master-filter/MetricsGrid.tsx` (`HelpButton` 근처 및 카드 헤더)
- **내용**:
  - 각 metric 카드 하단에 `🕐 15분 지연 · YH Finance · 2분 전` 형태 상시 뱃지 (툴팁 아닌 visible)
  - `lib/format.ts`의 `formatDelay`/`formatTimestamp` 사용
- **참조**: `MetricsGrid.tsx:159` `detail.source` 영역

### 2-B. 접근성 - 색상+아이콘+ARIA 병행
- **파일**: `StatusCenter.tsx`, `MetricsGrid.tsx`
- **내용**:
  - Wave 1-C의 `StatusBadge` 로 기존 색상 전용 표시 치환
  - `StatusCenter.tsx:145` P3 Score 블록에 `aria-label="P3 종합 점수 {score}점 만점 100점, 상태 {state}"` 부여
  - 키보드 포커스 스타일: `focus-visible:ring-2 focus-visible:ring-emerald-400` Tailwind 클래스 전역 적용

### 2-C. Fail-safe 상태 명시
- **파일**: `contexts/MarketContext.tsx:65-120`, `StatusCenter.tsx:205`
- **내용**:
  - `meta.fallbackUsed === true`이거나 `warnings.length > 0`일 때 StatusCenter 상단에 경고 스트립:
    - `⚠️ 데이터 소스 장애 - 최근 정상 값 표시 중 (마지막 갱신: {lastSuccessfulAt})`
  - `MarketContext`의 fallback 경로에서 `error` 외에 `isStale: boolean` 플래그 전파

---

## Wave 3 (순차) — LLM 영역 재구조화

### 3-A. LLM 브리핑 서버 응답 구조화
- **파일**: `app/api/master-filter/route.ts` (응답 가공 지점), `types/index.ts`
- **내용**:
  - LLM 호출 결과를 `{ headline, bullets: string[3], detail: string }` JSON으로 파싱
  - 프롬프트 템플릿 수정: "반드시 헤드라인 1줄, 핵심 포인트 3개 불릿, 상세 서술 순으로 응답"
  - 파싱 실패 시 기존 `insightLog` 문자열 fallback (하위호환)

### 3-B. InsightLog 요약/상세 토글 UI
- **파일**: `components/master-filter/InsightLog.tsx:40-244`
- **내용**:
  - `selectedInsight.headline` 을 큰 타이포로, `bullets` 는 체크리스트 스타일, `detail` 은 `<details>` 토글 내부
  - 파싱 실패 시 기존 `ReactMarkdown(insightLog)` 렌더 유지

### 3-C. LLM 응답 캐시 나이 뱃지
- **파일**: `InsightLog.tsx:172` (모델별 응답 카드)
- **내용**:
  - `aiModelInsight.cachedAt` 있으면 `🔄 2분 전 갱신` 뱃지, 없으면 `⚡ 실시간`
  - 캐시 계층이 아직 없다면 `route.ts`에서 응답 시각 기록해서 전달

---

## 제외 항목 (과설계/불필요로 판단)

- 상단 Market Snapshot 카드 전면 분리 → 정보 밀도 저하 우려
- 모바일 반응형 전면 재설계 → 데스크톱 도구 성격
- 모델 비교 "응답 길이/성공률 배지" → 품질 신호 아님
- Sparkline 신규 구현 → `StatusCenter.tsx:14-64` 에 이미 존재

---

## 검증 (Verification)

각 Wave 완료 후 다음으로 진행하기 전에 확인:

1. **Wave 1 완료 시**
   - `npx tsc --noEmit` 통과 (타입 확장 안정성)
   - `lib/format.ts` 함수 단위 스모크 테스트 (노드 REPL 또는 간이 테스트)

2. **Wave 2 완료 시**
   - `npm run dev` 후 `/master-filter` 방문
   - DevTools Lighthouse Accessibility 스코어 ≥95 확인
   - 의도적으로 API 실패시켜 fail-safe 스트립 노출 확인 (`.env`에 잘못된 FRED key 등)
   - 색약 시뮬레이터(Chrome DevTools Rendering → Emulate vision deficiencies)로 GREEN/YELLOW/RED 구분 가능 확인

3. **Wave 3 완료 시**
   - 실제 LLM 호출해서 headline/bullets/detail 파싱 성공 확인
   - LLM 프롬프트가 형식 어길 시 fallback 동작 확인 (헤드라인 없는 응답 강제 주입)
   - 캐시 나이 뱃지가 새로고침 시 갱신되는지 확인

---

## 수정 대상 파일 요약

| 파일 | 변경 유형 | Wave |
|---|---|---|
| `lib/format.ts` | 신규 | 1-A |
| `types/index.ts` | 필드 추가 | 1-B |
| `components/master-filter/StatusBadge.tsx` | 신규 | 1-C |
| `components/master-filter/MetricsGrid.tsx` | 수정 | 2-A, 2-B |
| `components/master-filter/StatusCenter.tsx` | 수정 | 2-B, 2-C |
| `contexts/MarketContext.tsx` | 수정 | 2-C |
| `app/api/master-filter/route.ts` | 수정 | 3-A, 3-C |
| `components/master-filter/InsightLog.tsx` | 수정 | 3-B, 3-C |

## 커밋 전략

Wave 단위로 1커밋 (총 3커밋):
1. `Add format utilities and accessibility primitives`
2. `Surface data freshness and fail-safe state on master filter`
3. `Structure LLM briefing with headline/bullets/detail and cache age`
