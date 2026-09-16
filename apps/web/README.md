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

## 로그인 (AUTH-001~005)

- 비로그인 상태에서는 모든 route가 로그인 화면(`features/auth/login-view.tsx`)을 보여주고, 로그인 후 원래
  route로 돌아간다. `Google로 계속하기`는 PKCE verifier와 원래 route를 sessionStorage에 잠시 두고 API의
  `/api/v1/auth/google/start`로 이동한다. API는 `/auth/callback?code=…`로 돌려보내고, 이 페이지가 code를
  exchange한 뒤 URL을 교체한다(주소창에 token 없음).
- access token은 memory(`lib/auth/web-auth-session.ts`)에만 있다. refresh token은 API가 설정하는 HttpOnly
  cookie(`dayflow_refresh`, path `/api/v1/auth`)라 스크립트가 읽을 수 없다. 새로고침하면 refresh → `/me`로
  세션을 복원한다.
- 모든 API 호출은 `getDayFlowApiClient()`의 fetch wrapper로 `Authorization: Bearer`를 붙이고, 401이면
  refresh를 한 번(single-flight)만 한 뒤 원래 요청을 한 번 재시도한다. 실패하면 로그인 화면이 된다.
- Settings(`/settings`): avatar/이름/이메일과 로그아웃. 로그인·로그아웃·계정 변경 때 TanStack Query cache를
  비운다.
- 개발용 로그인: API를 `DAYFLOW_DEV_LOGIN_ENABLED=true`로 실행하고 Web에 `NEXT_PUBLIC_DAYFLOW_DEV_LOGIN=true`를
  주면 로그인 화면에 `개발용 로그인`이 나온다(Google credential 없이 같은 callback/exchange 흐름 확인용). 실제
  Google 로그인 확인 절차는 `infra/README.md`에 있다.

### Refresh cookie와 배포 (Vercel)

- `/api/v1/auth/exchange|refresh|logout`은 Web 자신의 origin으로 호출하고 `next.config.ts` rewrite가 API로
  proxy한다. production에서 Web(`*.vercel.app`)과 API(`*.up.railway.app`)는 서로 다른 site라 API origin의
  cookie는 third-party cookie가 되어 Safari/Firefox 기본 설정에서 막히기 때문이다. proxy를 거치면
  `dayflow_refresh` cookie가 Web origin의 first-party cookie(HttpOnly, Secure, SameSite=Lax)가 된다.
- Google 로그인 시작(`/api/v1/auth/google/start`)과 나머지 API 호출(Bearer token)은 API origin으로 직접 간다.
- rewrite 대상은 build 시점의 `NEXT_PUBLIC_DAYFLOW_API_BASE_URL`이다. 값을 바꾸면 다시 배포해야 한다.
- Vercel 설정(Root Directory `apps/web`, Corepack으로 pnpm 11)은 `infra/README.md`의 배포 절차를 따른다.

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
