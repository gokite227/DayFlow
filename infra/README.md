# DayFlow infra

Local PostgreSQL for development, the Google login setup, and the environment the API server needs.
Nothing here is deployed automatically yet.

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

## 3. Server environment (next step: deploy)

The API image is built from `services/api/Dockerfile` and runs with `SPRING_PROFILES_ACTIVE=prod`.
`ProductionConfigValidator` stops the start when an auth value is missing or unsafe.

| Variable | Required | Example / rule |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | yes | `prod` (set by the Dockerfile) |
| `SPRING_DATASOURCE_URL` | yes | `jdbc:postgresql://<host>:5432/dayflow` |
| `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` | yes | database credentials (secret) |
| `DAYFLOW_PUBLIC_BASE_URL` | yes | `https://api.dayflow.app` — https, JWT issuer and Google callback base |
| `DAYFLOW_WEB_URL` | yes | `https://dayflow.app` — Web login callback `<url>/auth/callback` |
| `DAYFLOW_ALLOWED_WEB_ORIGINS` | yes | `https://dayflow.app` (comma-separated, https only) — CORS; cookie refresh checks Origin |
| `DAYFLOW_MOBILE_REDIRECT_URI` | no | `dayflow://auth/callback` (default) |
| `DAYFLOW_JWT_SECRET` | yes | ≥ 32 random bytes (secret), e.g. `openssl rand -base64 48`; changing it signs everyone out within 15 minutes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | OAuth Web client (secret) |
| `DAYFLOW_REFRESH_COOKIE_SECURE` | no | `true` (default; must stay true) |
| `DAYFLOW_REFRESH_COOKIE_SAME_SITE` | no | `Lax` (default) when Web and API share a site (`dayflow.app` / `api.dayflow.app`); `None` only if they are different sites |
| `DAYFLOW_DEV_LOGIN_ENABLED` | no | must be unset or `false` (the prod profile refuses `true`) |

Operational notes:

- Health check: `GET /actuator/health` (public, no details). The OpenAPI document and Swagger UI are
  disabled in `prod`.
- TLS terminates at the platform's proxy; `server.forward-headers-strategy=framework` trusts
  `X-Forwarded-*`. The Google login keeps a short server session between `/api/v1/auth/google/start` and
  Google's callback, so with several instances the load balancer needs sticky sessions for those paths (or
  run a single instance first).
- Flyway runs on start against the production database; a fresh database migrates V1 → V8.
- No secret is committed: `.env` files are git-ignored and `.env.example` files hold placeholders only.
