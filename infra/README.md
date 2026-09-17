# DayFlow infra

Local PostgreSQL for development, the Google login setup, and the production deployment (Railway API +
PostgreSQL, Vercel Web). Nothing is deployed automatically from this repository.

## 1. Local database

```bash
cp infra/.env.example infra/.env
```

Set `POSTGRES_PASSWORD` in `infra/.env`, then:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

The API's `local` profile (default) reads the same `infra/.env` when started from `services/api`:

```bash
cd services/api && ./mvnw spring-boot:run
```

Flyway applies `V1` … `V8` on start. `V8__users_auth_and_ownership.sql` introduces users and per-user
ownership and **empties the single-user development data** (goals, days, tags, events, categories, reviews,
recovery). There is no legacy owner: after V8 every user starts empty and gets the six default Event
Categories on the first Google sign-in.

### Reset the local database (start from V1 again)

Deletes everything in the local database, including users. Either drop the schema inside the running
container:

```bash
docker exec -i dayflow-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "drop schema public cascade; create schema public;"'
```

or remove the Docker volume and recreate the container:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down -v
```

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

Start the API again; Flyway migrates the empty database V1 → V8.

## 2. Google Cloud (Google login)

Google authentication runs on the API server only (Spring Security OAuth2 Login). Web and Mobile never
see the client secret; they open `GET /api/v1/auth/google/start` in a browser and later exchange a one-time
code (PKCE) for DayFlow tokens.

1. **Create a project** — <https://console.cloud.google.com/> → project selector → New project (e.g.
   `dayflow`).
2. **OAuth consent screen** — APIs & Services → OAuth consent screen (Google Auth Platform → Branding /
   Audience / Data access):
   - User type **External**, app name `DayFlow`, support email, developer contact email.
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (no sensitive scopes).
   - While the app is in **Testing**, add your Google accounts under **Test users**; only they can sign in.
     Publish the app before real users sign in.
3. **Create the OAuth client** — APIs & Services → Credentials → Create credentials → OAuth client ID →
   Application type **Web application** (also for Mobile: the redirect goes to the API, not to the app).
4. **Authorized redirect URIs** — exactly `<DAYFLOW_PUBLIC_BASE_URL>/login/oauth2/code/google`:
   - Local: `http://localhost:8080/login/oauth2/code/google`
   - Production (after the server exists): `https://<api host>/login/oauth2/code/google`
   Authorized JavaScript origins are not needed (the browser never calls Google from JavaScript).
5. **Local secrets** — copy the Client ID and Client secret into `infra/.env` (git-ignored):
   `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...`, then restart the API.
6. **Production** — after deploying, add the production redirect URI from step 4 to the same client (or a
   separate production client) and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` as server secrets.

Google does not accept a private LAN IP (e.g. `http://192.168.0.10:8080`) as a redirect URI. A phone can
therefore only complete Google login against a public HTTPS API (a deployed server or an HTTPS tunnel whose
URL is `DAYFLOW_PUBLIC_BASE_URL` and is registered in step 4). Web on the same computer works with
`http://localhost:8080`.

### Check a real Google login locally (Web)

1. `infra/.env` has `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; your Google account is a test user.
2. Start the database, the API (`./mvnw spring-boot:run` in `services/api`) and the Web
   (`pnpm --filter @dayflow/web dev`).
3. Open `http://localhost:3000/goals` → login screen → **Google로 계속하기** → Google account → back on
   `/goals` signed in. The address bar never shows a token (the callback only has `?code=` and is replaced).
4. Reload the page → still signed in (refresh cookie `dayflow_refresh`, HttpOnly, path `/api/v1/auth`).
5. Settings → avatar, name, email → **로그아웃** → login screen; reload → still signed out.
6. Sign in with a second Google test account → none of the first account's Goals/Days/Events are visible.

## 3. Production (Railway API + PostgreSQL, Vercel Web)

```
Vercel  https://<web-host>             Next.js Web (apps/web)
  │  Bearer API calls ─────────────────┐   refresh-cookie calls /api/v1/auth/{exchange,refresh,logout}
  │  (browser → API directly)          │   go to the Web origin and are rewritten to the API
  ▼                                    ▼
Railway https://<api-host>             Spring API (services/api/Dockerfile, profile prod)
  │  private network (postgres.railway.internal)
  ▼
Railway PostgreSQL                     empty database, Flyway V1 → V8 on first start
Mobile (Android/iOS) → https://<api-host> directly
Google OAuth: Web/Mobile → API /api/v1/auth/google/start → Google → API /login/oauth2/code/google
              → https://<web-host>/auth/callback  or  dayflow://auth/callback
```

Why the Web proxies the cookie endpoints: `*.vercel.app` and `*.up.railway.app` are different sites, so a
cookie set by the API origin is a third-party cookie. Safari and Firefox block (or partition) those by
default, and `SameSite=Lax` cookies are not sent on cross-site `fetch` POSTs at all. Through the rewrite in
`apps/web/next.config.ts` the refresh cookie is first-party on the Web origin and keeps
`HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`. Leave `DAYFLOW_REFRESH_COOKIE_SAME_SITE` at `Lax`.

### 3.1 Railway API variables

Service variables of the API service (names are exactly what the code reads). `${{Postgres.…}}` are Railway
reference variables to the PostgreSQL service named `Postgres`; they use the private network.

