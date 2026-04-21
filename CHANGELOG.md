# CHANGELOG

MTN(Mantori's Trading Navigator) 프로젝트의 변경 이력을 기록합니다.

---

## [2026-04-21 22:00] - .claude 설정 동기화 및 워크플로우 정립

### 변경 내용
- 무엇을: .claude 폴더의 스킬 및 참조 파일들을 실제 프로젝트 구조(App Router, lib/finance)에 맞게 동기화
- 왜: AI 에이전트의 프로젝트 이해도 향상 및 `mtn-safe-dev` 워크플로우 활성화
- 영향 파일: `.claude/skills/SKILL.md`, `scope-map.md`, `checklist.md`, `CHANGELOG.md` (신규)

---

## [2026-04-20] - MTN 스캐너 최적화 및 안정화

### 주요 변경 사항
- **알고리즘 고도화**: RS Rating 폴백 메커니즘 안정화 및 DART 펀더멘털 데이터 연동 최종 완료.
- **버그 픽스**: RS 데이터 표시 버그 수정 및 추천 기준 완화로 후보군 발굴 성능 개선.
- **시스템 통합**: 스캐너 결과와 콘테스트(Contest) 워크플로우 자동 동기화 구현.
- **빌드 안정화**: `TradeHistoryTable`의 타입 에러(`Cannot find name Trade`) 해결 및 `getSepaEvidence` 타입 안전성 확보.

---

## [2026-04-19] - 라이브러리 모듈화 및 인증 시스템 개선

### 주요 변경 사항
- **구조 개선**: `lib/finance` 폴더로 금융 로직 모듈화 (sepa, vcp, risk-calc 등 분리).
- **인증 시스템**: Supabase RLS 정책과 어드민 인증 시스템 간 충돌 해결 (`getServerSession` 도입).
- **UI 통합**: CAN SLIM과 Minervini 스캐너의 UI를 통합하고 SEPA 전용 필터링 시스템 구축.

---

## [2026-04-17] - UI/UX 개선 및 배포 검증

### 주요 변경 사항
- **응답형 디자인**: 네비게이션 바 텍스트 잘림 현상 수정 및 모바일 대응 강화.
- **배포**: Vercel 프로덕션 빌드 및 배포 안정성 최종 확인.

---

## [2026-04-16] - 포트폴리오 리포트 및 전략 분석 강화

### 주요 변경 사항
- **리포트 기능**: 월간 리포트 내 자산군별 정렬 시스템 및 포트폴리오 비중 차트(Donut chart) 추가.
- **데이터 시각화**: PDF 리포트와 UI 간 데이터 일관성 확보.

---

## [초기 단계]

- MTN 프로젝트 기초 설계 및 기본 스캐닝 로직(Minervini Strategy) 구현.
- Supabase 기반 데이터베이스 연동 및 기본 대시보드 구축.
