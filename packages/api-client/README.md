# @dayflow/api-client

Typed DayFlow API client for web and mobile, generated from the Spring Boot OpenAPI
document (`/v3/api-docs`). Spring DTOs are never rewritten by hand in TypeScript.

- Types: [openapi-typescript](https://openapi-ts.dev/) (dev only)
- Runtime: [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) (a small `fetch` wrapper)

## Structure

| Path | Kind | Notes |
| --- | --- | --- |
| `openapi/dayflow-api.json` | generated, committed | Exported OpenAPI 3.1 spec (sorted keys, LF) |
| `src/generated/schema.ts` | generated, committed | Never edit by hand |
| `src/client.ts`, `src/types.ts`, `src/index.ts` | hand-written | Client factory and named type aliases |
| `scripts/export-openapi-spec.mjs` | hand-written | Runs the Spring spec export |
| `test/contract.types.ts` | hand-written | Type-level contract checks run by `typecheck` |

Generated files are committed so the TypeScript workspace can typecheck and build
without Java or Docker, and so API changes show up as reviewable spec/type diffs
(requirements §14.1).

## Regenerate after an API change

Requires JDK 21 (`JAVA_HOME`) and a running Docker daemon. No API server is needed:
the export runs `OpenApiSpecExportTest` against a Testcontainers PostgreSQL.

```sh
pnpm --filter @dayflow/api-client openapi:export
pnpm --filter @dayflow/api-client generate
pnpm --filter @dayflow/api-client typecheck
```

Commit the spec and generated schema together with the Spring change.

## Usage

```ts
import { createDayFlowApiClient } from "@dayflow/api-client";

const api = createDayFlowApiClient({ baseUrl: process.env.NEXT_PUBLIC_DAYFLOW_API_BASE_URL! });

const { data, error, response } = await api.PUT("/api/v1/days/{dayId}/schedule", {
  params: { path: { dayId } },
  body: { startAt, endAt, timezone: "Asia/Seoul", expectedVersion: null },
});
```

`baseUrl` has no default. Web reads `NEXT_PUBLIC_DAYFLOW_API_BASE_URL`
(`apps/web/lib/api-client.ts`); mobile can pass its own value and `fetch`.

## Auth helpers (`src/auth`)

Hand-written, platform-neutral pieces shared by Web and Mobile (AUTH-001, AUTH-004). They wrap the generated
client through its `fetch` option; generated code is never edited.

- `createPkcePair` / `codeChallengeOf` — PKCE S256 with an injected crypto (WebCrypto or expo-crypto).
- `googleLoginStartUrl`, `parseAuthCallback`, `safeReturnTo` — the browser start URL and the `?code=` callback.
- `singleFlight` + `createAuthorizedFetch` — `Authorization: Bearer`, one shared refresh for concurrent 401s,
  one retry of the original request, then `onSessionExpired`.

Protected operations use the `bearerAuth` scheme; `/api/v1/auth/*` is public. `pnpm --filter @dayflow/api-client test`
runs the Vitest checks of these helpers.
