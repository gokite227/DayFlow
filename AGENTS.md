# DayFlow 프로젝트 규칙

## 문서와 제품 기준
- 구현 Source of Truth는 docs/requirements.md다. 해당 요구사항과 Acceptance Criteria를 먼저 읽는다.
- 화면 구현 시 docs/prototype.html의 UI/UX와 인터랙션을 기준으로 유지한다.
- docs/product-spec.md는 제품 철학과 문제 정의를 이해하는 보조 문서다. 기술·데이터·범위가 충돌하면 requirements.md를 우선한다.
- 기존 docs 파일은 명시적인 수정 요청 없이 변경하지 않는다.
- 제품은 Goal → Day → Focus → Review → Recovery → Next Plan을 연결한다. 시간 엄수나 스트릭보다 실행과 복귀를 우선한다.

## 작업 범위
- 현재 저장소는 모노레포 골격 단계다. 기능·프레임워크 초기화는 별도 요청이 있을 때 진행한다.
- 요청받지 않은 Goal/Day/Calendar 기능, DB 스키마, Spring Boot 비즈니스 로직을 선행 구현하지 않는다.
- 의존성은 현재 작업에 필요한 최소한만 추가한다. 미래 기능을 이유로 미리 설치하지 않는다.
- 기존 사용자 변경을 덮어쓰거나 되돌리지 않는다.
- 문제가 발생하면 원인과 영향을 설명한다. 버전 변경, 보안 설정 완화, 기능 생략 등으로 임의 우회하지 않는다.

## 구조와 경계
- apps/mobile: Expo 모바일 앱 예정 위치. OS 기능은 네이티브 모듈로 분리한다.
- services/api: Java/Spring Boot API 예정 위치. Java 빌드는 pnpm workspace와 별도로 구성한다.
- packages/domain: UI에 의존하지 않는 도메인 타입과 규칙.
- packages/schemas: 공유 입력/출력 검증.
- packages/api-client: Spring OpenAPI 기반 생성 client와 query helper. 생성 코드는 직접 수정하지 않는다.
- packages/design-tokens: 색상·간격·타이포그래피 토큰.
- packages/analytics: 이벤트 이름과 payload 계약.
- infra: 개발·배포 인프라 설정.
- Web과 Mobile의 화면을 강제로 공유하지 않는다. domain, schemas, API 계약, tokens, events를 공유한다.
- 서버 상태는 TanStack Query, 일시적 UI 상태는 Zustand, 모바일 영속 상태는 SQLite로 분리한다. 해당 단계 전에는 이 도구들을 설치하지 않는다.

## 향후 구현 원칙
- TypeScript는 strict 모드를 사용한다. 서버에서도 권한과 입력을 검증한다.
- 날짜와 UTC timestamp를 구분하고 사용자 timezone과 주 시작 요일을 명시적으로 처리한다.
- 오프라인 변경에는 operation ID, 데이터 수정에는 version 정책을 적용한다.
- OS 앱 선택 raw token은 기기 로컬에만 저장한다. 인증 정보·API key·민감 payload를 저장소나 로그에 남기지 않는다.
- Recovery는 규칙 기반으로 먼저 구현한다. AI는 근거 있는 제안만 생성하고 사용자 승인 후 적용한다.

## 검증과 보고
- 변경 범위에 맞는 검증을 실행한다. 존재하지 않는 테스트를 통과했다고 보고하지 않는다.
- 현재 하위 패키지에는 실행 스크립트가 없다. Turbo의 0개 작업 성공은 기능 테스트 성공이 아니다.
- 기능 구현 시 요구사항 ID와 Acceptance를 테스트에 연결한다.
- API 변경 시 필요한 migration, OpenAPI, 생성 client를 함께 갱신한다.
- Focus 변경은 simulator만으로 완료 처리하지 않고 실제 iPhone 검증 결과를 남긴다.
- 작업 후 생성·수정한 파일과 목적, 실행 명령과 성공/실패, 미검증 항목을 보고한다.
