# MTN Master Filter — 컴포넌트 수정 지침서

> 대상 파일: `components/master-filter/` 하위 4개 파일  
> 우선순위: 🔴 즉시(버그) → 🟡 단기(신뢰도) → 🔵 중기(전략적 완성도)

---

## 🔴 즉시 수정 — 버그 (배포 전 필수)

### 1. `NavigatorWarningSystem.tsx` — React Hook 규칙 위반 수정

#### 문제
`RedAlertSystem`은 컴포넌트 내부에 선언된 일반 함수인데, 그 안에서 `useEffect`를 호출하고 있다.
조건에 따라 렌더링 여부가 달라지는 함수 안에서 훅을 사용하면 React의 "Rendered more hooks than previous render" 에러가 발생할 수 있다.

추가로, `useState(isVisible)` 선언 이후에 `if (!data) return null` early return이 있어 Hook 규칙을 위반한다.

#### 수정 지시

1. `isVisible` useState와 `useEffect`를 `NavigatorWarningSystem` 함수 **최상단**으로 이동한다.
2. `if (!data) return null` early return은 **모든 훅 선언 이후**로 내린다.
3. `RedAlertSystem` 내부 서브 함수에서 `useEffect`를 제거하고, 최상단으로 올린 `useEffect` 하나로 통합한다.

#### 수정 후 구조 예시

```tsx
export default function NavigatorWarningSystem() {
  const { data, bypassRisk, setBypassRisk } = useMarket();
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);

  const isRed = data?.state === 'RED';
  const isTargetPage = pathname.startsWith('/scanner') || pathname.startsWith('/trades');
  const showBlur = isRed && isTargetPage && !bypassRisk;

  // ✅ useEffect는 항상 최상단에, 조건은 내부에서 처리
  useEffect(() => {
    if (showBlur) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => document.body.classList.remove('overflow-hidden');
  }, [showBlur]);

  // ✅ early return은 모든 훅 선언 이후
  if (!data) return null;

  // 이하 렌더링 로직 ...
}
```

---

### 2. `InsightLog.tsx` — 불안정한 React key 수정

#### 문제
`renderText` 함수에서 key를 `index`와 텍스트 앞 12글자 조합으로 생성한다.
AI 답변이 "시장은 현재..." 같이 비슷한 문장으로 시작하면 key 충돌이 발생해 React reconciliation 오류가 날 수 있다.

```tsx
// ❌ 현재 코드
key={`${index}-${line.slice(0, 12)}`}
```

#### 수정 지시

`index`만을 key로 사용한다. `renderText`의 결과는 항상 동일한 텍스트를 같은 순서로 렌더링하므로 index key가 안전하다.
혹은 전체 라인 텍스트를 해시한 값을 key로 쓴다.

```tsx
// ✅ 수정 후
function renderText(text: string) {
  return text.split('\n').filter(Boolean).map((line, index) => (
    <p key={index}>{line}</p>
  ));
}
```

---

## 🟡 단기 개선 — 신뢰도

### 3. `StatusCenter.tsx` — 판단 근거 요약 배지 추가

#### 문제
GREEN/YELLOW/RED 상태만 표시하고, 왜 그 상태가 됐는지 근거가 전혀 없다.
`data.metrics` 안의 점수 데이터가 이 컴포넌트에서 전혀 활용되지 않는다.

#### 수정 지시

`StatusCenter` 하단 업데이트 시각 표시 영역 위에 지표 요약 배지 행을 추가한다.
표시할 항목: `trend`, `breadth`, `volatility`, `liquidity` 각각의 `status`(PASS/WARNING/FAIL)와 `label`.
P3 총점(`metrics.p3Score`)도 함께 표시한다.

```tsx
// 추가할 UI 예시
<div className="relative z-10 mt-3 flex flex-wrap justify-center gap-2">
  {[metrics.trend, metrics.breadth, metrics.volatility, metrics.liquidity].map((m) => (
    <span
      key={m.label}
      className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase
        ${m.status === 'PASS' ? 'border-emerald-500/40 text-emerald-300' :
          m.status === 'WARNING' ? 'border-amber-500/40 text-amber-300' :
          'border-rose-500/40 text-rose-300'}`}
    >
      {m.label} · {m.status}
    </span>
  ))}
  <span className="rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1 text-[10px] font-bold text-slate-300">
    P3 {metrics.p3Score ?? 0}/100
  </span>
</div>
```

---

### 4. `InsightLog.tsx` — 마크다운 렌더링 적용

#### 문제
`renderText`가 줄바꿈만 처리한다. AI가 `**굵게**`, `- 리스트`, `### 헤더` 등을 포함한 답변을 반환하면 마크다운 문법이 그대로 노출된다.