| Variable | Value |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `prod` (also the Dockerfile default) |
| `PORT` | `8080` (the app, the health check and the domain target port use it) |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}` |
| `SPRING_DATASOURCE_USERNAME` | `${{Postgres.PGUSER}}` |
| `SPRING_DATASOURCE_PASSWORD` | `${{Postgres.PGPASSWORD}}` |
| `DAYFLOW_PUBLIC_BASE_URL` | `https://<api-host>` — the Railway domain, no trailing slash |
| `DAYFLOW_WEB_URL` | `https://<web-host>` — the Vercel production domain |
| `DAYFLOW_ALLOWED_WEB_ORIGINS` | `https://<web-host>` — exact origin(s), comma-separated, never `*` |
| `DAYFLOW_JWT_SECRET` | secret, ≥ 32 random bytes (below) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | secret, from Google Cloud |
| `JAVA_TOOL_OPTIONS` | recommended `-Xmx256m -XX:+UseSerialGC -Xss512k` (see Memory) |

Leave unset (defaults are the production values): `DAYFLOW_MOBILE_REDIRECT_URI` (`dayflow://auth/callback`),
`DAYFLOW_REFRESH_COOKIE_SECURE` (`true`), `DAYFLOW_REFRESH_COOKIE_SAME_SITE` (`Lax`),
`DAYFLOW_DEV_LOGIN_ENABLED` (`false`; the prod profile refuses `true`).

Generate the JWT secret without printing it (copies to the clipboard):

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) | Set-Clipboard
```

or `openssl rand -base64 48`. Paste it only into Railway. Changing it later signs everyone out within 15 minutes.

### 3.2 Vercel Web settings and variables

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` (keep "include files outside the root directory" enabled; the app imports `packages/*`) |
| Framework Preset | Next.js (build `next build` from `apps/web/package.json`) |
| Install / Build Command | defaults (`pnpm install` in the workspace, `pnpm run build`) |
| Node.js Version | 24.x |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` — uses `packageManager: pnpm@11.19.0` of the root `package.json` (Vercel's built-in pnpm stops at 10) |
| `NEXT_PUBLIC_DAYFLOW_API_BASE_URL` | `https://<api-host>` — public, inlined at build time; also the rewrite target, so redeploy after changing it |

Never put `GOOGLE_CLIENT_SECRET`, `DAYFLOW_JWT_SECRET` or database values into Vercel. Do not set
`NEXT_PUBLIC_DAYFLOW_DEV_LOGIN`. Preview deployments get other hostnames that are not in
`DAYFLOW_ALLOWED_WEB_ORIGINS`, so login is only expected to work on the production domain.

### 3.3 Order of the first deployment

1. Railway: create the API service from GitHub, set Root Directory `/services/api` and config file
   `/services/api/railway.json`, add PostgreSQL, generate the public domain (target port 8080).
2. Vercel: import the repository with the settings above and `NEXT_PUBLIC_DAYFLOW_API_BASE_URL=https://<api-host>`,
   deploy, note the production domain.
3. Railway: fill every variable of 3.1 with both domains, deploy, open `https://<api-host>/actuator/health`
   (`{"groups":["liveness","readiness"],"status":"UP"}`). Until the variables are complete the API stops at
   start on purpose (`Unsafe production configuration` in the deploy logs).
4. Google Cloud: add `https://<api-host>/login/oauth2/code/google` (§2 step 4) and the test users.
5. Check in the browser: Web login, reload keeps the session, data isolation between two accounts.

Expected database state: after the first Google sign-in `users=1`, `user_identities=1`, `event_categories=6`
and no goals/days/tags/events/reviews; after a second account `2 / 2 / 12`. Check it in Railway →
Postgres → Data (or Query):

```sql
select (select count(*) from users) users, (select count(*) from user_identities) identities,
       (select count(*) from event_categories) categories, (select max(version) from flyway_schema_history) flyway;
```

Mobile against production: set `EXPO_PUBLIC_DAYFLOW_API_BASE_URL=https://<api-host>` in `apps/mobile/.env`
(or the EAS build profile) and restart Metro with `--clear`; Google login returns to `dayflow://auth/callback`
(the API default). Local development is unchanged: without these variables the `local` profile, `infra/.env`,
`http://localhost:8080` and `http://localhost:3000` are used.

### 3.4 Operational notes

- Health check: `GET /actuator/health` (public, no details); `/actuator/*` otherwise needs a token.
  OpenAPI/Swagger are disabled in `prod`.
- TLS terminates at the platform; `server.forward-headers-strategy=framework` trusts `X-Forwarded-*`. The
  short Google login session cookie is `Secure; HttpOnly; SameSite=Lax` in `prod`. With several API instances
  those login paths need sticky sessions; run one instance.
- Flyway runs at start (Railway's private network is not available during the Docker build).
- Memory: measured locally with a 512 MB container limit, the API used ~330 MB idle and ~360 MB after 3,000
  requests, without OOM. The image default `-XX:MaxRAMPercentage=75` lets the heap grow to ~384 MB on 512 MB,
  which plus ~110 MB non-heap leaves almost no margin, and on a large memory limit it lets the heap grow (and
  bill) further. `JAVA_TOOL_OPTIONS=-Xmx256m -XX:+UseSerialGC -Xss512k` caps it.
- The Docker build context is `services/api` only; `.dockerignore` excludes `target`, `src/test` and any
  `.env*`/key files. No secret is committed: `.env` files are git-ignored and `.env.example` files hold
  placeholders only.