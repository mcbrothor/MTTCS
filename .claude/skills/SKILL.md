---
name: mtn-safe-dev
description: MTN(Mantori's Trading Navigator) 프로젝트에서 바이브 코딩 중 기존 기능이 깨지는 리그레션, 버그 픽스 히스토리 추적 불가, 갑작스러운 앱 구동 오류를 방지하는 안전장치 워크플로우. 새 기능 추가, 버그 픽스, 리팩토링, API 연동 변경 등 코드 수정 작업을 요청받을 때마다 반드시 이 Skill을 먼저 실행하라. "고쳐줘", "추가해줘", "바꿔줘", "수정해줘" 같은 변경 요청에는 항상 이 Skill을 적용하라.
---

# MTN Safe Dev

바이브 코딩의 trial-and-error 사이클에서 기존 기능을 보호하고, 모든 변경의 흔적을 남기는 4단계 안전장치 워크플로우.

## 핵심 원칙

- **변경 전 기록, 변경 후 확인** — 코드를 건드리기 전에 먼저 스냅샷을 찍고, 건드린 후에는 반드시 체크리스트를 실행한다
- **히스토리는 자동으로** — 사람이 기억하는 대신 파일이 기억한다
- **롤백 명령어를 항상 명시** — 무언가 이상해지면 언제든 되돌릴 수 있어야 한다

---

## STEP 1 — 변경 전 스냅샷

작업을 시작하기 전에 반드시 실행한다.

### 1-1. 영향 파일 식별
변경 요청을 받으면 먼저 어떤 파일들이 영향을 받는지 명시한다:
```
변경 대상: src/pages/scanner.tsx
연관 파일: src/lib/sepa.ts, src/lib/vcp.ts, src/components/ScanTable.tsx
```

### 1-2. CHANGELOG.md에 작업 의도 기록
`CHANGELOG.md`가 없으면 프로젝트 루트에 생성한다. 작업 시작 전에 아래 포맷으로 먼저 기록한다:

```markdown
## [작업중] YYYY-MM-DD HH:MM

### 변경 의도
- 무엇을: (요청 내용 한 줄)
- 왜: (이유)
- 영향 파일: scanner.tsx, sepa.ts

### 체크포인트
- 작업 전 커밋: (git commit hash - 작업 후 채움)
```

### 1-3. Git 체크포인트 커밋
```bash
git add -A
git commit -m "checkpoint: before [작업 내용 한 줄]"
```

> **이 커밋이 롤백 포인트다.** 무언가 잘못되면 `git revert HEAD` 또는 `git reset --hard [이 커밋 hash]`로 되돌린다.

---

## STEP 2 — 임팩트 체크

코드를 수정하기 전에 영향 범위를 파악한다.

### 2-1. 연쇄 임팩트 열거
변경 파일이 import되거나 사용되는 모든 곳을 나열한다:
```
sepa.ts를 수정한다면:
  → scanner.tsx (스캔 결과 표시)
  → plan.tsx (신규 계획 SEPA 점수)
  → watchlist.tsx (관심종목 필터)
```

### 2-2. MTN 핵심 기능 체크리스트
작업 후 확인해야 할 항목을 미리 표시한다. 상세 체크리스트는 `references/checklist.md` 참조.

### 2-3. 위험도 평가
| 위험도 | 기준 | 대응 |
|--------|------|------|
| LOW | 단일 컴포넌트, UI 변경 | 해당 페이지만 확인 |
| MED | 공유 lib 함수 수정, API 파라미터 변경 | 연쇄 임팩트 전체 확인 |
| HIGH | 라우터 구조, 인증 로직, 데이터 스키마 변경 | 전체 탭 순서대로 수동 테스트 |

---

## STEP 3 — 구현 + 즉시 검증

### 3-1. 코드 변경 실행
변경을 최소 단위로 나눈다. 한 번에 여러 기능을 동시에 고치지 않는다.

### 3-2. 즉시 확인 (변경 직후)
변경 완료 직후 아래를 확인한다:

**브라우저 콘솔**
```
- TypeError / undefined 에러 없음
- API 호출 실패 없음 (Network 탭)
- React 렌더링 에러 없음
```

**임팩트 체크에서 열거한 페이지 직접 열어보기**
각 연쇄 임팩트 페이지를 브라우저에서 직접 열어 깨진 UI가 없는지 확인한다.

### 3-3. MTN 핵심 기능 리그레션 체크
`references/checklist.md`의 체크리스트를 실행한다.
위험도 HIGH인 경우 전체 항목을 순서대로 확인한다.

---

## STEP 4 — 히스토리 기록

### 4-1. CHANGELOG.md 완성
```markdown
## [완료] YYYY-MM-DD HH:MM

### 변경 내용
- 무엇을: SEPA 필터에 ROE 조건 추가
- 왜: 부채 높은 종목 걸러내기 위해
- 영향 파일: sepa.ts, scanner.tsx

### 체크포인트
- 작업 전 커밋: abc1234
- 작업 후 커밋: def5678

### 롤백 방법
\`\`\`bash
git reset --hard abc1234
\`\`\`

### 알려진 부작용
- 없음 / (있으면 기록)
```

### 4-2. Git 커밋 (의미 있는 메시지)
```bash
git add -A
git commit -m "feat(sepa): ROE >= 15% 조건 추가 — 부채 종목 필터링"
```

**커밋 메시지 포맷:**
```
[type]([scope]): [한 줄 설명] — [이유]

type: feat | fix | refactor | style | chore
scope: sepa | vcp | scanner | plan | watchlist | filter | risk | macro
```

---

## 긴급 롤백 가이드

앱이 갑자기 안 돌아갈 때:

```bash
# 1. 마지막 정상 커밋 확인
git log --oneline -10

# 2. 특정 커밋으로 되돌리기
git reset --hard [체크포인트 커밋 hash]

# 3. Vercel 재배포 (프론트엔드)
vercel --prod

# 4. 특정 파일만 되돌리기
git checkout [커밋 hash] -- src/lib/sepa.ts
```

---

## 참고 파일

- `references/checklist.md` — MTN 핵심 기능 리그레션 체크리스트 전체
- `references/scope-map.md` — MTN 파일별 역할 및 의존 관계 맵