#### 수정 지시

1. `react-markdown` 패키지를 설치한다.
   ```bash
   npm install react-markdown
   ```
2. `renderText` 함수를 제거하고 `<ReactMarkdown>`으로 교체한다.

```tsx
// ✅ 수정 후
import ReactMarkdown from 'react-markdown';

// renderText 함수 삭제 후 아래로 교체
<div className="prose prose-invert prose-sm max-w-none text-slate-300">
  <ReactMarkdown>{visibleText}</ReactMarkdown>
</div>
```

---

### 5. `NavigatorWarningSystem.tsx` — bypassRisk를 sessionStorage에 persist

#### 문제
`bypassRisk`가 Context state로만 관리되어 페이지 새로고침 시 초기화된다.
RED 구간에서 "위험 인지" 버튼을 눌렀음에도 새로고침할 때마다 모달이 다시 표시된다.

#### 수정 지시

`MarketContext`(또는 `bypassRisk`를 관리하는 Context/hook)에서 `bypassRisk` 초기값을 `sessionStorage`에서 읽고, 변경 시 `sessionStorage`에 저장한다.
세션 단위(탭 닫으면 초기화)가 적절하다. `localStorage`를 사용하면 다음 날에도 유지되어 부적절하다.

```tsx
// MarketContext 또는 관련 훅 내부 수정 예시
const [bypassRisk, setBypassRiskState] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem('bypass_risk') === 'true';
});

const setBypassRisk = (value: boolean) => {
  sessionStorage.setItem('bypass_risk', String(value));
  setBypassRiskState(value);
};
```

---

### 6. `NavigatorWarningSystem.tsx` — "80% 확률로 실패" 문구 수정

#### 문제
근거 없는 고정 수치가 모달에 표시된다. 실제 백테스트 결과도, Minervini 공식 통계도 아니다.
사용자에게 잘못된 확신을 줄 수 있다.

#### 수정 지시

해당 문구를 근거 있는 정성적 표현으로 교체한다.

```tsx
// ❌ 현재
이 구간에서의 돌파 시도는 <strong className="text-rose-400">80% 확률로 실패</strong>합니다.

// ✅ 수정 후
이 구간에서의 돌파 시도는 <strong className="text-rose-400">대부분 실패로 끝납니다.</strong>
```

---

## 🔵 중기 개선 — 전략적 완성도

### 7. `MetricsGrid.tsx` — 차트에 기준선(Threshold Reference Line) 추가

#### 문제
`AreaChart`와 `LineChart`가 가격/지표 값만 그릴 뿐, 판단 기준이 되는 임계값이 시각적으로 표시되지 않는다.
예: "200일선 위/아래"가 핵심 기준인데 차트만 보면 현재 상태가 어떤지 바로 알 수 없다.

#### 수정 지시

`recharts`의 `ReferenceLine`을 import하여 각 차트에 임계값 기준선을 추가한다.
`detail.thresholdValue`(숫자형) 필드가 없다면 타입에 추가한다.

```tsx
import { ReferenceLine } from 'recharts';

// AreaChart 내부 예시
<AreaChart data={chartData}>
  <Area dataKey="close" ... />
  {detail.thresholdValue && (
    <ReferenceLine
      y={detail.thresholdValue}
      stroke="#f59e0b"
      strokeDasharray="4 2"
      label={{ value: '기준선', fill: '#f59e0b', fontSize: 10 }}
    />
  )}
  <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
</AreaChart>
```

---

### 8. `MetricsGrid.tsx` — p3Score 기여도 시각화

#### 문제
`p3Score` 총점만 표시되고, 어떤 지표가 몇 점을 깎았는지 알 수 없다.
점수의 구성이 보이지 않으면 어떤 지표를 먼저 개선해야 하는지 판단이 어렵다.

#### 수정 지시

P3 점수 섹션 아래에 지표별 기여도 바 차트를 추가한다.
각 `MasterFilterMetricDetail`의 `score`와 `weight`를 사용한다.

