# SKILL: 테스트 전략

## 로드 시점
테스트 신규 작성, 실패 테스트 수정, 무엇을 테스트할지 결정할 때.

---

## 테스트 선택 계층

충분한 신뢰를 주는 가장 낮은 비용의 테스트를 선택한다.

```
Unit        → 빠름, 격리됨, I/O 없음, 로직 단위 검증
Integration → 모듈 경계 검증, 실제 DB/파일시스템 사용 가능
E2E         → 전체 사용자 경로, 비용 높음, 최소한으로 사용
```

기본값: Unit 테스트.
Integration: 모듈 간 상호작용 자체가 리스크일 때.
E2E: 핵심 경로만 (auth, checkout, 데이터 제출).

---

## 테스트 대상

**항상 테스트:**
- public interface (구현 내부 아님)
- 엣지 케이스: 빈 입력, null/None, 0, 경계값
- 에러 경로: 의존성이 실패하거나 잘못된 데이터를 반환할 때
- Response contract: API를 소유하면 출력 shape을 assert

**테스트하지 않음:**
- private 내부 함수 (리팩토링이 테스트를 깨지 않아야 함)
- 서드파티 라이브러리 동작
- 로직 없는 단순 getter/setter

---

## 테스트 구조 (AAA)

```python
def test_checkout_applies_discount():
    # Arrange — 테스트 조건 구성
    cart = Cart(items=[Item(price=100)], user=User(tier="premium"))

    # Act — 테스트 대상 실행
    result = checkout(cart)

    # Assert — 결과 검증
    assert result.total == 90
```

테스트 하나당 동작 하나. 두 동작 → 두 테스트로 분리.

---

## 버그 수정 순서 (필수)

1. 버그를 재현하는 실패 테스트 작성
2. 테스트 오류가 아닌 올바른 이유로 실패하는지 확인
3. 코드 수정
4. 테스트 통과 확인
5. 전체 suite 실행 — 회귀 없음 확인

실패 테스트 없이 버그를 수정하지 않는다.

---

## Mocking 규칙

시스템 경계에서 mock한다. 시스템 내부에서 하지 않는다.

```
✓  HTTP client mock (외부 I/O)
✓  DB connection mock (외부 I/O)
✗  테스트 대상 모듈이 소유한 내부 helper mock
✗  로직과 무관하게 테스트를 통과시키는 mock
```

생성 비용이 낮으면 real object 우선.
상태를 가진 의존성은 mock보다 fake(인메모리 구현) 선호.

---

## Coverage

Coverage는 목표가 아니라 하한선이다.

| 범위 | 신호 |
|------|------|
| 60% 미만 | 중요 경로 누락 가능성 높음 |
| 60–80% | 대부분 모듈에서 적정 수준 |
| 80% 이상 | 핵심 경로 목표 (auth, 결제, 데이터 무결성) |
| 100% | 전체 추구할 가치 없음 |

Coverage 숫자를 채우기 위해 작성된 테스트는 없는 것보다 나쁘다.
