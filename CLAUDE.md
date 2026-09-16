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

### User / Auth

DayFlow는 Google-first 멀티유저 서비스다(requirements §4.10, §8.7).

- 모든 계획 데이터(Goal/Day/Tag/Event/Category/Review/Recovery)는 User 소유다. repository 단계에서 `…AndUserId`/user 조건으로 범위를 제한하고, current User는 `CurrentUser`(access token)에서 가져온다. API 요청으로 owner userId를 받지 않는다.
- 다른 User의 id는 없는 id와 똑같이 응답한다(직접 조회·수정·삭제 404, 관계 연결 400). cross-user 관계를 만들지 않는다.
- Identity는 provider + stable subject(Google `sub`)다. 이메일로 User를 찾거나 병합하지 않는다.
- access token은 memory, refresh token은 Web HttpOnly cookie / Mobile expo-secure-store에만 둔다. URL·localStorage·AsyncStorage에 token 금지. DB에는 refresh token·exchange code hash만 저장한다.
- 새 User는 기본 Event Category 6개를 같은 transaction에서 받는다.
- 로그인/로그아웃/User 변경 시 TanStack Query cache를 비운다.
- 새 기능 테스트는 `AuthTestSupport`로 명시적인 User context에서 실행하고, 소유권이 걸린 기능은 다른 User 격리 테스트를 함께 둔다.

### Goal

Goal hierarchy:

YEAR → QUARTER → MONTH → WEEK

현재 기본 정책:

- 직접 parent는 바로 위 단계만 허용한다.
- 하위 Goal 기간은 기본적으로 parent 기간 안에 있어야 한다.
- Goal 기간은 자유 날짜 범위가 아니라 type별 canonical calendar period다(YEAR=연, QUARTER=분기, MONTH=월, WEEK=parent MONTH 안의 월요일 시작 주를 월 경계에서 자른 구간).
- Day를 Goal에 연결하는 경우 WEEK Goal만 허용한다. Day가 Goal을 갖지 않는 것도 정상이다(아래 Day 규칙).
- Goal progress는 그 Goal에 실제 연결된 Day만 계산한다.

이 정책을 변경해야 할 경우 임의로 바꾸지 말고 먼저 사용자에게 알려라.

### Day

Day status:

- NOT_STARTED
- IN_PROGRESS
- DONE
- DEFERRED
- SKIPPED

Day는 사용자가 실제로 해야 하는 모든 행동 / Task다.

- Day는 Goal 없이 존재할 수 있다. `goalId = null`은 정상 상태다.
- Goal을 연결하는 경우 반드시 WEEK Goal이다.
- Goal-linked Day는 해당 WEEK period validation을 따른다.
- Goal 없는 Day도 Days / Today / Calendar / Review / Recovery에서 1급으로 다룬다.

Day는 날짜 없이 존재할 수 있다.

`plannedDate = null`은 정상 상태다.

Day에는 계획 방식이 있다.

- FIXED
- WINDOW
- ANYTIME

Day priority는 저장은 기존 integer를 재사용하고 의미는 이름으로 다룬다: `0=NONE, 1=LOW, 2=MEDIUM, 3=HIGH`. priority(Task 자체의 중요도)와 coreDay(오늘 꼭 지키고 싶은 핵심 실행)는 다른 개념이다.

Day에는 사용자 정의 Tag를 여러 개 붙일 수 있다(Day와 Tag는 many-to-many). Tag는 생활/업무 영역이고 Goal은 장기 방향이라 서로 다른 축이며, Event Category와도 합치지 않는다.

시간을 지웠다고 Day를 삭제하면 안 된다. Goal 연결을 해제해도 Day를 삭제하지 않는다.

### Schedule

Day와 Schedule은 별도 entity다.

Day:
- 무엇을 할 것인가

Schedule:
- 언제 할 것인가

Day 1개당 schedule은 MVP 기준 0..1개다.

Calendar에서 Schedule 날짜를 변경하면 `Day.plannedDate`도 해당 날짜로 함께 맞춘다.

### Event

Event는 이미 시간이 정해져 있거나 사용자에게 일어나는 일정이며 Day와 별도 도메인이다.

- Event 종류는 고정 enum이 아니라 사용자 정의 Category다. `categoryId`는 nullable이고, Category를 삭제해도 Event는 남아 `미분류`가 된다.
- 삭제할 수 없는 강제 default Category는 두지 않는다.
- Event는 Day 상태·핵심 Day·Recovery 분류를 갖지 않는다.

### Recovery

- 정리 대상: 과거 plannedDate의 미완료 Day, 그리고 오늘 배치된 Day 중 `endAt`이 이미 지났고 완료되지 않은 Day. 오늘의 date-only Day는 하루가 끝나기 전에는 missed로 보지 않는다. Goal 없는 Day도 대상이다.
- action: KEEP / REDUCE / MOVE / CARRY_OVER / DROP. DROP은 삭제가 아니라 SKIPPED다.
- Goal 없는 Day의 MOVE는 오늘 또는 미래의 원하는 날짜로 보낼 수 있고 과거로는 보내지 않는다.
- CARRY_OVER는 과거 기록을 덮어쓰지 않고 미래 period에 새 Day/Goal을 만든다. 필요한 Goal은 자동 생성하지 않고 preview → 사용자 승인 후 만든다.
- 승계 관계는 Day/Goal의 self-reference로 직접 조회할 수 있어야 하고, 적용 이력은 recovery event로도 남긴다.
- 사용자가 이미 처리한 missed Day는 계획 값이 실제로 바뀌기 전까지 같은 배너로 반복 노출하지 않는다.

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
