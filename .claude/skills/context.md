# SKILL: 컨텍스트 관리

## 로드 시점
세션이 길어짐. 완료된 작업이 컨텍스트를 점유. 현재 상태 파악이 어렵거나 이미 완료된 작업을 반복할 위험이 있을 때.

---

## 압축 트리거

아래 중 하나라도 해당하면 압축한다:
- Wave가 완전히 완료되고 검증됨
- 파일이 디스크에 저장되고 곧 수정되지 않음
- 에러 trace가 해결됨
- 컨텍스트의 50% 이상이 완료된 (현재 활성 아닌) 작업

---

## 압축 형식

완료된 작업의 전체 내용을 아래 snapshot 블록으로 교체한다:

```
╔══ SESSION SNAPSHOT ════════════════════════════════╗
║ 프로젝트: [이름]                                    ║
║                                                    ║
║ [완료] wave_1 — auth.py, db.py, config.py          ║
║ [완료] wave_2 — api_routes.py, service.py          ║
║ [진행] wave_3 — routes ↔ service 연결 중           ║
║ [대기] wave_4 — e2e 테스트                         ║
║                                                    ║
║ 확정된 인터페이스:                                  ║
║   UserService.create(dto: UserDTO) → User          ║
║   POST /users → 201 {id, email, created_at}        ║
║                                                    ║
║ 미해결 이슈: 없음                                   ║
╚════════════════════════════════════════════════════╝
```

---

## 제거 vs 유지

| 내용 | 처리 |
|------|------|
| 디스크에 저장된 파일 전체 내용 | 제거 (파일이 디스크에 있음) |
| 해결된 에러 trace | 제거 (수정 요약만 한 줄 유지) |
| 대체된 중간 시도들 | 완전 제거 |
| 완료된 Wave 세부 내용 | 한 줄로 압축 |
| Interface contract | **유지** (하위 Wave가 의존) |
| 미해결 이슈와 blocker | **유지** (미해결 = 여전히 활성) |
| 확정된 결정과 그 이유 | **유지** (재논의 방지) |

---

## Interface Contract 형식

압축 시 인터페이스 계약을 아래 형식으로 보존한다:

```
# 함수
module.function(param: Type) → ReturnType

# HTTP
METHOD /path {request_body} → status {response_shape}

# 이벤트/메시지
EventName: {field: type, field: type}

# DB
table_name: (col type PK, col type, ...)
```

이것이 하위 Wave가 소스 파일을 다시 읽지 않고 진행하기 위한 최소 정보다.

---

## 재확장 (Re-expansion)

압축된 작업을 다시 봐야 할 때:
- 메모리로 재구성하지 말고 디스크에서 파일을 읽는다
- 현재 태스크와 관련된 섹션만 로드한다
- 변경 완료 후 다시 압축한다
