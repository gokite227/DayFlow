# DayFlow Web

Next.js App Router + TypeScript strict + Tailwind CSS 4 skeleton.
현재 /에는 실행 확인 화면만 있습니다. 제품 기능과 API 연결은 없습니다.

## 실행

저장소 루트에서 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @dayflow/web dev
pnpm --filter @dayflow/web typecheck
pnpm --filter @dayflow/web lint
pnpm --filter @dayflow/web build
pnpm --filter @dayflow/web start
```

start는 production build 이후 사용합니다. typecheck는 Next.js route type을
생성한 뒤 TypeScript 검사를 실행하므로 새 checkout에서도 사용할 수 있습니다.

## 구조

- app/: route, layout, 전역 CSS. 이후 feature 화면을 조합합니다.
- components/: 여러 feature가 함께 사용하는 UI.
- features/goals, days, calendar, review, today/: 이후 구현할 feature별 화면과 로직.
- lib/: 웹 공통 유틸리티와 어댑터.
- 비어 있는 디렉터리는 .gitkeep으로 보존합니다. 구현이 생기면 제거합니다.

구현 기준은 ../../docs/requirements.md, UI/UX 기준은
../../docs/prototype.html입니다. 현재 색상 일부만 프로토타입에서 가져왔으며
전체 UI 이식과 공유 design-tokens 패키지 연결은 후속 작업입니다.

## Codex Windows runtime에서 검증

PATH / Path 중복으로 binary 탐색이 실패하면 설정을 바꾸지 않고
apps/web에서 아래 직접 실행을 사용합니다.

```sh
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node node_modules/next/dist/bin/next build
node node_modules/next/dist/bin/next dev
```

Next.js의 agentRules 자동 파일 생성은 비활성화합니다. 프로젝트 작업 규칙은
루트 AGENTS.md로 관리하며, 이 옵션은 PATH 문제와 무관합니다.

ESLint의 간접 의존성 unrs-resolver는 배포된 플랫폼 바이너리를 사용하고,
설치 스크립트는 workspace allowBuilds에서 명시적으로 차단합니다.
ESLint 9는 지원 종료 경고가 있으나 현재 Next ESLint 플러그인의 peer 범위에
맞춰 사용합니다. ESLint 10 전환은 관련 플러그인 호환성 확보 후 검토합니다.
