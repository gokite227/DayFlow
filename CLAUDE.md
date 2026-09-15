# DayFlow — Claude Code Instructions

## Source of Truth

문서 우선순위는 다음과 같다.

1. `docs/requirements.md`
   - 구현 요구사항과 기술 설계의 최우선 기준이다.
2. `docs/prototype.html`
   - UI / UX / interaction 기준이다.
3. `docs/product-spec.md`
   - 제품 철학과 사용자 경험 판단 기준이다.
4. `README.md`
   - 실행 방법 및 현재 저장소 구조 참고용이다.

문서 간 내용이 충돌하면 `requirements.md`를 우선한다.

---

## Product Principle

DayFlow는 단순한 Todo 앱이 아니다.

핵심 제품 루프:

Goal → Plan → Focus → Review → Recovery → Next Plan

핵심 제품 철학:

- Recovery > Streak
- Direction > Schedule Accuracy
- 계획이 무너졌을 때 사용자가 다시 목표로 복귀하도록 돕는다.
- Focus Lock은 목적이 아니라 실행을 돕는 장치다.
- Goal + Review + Recovery가 제품의 중심이다.
- AI는 사용자의 계획을 임의로 변경하지 않는다.
- AI는 근거 기반 proposal을 만들고 사용자가 승인한 뒤 적용한다.

---

## Development Rules

### General

- 한 번에 여러 Phase를 구현하지 않는다.
- 사용자가 요청한 범위만 수정한다.
- 관련 없는 refactoring을 하지 않는다.
- 문제 발생 시 우회하지 말고 원인을 먼저 진단한다.
- 빌드를 통과시키기 위해 보안 정책을 임의로 완화하지 않는다.
- dependency를 불필요하게 추가하지 않는다.
- 기존 `docs/*`는 명시적인 요청이 없는 한 수정하지 않는다.
- 구현 전에 기존 코드와 관련 요구사항을 먼저 읽는다.

### Code Quality

- 과도한 abstraction을 피한다.
- 읽고 설명하기 쉬운 코드를 선호한다.
- 특히 Java/Spring 코드는 백엔드를 공부 중인 개발자가 이해할 수 있는 구조를 유지한다.
- domain rule을 UI component 내부에 넣지 않는다.
- server state와 UI state를 중복 저장하지 않는다.
- 타입 안정성을 유지한다.
- validation은 UI에만 의존하지 않는다.

---

## Current Architecture

### Web

- TypeScript
- Next.js
- React
- Tailwind CSS
- TanStack Query (추후)
- Zustand (UI state에만 사용)

### Mobile

- Expo React Native
- Expo Router
- SQLite
- iOS Focus 기능은 Swift Native Module 사용

### Backend

- Java 21
- Spring Boot
- Spring Data JPA
- PostgreSQL
- Flyway
- Maven

### Shared

- `packages/domain`
- `packages/schemas`
- `packages/api-client`
- `packages/design-tokens`
- `packages/analytics`

---

## Domain Rules

### Goal

Goal hierarchy:

YEAR → QUARTER → MONTH → WEEK

현재 기본 정책:

- 직접 parent는 바로 위 단계만 허용한다.
- 하위 Goal 기간은 기본적으로 parent 기간 안에 있어야 한다.
- WEEK Goal 아래에서 Day를 만든다.

이 정책을 변경해야 할 경우 임의로 바꾸지 말고 먼저 사용자에게 알려라.

### Day

Day status:

- NOT_STARTED
- IN_PROGRESS
- DONE
- DEFERRED
- SKIPPED

Day는 날짜 없이 존재할 수 있다.

`plannedDate = null`은 정상 상태다.

Day에는 계획 방식이 있다.

- FIXED
- WINDOW
- ANYTIME

시간을 지웠다고 Day를 삭제하면 안 된다.

### Schedule

Day와 Schedule은 별도 entity다.

Day:
- 무엇을 할 것인가

Schedule:
- 언제 할 것인가

Day 1개당 schedule은 MVP 기준 0..1개다.

Calendar에서 Schedule 날짜를 변경하면 `Day.plannedDate`도 해당 날짜로 함께 맞춘다.

---

## UX Rules

- 사용자를 분 단위 계획 준수율로 평가하지 않는다.
- 계획보다 늦게 시작했다고 실패 처리하지 않는다.
- 하루 핵심 Day는 적게 유지한다.
- 미완료 Day를 무조건 다음 날로 이월하지 않는다.
- Recovery Day는 실패로 취급하지 않는다.
- Streak보다 Recovery Time을 중요하게 본다.
- 기본 화면은 단순하게 유지한다.
- 상세 Actual 데이터는 Review/Analysis에서 제공한다.

UI 구현 시 `docs/prototype.html`의 기존 UX와 스타일을 최대한 유지한다.

---

## AI Rules

AI Coach는 다음 순서를 따른다.

Observation
→ Evidence
→ Interpretation
→ Recommendation
→ User approval
→ Apply

AI가 Goal / Day / Focus Rule을 자동으로 삭제하거나 대량 수정하면 안 된다.

파괴적 변경은 항상 preview 후 사용자 승인을 받아야 한다.

---

## Testing Rules

모든 기능 작업 후 가능한 범위에서 다음을 확인한다.

- typecheck
- test
- lint
- build
- `git diff --check`

요구사항 ID가 있는 기능은 테스트와 연결하는 것을 우선한다.

예:

- `GOAL-001`
- `DAY-002`
- `REC-001`

---

## Git / Changes

- 사용자가 명시적으로 요청하지 않으면 commit하지 않는다.
- 기존 커밋을 amend / reset / rebase하지 않는다.
- 다른 개발자의 변경사항을 임의로 되돌리지 않는다.
- generated file이 자동으로 변경되면 실제 필요한 변경인지 확인한다.

---

## Before Coding

새로운 작업을 받을 때:

1. 관련 요구사항을 읽는다.
2. 현재 구현을 확인한다.
3. 요청 범위를 정의한다.
4. 필요한 최소 파일만 수정한다.
5. 테스트한다.
6. 변경점과 검증 결과를 보고한다.

설계가 애매하면 임의로 제품 결정을 하지 말고 사용자에게 알려라.

---

## Learning Support

이 프로젝트는 Java/Spring 학습도 병행한다.

Spring 또는 Java 코드를 구현한 뒤에는 가능하면 다음을 요약한다.

- 이번 코드에서 반드시 이해해야 할 Java/Spring 개념
- 각 주요 클래스의 역할
- 요청이 들어와 DB까지 가는 흐름
- 예상 면접 질문 2~5개
- 흔한 실수 또는 주의점

단, 학습 설명을 위해 실제 구현을 불필요하게 복잡하게 만들지 않는다.