```tsx
// p3Score 섹션 아래에 추가
<div className="mt-4 space-y-2">
  {[metrics.trend, metrics.breadth, metrics.volatility, metrics.liquidity,
    metrics.ftd, metrics.distribution, metrics.newHighLow].filter(Boolean).map((m) => (
    <div key={m.label}>
      <div className="mb-1 flex justify-between text-[10px] text-slate-500">
        <span>{m.label}</span>
        <span className={m.status === 'PASS' ? 'text-emerald-400' : m.status === 'WARNING' ? 'text-amber-400' : 'text-rose-400'}>
          {m.score ?? 0}/{m.weight ?? 0}점
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${m.status === 'PASS' ? 'bg-emerald-500' : m.status === 'WARNING' ? 'bg-amber-500' : 'bg-rose-500'}`}
          style={{ width: `${m.weight ? Math.min((m.score / m.weight) * 100, 100) : 0}%` }}
        />
      </div>
    </div>
  ))}
</div>
```

---

### 9. `InsightLog.tsx` — AI 인사이트와 실제 metrics 교차 표시

#### 문제
AI가 생성한 텍스트 분석이 실제 `data.metrics` 수치와 일치하는지 사용자가 확인할 방법이 없다.
AI가 "시장이 양호하다"고 해도 실제 p3Score가 낮을 수 있다.

#### 수정 지시

InsightLog 카드 하단(Router Chain 위)에 "분석 시점 지표 스냅샷" 섹션을 추가한다.
`data.metrics`에서 핵심 수치 3~4개를 간략히 표시한다.

```tsx
// 추가할 섹션
{data?.metrics && (
  <div className="mt-4 border-t border-slate-800/70 pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
      분석 시점 지표 스냅샷
    </p>
    <div className="flex flex-wrap gap-2 text-[10px]">
      <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
        P3 {data.metrics.p3Score ?? 0}/100
      </span>
      <span className={`rounded border px-2 py-1 ${data.metrics.trend.status === 'PASS' ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'}`}>
        추세 {data.metrics.trend.status}
      </span>
      <span className={`rounded border px-2 py-1 ${data.metrics.breadth.status === 'PASS' ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'}`}>
        시장폭 {data.metrics.breadth.status}
      </span>
    </div>
  </div>
)}
```

---

### 10. `MetricsGrid.tsx` — SectorTable 모바일 대응

#### 문제
`min-w-[640px]`로 테이블 최소 너비가 고정되어 있어 모바일에서 가로 스크롤이 발생하고 중요한 섹터 정보를 놓칠 수 있다.

#### 수정 지시

모바일에서는 테이블 대신 카드 리스트 형태로 렌더링하는 반응형 구조로 변경한다.

```tsx
// SectorTable 내부를 반응형으로 교체
<div className="md:hidden space-y-2">
  {rows.map((row) => (
    <div key={row.symbol} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
      <div>
        <p className="text-xs font-bold text-white">{row.name}</p>
        <p className="font-mono text-[10px] text-slate-500">{row.symbol}</p>
      </div>
      <div className="text-right">
        <p className={`font-mono text-sm font-bold ${row.return20 >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {row.return20 > 0 ? '+' : ''}{row.return20.toFixed(2)}%
        </p>
        <span className={`text-[10px] ${row.riskOn ? 'text-emerald-400' : 'text-slate-500'}`}>
          {row.riskOn ? 'Risk-on' : 'Defensive'}
        </span>
      </div>
    </div>
  ))}
</div>

{/* 기존 테이블은 md 이상에서만 표시 */}
<div className="hidden md:block overflow-x-auto">
  {/* 기존 <table> 코드 유지 */}
</div>
```

---

## 수정 우선순위 요약

| 순위 | 파일 | 항목 | 중요도 |
|------|------|------|--------|
| 1 | `NavigatorWarningSystem.tsx` | Hook 규칙 위반 (useEffect, useState 위치) | 🔴 버그 |
| 2 | `InsightLog.tsx` | 불안정한 React key | 🔴 버그 |
| 3 | `StatusCenter.tsx` | 지표 요약 배지 추가 | 🟡 신뢰도 |
| 4 | `InsightLog.tsx` | react-markdown 적용 | 🟡 신뢰도 |
| 5 | `NavigatorWarningSystem.tsx` | bypassRisk sessionStorage persist | 🟡 신뢰도 |
| 6 | `NavigatorWarningSystem.tsx` | "80% 확률" 문구 수정 | 🟡 신뢰도 |
| 7 | `MetricsGrid.tsx` | 차트 기준선(ReferenceLine) 추가 | 🔵 전략 완성도 |
| 8 | `MetricsGrid.tsx` | p3Score 기여도 바 차트 | 🔵 전략 완성도 |
| 9 | `InsightLog.tsx` | metrics 교차 스냅샷 표시 | 🔵 전략 완성도 |
| 10 | `MetricsGrid.tsx` | SectorTable 모바일 반응형 | 🔵 전략 완성도 |
