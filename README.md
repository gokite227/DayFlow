# DayFlow

목표를 세우고 실행하며, 계획이 무너져도 다시 돌아오도록 돕는 Goal & Recovery Coach.

## 현재 상태

모노레포와 Web skeleton이 구성되어 있습니다. Web의 /에는 실행 확인 화면만 있으며,
제품 기능, API, DB, 인증 연결은 아직 없습니다.

## 문서 기준

- [requirements.md](docs/requirements.md): 구현 Source of Truth
- [prototype.html](docs/prototype.html): 이후 화면 구현의 UI/UX 기준
- [product-spec.md](docs/product-spec.md): 제품 철학
- [AGENTS.md](AGENTS.md): AI 작업 규칙

## 구조

| 경로 | 목적 |
| --- | --- |
| apps/web | Next.js App Router Web skeleton |
| apps/mobile | Expo 모바일 앱 예정 위치 |
| services/api | Java/Spring Boot API 예정 위치 |
| packages/domain | 공통 도메인 타입과 규칙 |
| packages/schemas | 공유 검증 schema |
| packages/api-client | OpenAPI client와 query helper |
| packages/design-tokens | 공통 디자인 토큰 |
| packages/analytics | 이벤트 계약 |
| infra | 개발·배포 인프라 |
| docs | 요구사항과 프로토타입 |

services/api와 infra는 .gitkeep으로 빈 디렉터리를 보존합니다.
services/api와 infra는 pnpm 패키지가 아닙니다.

## 개발 도구

- Node.js 24.x
- pnpm 11.19.0
- Turborepo: 루트 개발 의존성

저장소 루트에서 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

위 명령은 각 패키지에 정의된 스크립트를 실행합니다. Web에는 dev/build/lint/typecheck가
구성되어 있으며, 기능 테스트는 아직 없습니다. Web만 실행하려면
pnpm --filter @dayflow/web dev를 사용합니다.
자세한 구조와 직접 실행 검증 명령은 [Web README](apps/web/README.md)를 참고하세요.

### 설치 검증 상태

Turbo는 현재 공개 기간 정책을 만족하는 최신 안정 버전 2.10.12로 고정했습니다.
pnpm install --frozen-lockfile과 workspace 목록 확인이 성공했습니다.
minimumReleaseAgeStrict: true를 유지하며 공개 기간 예외는 추가하지 않았습니다.

이 검증 환경에서는 pnpm이 실행한 프로세스의 PATH에 node_modules/.bin이 없어
pnpm turbo --version 단축 명령이 실패했습니다. 아래 동등한 실행으로
설치된 Turbo 2.10.12의 정상 실행을 확인했습니다. 환경 설정은 변경하지 않았습니다.

```sh
node node_modules/turbo/bin/turbo --version
```
